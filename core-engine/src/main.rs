//! CineSense core-engine
//! ─────────────────────
//! High-performance Rust layer for high-frequency multi-modal data streams:
//!   1. CAPTURE  — from a webcam (feature "opencv"), a JSONL replay file, or
//!                 the built-in physiologically-plausible simulator.
//!   2. FUSE     — the emotion_agent normalizes + fuses signals into
//!                 valence/arousal/engagement and circumplex emotion labels
//!                 (identical math to the orchestrator's TS agent).
//!   3. SHIP     — batches of raw samples are POSTed to the orchestrator's
//!                 /internal/ingest endpoint (shared internal key), which
//!                 rebroadcasts fused frames to the live dashboard.
//!
//! Run:
//!   cargo run --release -- --mode simulate --session-id my-session
//!   cargo run --release -- --mode jsonl --stream-path ./stream.jsonl
//!   cargo run --release --features opencv -- --mode camera

mod emotion_agent;
mod fusion;
mod sources;
mod transport;
mod types;

use anyhow::{Context, Result};
use clap::Parser;
use std::time::Duration;

/// CineSense core-engine: real-time multi-modal emotion stream processor
#[derive(Parser, Debug)]
#[command(name = "cinesense-agent", version)]
struct Args {
    /// Base URL of the CineSense orchestrator (Node.js server)
    #[arg(long, default_value = "http://localhost:4000")]
    api_url: String,

    /// Shared internal API key (must match the orchestrator's INTERNAL_API_KEY)
    #[arg(long, default_value = "dev-internal-key")]
    internal_key: String,

    /// Session id samples are attributed to (create one in the dashboard first)
    #[arg(long, default_value = "engine-demo")]
    session_id: String,

    /// Input source: simulate | jsonl | camera (camera needs feature "opencv")
    #[arg(long, default_value = "simulate")]
    mode: String,

    /// Path to a JSONL file of SignalSample objects (for --mode jsonl)
    #[arg(long)]
    stream_path: Option<String>,

    /// Sampling interval in milliseconds
    #[arg(long, default_value_t = 1000)]
    interval_ms: u64,

    /// Flush a batch to the orchestrator every N samples
    #[arg(long, default_value_t = 4)]
    batch_size: usize,

    /// Stop after N samples have been shipped (0 = run until interrupted)
    #[arg(long, default_value_t = 0)]
    max_samples: u64,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();
    tracing::info!(
        mode = %args.mode,
        api = %args.api_url,
        session = %args.session_id,
        "cinesense core-engine starting"
    );

    let transport = transport::Transport::new(&args.api_url, &args.internal_key);

    // Fail fast (but non-fatally) if the orchestrator is not up yet.
    match transport.check_health().await {
        Ok(store) => tracing::info!(store = %store, "orchestrator healthy"),
        Err(e) => tracing::warn!("orchestrator health check failed: {e:#} — retrying per batch"),
    }

    let mut rx = sources::spawn(
        &args.mode,
        args.stream_path.as_deref(),
        Duration::from_millis(args.interval_ms),
    )
    .await
    .context("failed to start stream source")?;

    let mut aggregator = fusion::Aggregator::new(30);
    let mut batch: Vec<types::SignalSample> = Vec::with_capacity(args.batch_size.max(1));
    let mut shipped: u64 = 0;

    while let Some(sample) = rx.recv().await {
        let frame = emotion_agent::fuse(&sample, &args.mode);
        aggregator.push(frame);

        if let Some(state) = aggregator.state() {
            tracing::info!(
                dominant = %state.dominant,
                valence = format!("{:.2}", state.valence),
                arousal = format!("{:.2}", state.arousal),
                engagement = format!("{:.2}", state.engagement),
                window = state.samples,
                "fused emotional state"
            );
        }

        batch.push(sample);
        if batch.len() >= args.batch_size.max(1) {
            let payload = transport::IngestPayload {
                session_id: args.session_id.clone(),
                agent: format!("rust-engine:{}", args.mode),
                samples: batch.clone(),
            };
            match transport.ingest(&payload).await {
                Ok(()) => {
                    shipped += batch.len() as u64;
                    tracing::debug!(shipped, "batch accepted by orchestrator");
                }
                Err(e) => tracing::warn!("ingest failed: {e:#}"),
            }
            batch.clear();

            if args.max_samples > 0 && shipped >= args.max_samples {
                tracing::info!(shipped, "max samples reached — exiting");
                break;
            }
        }
    }

    tracing::info!(shipped, "core-engine stopped");
    Ok(())
}
