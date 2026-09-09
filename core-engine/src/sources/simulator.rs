//! Synthetic biometric stream — physiologically-plausible signals with a slow
//! drift between calm-warm and tense-negative states (a sine "episode" cycle),
//! so the whole pipeline can run anywhere without hardware.

use std::time::Duration;
use tokio::sync::mpsc;

use crate::emotion_agent::clamp;
use crate::types::{Audio, Facial, Gaze, Motion, SignalSample};

/// Tiny xorshift PRNG — zero dependencies, good enough for jitter.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Self(seed ^ 0x9E37_79B9_7F4A_7C15)
    }
    /// Uniform in [0, 1).
    fn next_unit(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        (x % 1_000_000) as f64 / 1_000_000.0
    }
}

fn jitter(rng: &mut Rng) -> f64 {
    rng.next_unit() * 0.08
}

pub fn spawn(interval: Duration) -> mpsc::Receiver<SignalSample> {
    let (tx, rx) = mpsc::channel::<SignalSample>(32);
    tokio::spawn(async move {
        let mut rng = Rng::new(0xC1NE_5E5E);
        let mut i: u64 = 0;
        loop {
            let t = (i % 24) as f64 / 23.0; // episode progress 0..1
            let wave = (t * std::f64::consts::PI).sin(); // calm → tense → calm

            let sample = SignalSample {
                ts: Some(crate::types::now_ms()),
                heart_rate: Some((62.0 + wave * 42.0 + rng.next_unit() * 4.0).round()),
                hrv: Some((80.0 - wave * 46.0 + rng.next_unit() * 6.0).round()),
                skin_conductance: Some(2.0 + wave * 5.0 + rng.next_unit() * 0.4),
                resp_rate: Some(12.0 + wave * 8.0),
                facial: Some(Facial {
                    happy: Some(clamp(0.5 - wave * 0.45 + jitter(&mut rng), 0.0, 1.0)),
                    sad: Some(clamp(0.04 + wave * 0.5 + jitter(&mut rng), 0.0, 1.0)),
                    angry: Some(clamp(wave * 0.35 + jitter(&mut rng) * 3.0, 0.0, 1.0)),
                    surprised: Some(clamp(0.08 + jitter(&mut rng) * 2.0, 0.0, 1.0)),
                    fearful: Some(clamp(wave * 0.25 + jitter(&mut rng), 0.0, 1.0)),
                    disgust: Some(clamp(wave * 0.2, 0.0, 1.0)),
                    neutral: Some(0.25),
                }),
                gaze: Some(Gaze {
                    fixation_rate: Some(clamp(0.5 + wave * 0.45, 0.0, 1.0)),
                    blink_rate: Some(17.0 - wave * 10.0 + rng.next_unit() * 3.0),
                    pupil_dilation: Some(clamp(0.28 + wave * 0.55, 0.0, 1.0)),
                }),
                motion: Some(Motion {
                    motion_energy: Some(clamp(wave * 0.6 + jitter(&mut rng), 0.0, 1.0)),
                    frame_variance: Some(0.15 + wave * 0.2),
                }),
                audio: Some(Audio {
                    rms: Some(clamp(wave * 0.42 + 0.04, 0.0, 1.0)),
                    spectral_centroid: Some(clamp(0.45 + wave * 0.25, 0.0, 1.0)),
                    speech_rate: Some(2.2 + wave * 2.0),
                }),
                heatmap: None,
            };

            if tx.send(sample).await.is_err() {
                break; // consumer gone — engine shutting down
            }
            i += 1;
            tokio::time::sleep(interval).await;
        }
    });
    rx
}
