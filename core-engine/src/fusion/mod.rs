//! Fusion — rolling-window aggregation over fused EmotionFrames (the
//! "PerceiverIO data prep" layer): maintains a sliding window per engine
//! instance and derives the stable window state used for logging/decisions.

use crate::types::EmotionFrame;
use std::collections::VecDeque;
use std::time::{Duration, Instant};

pub struct WindowState {
    pub dominant: String,
    pub valence: f64,
    pub arousal: f64,
    pub engagement: f64,
    pub samples: usize,
}

pub struct Aggregator {
    window: VecDeque<(Instant, EmotionFrame)>,
    window_len: Duration,
}

impl Aggregator {
    pub fn new(window_secs: u64) -> Self {
        Self {
            window: VecDeque::new(),
            window_len: Duration::from_secs(window_secs),
        }
    }

    pub fn push(&mut self, frame: EmotionFrame) {
        let now = Instant::now();
        while let Some((ts, _)) = self.window.front() {
            if now.duration_since(*ts) > self.window_len {
                self.window.pop_front();
            } else {
                break;
            }
        }
        self.window.push_back((now, frame));
    }

    pub fn len(&self) -> usize {
        self.window.len()
    }

    pub fn is_empty(&self) -> bool {
        self.window.is_empty()
    }

    /// Stable aggregate over the window: means + dominant (top-weighted) label.
    pub fn state(&self) -> Option<WindowState> {
        if self.window.is_empty() {
            return None;
        }
        let n = self.window.len() as f64;
        let valence = self.window.iter().map(|(_, f)| f.valence).sum::<f64>() / n;
        let arousal = self.window.iter().map(|(_, f)| f.arousal).sum::<f64>() / n;
        let engagement = self.window.iter().map(|(_, f)| f.engagement).sum::<f64>() / n;

        // Accumulate label weights across the window.
        let mut acc: Vec<(String, f64)> = Vec::new();
        for (_, f) in &self.window {
            for l in &f.labels {
                if let Some(entry) = acc.iter_mut().find(|(e, _)| *e == l.emotion) {
                    entry.1 += l.weight;
                } else {
                    acc.push((l.emotion.clone(), l.weight));
                }
            }
        }
        acc.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let dominant = acc
            .first()
            .map(|(name, _)| name.clone())
            .unwrap_or_else(|| "neutral".to_string());

        Some(WindowState {
            dominant,
            valence,
            arousal,
            engagement,
            samples: self.window.len(),
        })
    }
}
