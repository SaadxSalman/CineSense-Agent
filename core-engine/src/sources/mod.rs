//! Stream sources — producers of raw `SignalSample`s.
//!   * simulator: synthetic but physiologically-plausible drift (default)
//!   * jsonl:     replay a JSONL file of samples (one JSON object per line)
//!   * camera:    real webcam capture via OpenCV (feature = "opencv")

pub mod simulator;

use anyhow::{bail, Context, Result};
use std::time::Duration;
use tokio::sync::mpsc;

use crate::types::SignalSample;

pub type SampleRx = mpsc::Receiver<SignalSample>;

pub async fn spawn(
    mode: &str,
    stream_path: Option<&str>,
    interval: Duration,
) -> Result<SampleRx> {
    match mode {
        "simulate" => Ok(simulator::spawn(interval)),
        "jsonl" => {
            let path = stream_path
                .context("--stream-path is required for --mode jsonl")?
                .to_string();
            spawn_jsonl(path, interval).await
        }
        #[cfg(feature = "opencv")]
        "camera" => spawn_camera(interval).await,
        #[cfg(not(feature = "opencv"))]
        "camera" => bail!(
            "camera mode requires the \"opencv\" feature: rebuild with `cargo build --release --features opencv`"
        ),
        other => bail!(
            "unknown mode \"{other}\" (expected simulate | jsonl | camera)"
        ),
    }
}

/// Replay a JSONL file: each line is one SignalSample JSON object.
/// Malformed lines are skipped with a warning; the file is paced at `interval`.
async fn spawn_jsonl(path: String, interval: Duration) -> Result<SampleRx> {
    let (tx, rx) = mpsc::channel::<SignalSample>(64);
    let content = tokio::fs::read_to_string(&path)
        .await
        .with_context(|| format!("cannot read stream file {path}"))?;

    tokio::spawn(async move {
        let mut ts_fallback = crate::types::now_ms();
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("//") {
                continue;
            }
            match serde_json::from_str::<SignalSample>(line) {
                Ok(mut sample) => {
                    if sample.ts.is_none() {
                        ts_fallback += interval.as_millis() as u64;
                        sample.ts = Some(ts_fallback);
                    }
                    if tx.send(sample).await.is_err() {
                        break; // consumer gone
                    }
                    tokio::time::sleep(interval).await;
                }
                Err(e) => {
                    tracing::warn!("skipping malformed line: {e}");
                }
            }
        }
        tracing::info!("jsonl stream exhausted");
    });
    Ok(rx)
}

/// Real webcam capture (requires the "opencv" feature and a system OpenCV 4).
/// Each tick: capture a frame → grayscale → resize to 8x8 → brightness grid
/// → motion energy vs the previous grid.
#[cfg(feature = "opencv")]
async fn spawn_camera(interval: Duration) -> Result<SampleRx> {
    use anyhow::Context as _;
    let (tx, rx) = mpsc::channel::<SignalSample>(8);
    // Camera capture is blocking — run it on the blocking thread pool.
    tokio::task::spawn_blocking(move || -> Result<()> {
        opencv_run(interval, tx)
    });
    Ok(rx)
}

#[cfg(feature = "opencv")]
fn opencv_run(
    interval: Duration,
    tx: tokio::sync::mpsc::Sender<SignalSample>,
) -> Result<()> {
    use opencv::{imgproc, prelude::*, videoio, core::Size};

    let mut cam = videoio::VideoCapture::new_default(0, videoio::CAP_ANY)
        .context("cannot open camera 0")?;
    let opened = cam.is_opened().context("camera probe failed")?;
    if !opened {
        bail!("camera 0 could not be opened");
    }

    let mut frame = opencv::core::Mat::default();
    let mut gray = opencv::core::Mat::default();
    let mut small = opencv::core::Mat::default();
    let mut prev: Option<Vec<f64>> = None;

    loop {
        cam.read(&mut frame).context("camera read failed")?;
        if frame.empty() {
            tracing::warn!("empty camera frame");
            std::thread::sleep(interval);
            continue;
        }
        imgproc::cvt_color(&frame, &mut gray, imgproc::COLOR_BGR2GRAY, 0)
            .context("grayscale conversion failed")?;
        imgproc::resize(
            &gray,
            &mut small,
            Size::new(8, 8),
            0.0,
            0.0,
            imgproc::INTER_LINEAR,
        )
        .context("resize failed")?;

        let mut grid = Vec::with_capacity(64);
        for r in 0..8usize {
            for c in 0..8usize {
                let px = *small
                    .at_2d::<u8>(r, c)
                    .context("pixel access failed")? as f64
                    / 255.0;
                grid.push(px);
            }
        }
        let mean = grid.iter().sum::<f64>() / 64.0;
        let centered: Vec<f64> = grid
            .iter()
            .map(|v| ((v - mean) * 2.2 + 0.5).clamp(0.0, 1.0))
            .collect();

        let motion_energy = match &prev {
            Some(p) => {
                let diff: f64 = centered.iter().zip(p.iter()).map(|(a, b)| (a - b).abs()).sum();
                (diff / 12.0).clamp(0.0, 1.0)
            }
            None => 0.0,
        };
        prev = Some(centered.clone());

        let sample = SignalSample {
            ts: Some(crate::types::now_ms()),
            heatmap: Some(centered),
            motion: Some(crate::types::Motion {
                motion_energy: Some(motion_energy),
                frame_variance: Some(0.1 + motion_energy * 0.3),
            }),
            gaze: Some(crate::types::Gaze {
                fixation_rate: Some((0.9 - motion_energy * 1.2).clamp(0.15, 1.0)),
                blink_rate: Some(14.0),
                pupil_dilation: None,
            }),
            ..Default::default()
        };
        if tx.blocking_send(sample).is_err() {
            break; // consumer gone
        }
        std::thread::sleep(interval);
    }
    Ok(())
}
