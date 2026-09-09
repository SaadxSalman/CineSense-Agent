//! Transport — HTTPS client that ships sample batches to the orchestrator's
//! internal ingest endpoint with retry + exponential backoff.

use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::time::Duration;

use crate::types::SignalSample;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestPayload {
    pub session_id: String,
    pub agent: String,
    pub samples: Vec<SignalSample>,
}

pub struct Transport {
    base: String,
    key: String,
    http: reqwest::Client,
}

impl Transport {
    pub fn new(base: &str, key: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(6))
            .build()
            .expect("reqwest client");
        Self {
            base: base.trim_end_matches('/').to_string(),
            key: key.to_string(),
            http,
        }
    }

    /// GET /healthz — returns the store kind the orchestrator reports.
    pub async fn check_health(&self) -> Result<String> {
        let res = self
            .http
            .get(format!("{}/healthz", self.base))
            .send()
            .await
            .context("orchestrator unreachable")?
            .error_for_status()
            .context("orchestrator health endpoint error")?;
        let v: serde_json::Value = res.json().await.context("health response not JSON")?;
        Ok(v.get("store")
            .and_then(|s| s.as_str())
            .unwrap_or("unknown")
            .to_string())
    }

    /// POST /internal/ingest with retries (250ms, 500ms backoff).
    pub async fn ingest(&self, payload: &IngestPayload) -> Result<()> {
        let url = format!("{}/internal/ingest", self.base);
        for attempt in 0..3u32 {
            match self
                .http
                .post(&url)
                .header("x-internal-key", &self.key)
                .json(payload)
                .send()
                .await
            {
                Ok(res) if res.status().is_success() => return Ok(()),
                Ok(res) => {
                    let status = res.status();
                    if attempt == 2 {
                        bail!("orchestrator rejected ingest: {status}");
                    }
                }
                Err(e) => {
                    if attempt == 2 {
                        return Err(e).context("ingest request failed");
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(250 * 2u64.pow(attempt))).await;
        }
        Ok(())
    }
}
