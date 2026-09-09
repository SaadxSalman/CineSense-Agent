//! Emotion Agent — biometric normalization + weighted fusion.
//!
//! Mirrors the TypeScript `emotionAgent.ts` on the orchestrator so the
//! pipeline behaves identically no matter which producer generated the
//! samples: normalize each signal to [0, 1] against physiological reference
//! ranges, fuse into valence/arousal in [-1, 1], project onto the Russell
//! circumplex for discrete labels, and synthesize a visualization heatmap.

use crate::types::{EmotionFrame, EmotionLabel, SignalSample};

pub const ANCHORS: [(&str, f64, f64); 13] = [
    ("excited", 0.55, 0.85),
    ("happy", 0.85, 0.5),
    ("content", 0.65, 0.1),
    ("relaxed", 0.45, -0.5),
    ("calm", 0.2, -0.75),
    ("sleepy", -0.35, -0.85),
    ("bored", -0.55, -0.45),
    ("sad", -0.8, -0.4),
    ("anxious", -0.5, 0.55),
    ("tense", -0.35, 0.8),
    ("alert", 0.1, 0.9),
    ("fearful", -0.7, 0.7),
    ("angry", -0.75, 0.85),
];

#[inline]
pub fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    x.max(lo).min(hi)
}

/// Linear normalization of x from [lo, hi] into [0, 1], clamped.
#[inline]
pub fn norm(x: f64, lo: f64, hi: f64) -> f64 {
    if (hi - lo).abs() < f64::EPSILON {
        return 0.5;
    }
    clamp((x - lo) / (hi - lo), 0.0, 1.0)
}

/// Softmax over negative squared distances — distances to circumplex anchors
/// become discrete-emotion weights.
pub fn softmax_dist(dists: &[f64], tau: f64) -> Vec<f64> {
    let scores: Vec<f64> = dists.iter().map(|d| -(d * d) / tau).collect();
    let max = scores.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let exps: Vec<f64> = scores.iter().map(|s| (s - max).exp()).collect();
    let sum = exps.iter().sum::<f64>().max(1e-12);
    exps.iter().map(|e| e / sum).collect()
}

fn r3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

/// Engagement-centered 8x8 blob widened by arousal, drifted by valence.
pub fn synthesize_heatmap(valence: f64, arousal: f64, engagement: f64) -> Vec<f64> {
    let v_n = (valence + 1.0) / 2.0;
    let a_n = (arousal + 1.0) / 2.0;
    let cx = 2.0 + v_n * 4.0;
    let cy = 2.0 + a_n * 4.0;
    let spread = 1.2 + a_n * 1.8;
    let mut grid = vec![0.0f64; 64];
    for r in 0..8usize {
        for c in 0..8usize {
            let dr = r as f64 - cy;
            let dc = c as f64 - cx;
            let d2 = dr * dr + dc * dc;
            let blob = (-(d2) / (2.0 * spread * spread)).exp();
            grid[r * 8 + c] = clamp(0.08 + 0.85 * engagement * blob, 0.0, 1.0);
        }
    }
    grid
}

/// Fuse one multi-modal sample into an emotion frame.
pub fn fuse(sample: &SignalSample, source: &str) -> EmotionFrame {
    let ts = sample.ts.unwrap_or_else(crate::types::now_ms);

    /* ── Arousal: physiological + behavioral activation ── */
    let mut a_parts: Vec<(f64, f64)> = Vec::new();
    if let Some(hr) = sample.heart_rate {
        a_parts.push((norm(hr, 55.0, 120.0), 0.3));
    }
    if let Some(motion) = &sample.motion {
        if let Some(me) = motion.motion_energy {
            a_parts.push((me, 0.2));
        }
    }
    if let Some(audio) = &sample.audio {
        if let Some(rms) = audio.rms {
            a_parts.push((norm(rms, 0.0, 0.5), 0.15));
        }
    }
    if let Some(gaze) = &sample.gaze {
        if let Some(br) = gaze.blink_rate {
            a_parts.push((1.0 - norm(br, 4.0, 25.0), 0.15)); // few blinks → activation
        }
    }
    if let Some(sc) = sample.skin_conductance {
        a_parts.push((norm(sc, 0.5, 8.0), 0.2));
    }
    if let Some(rr) = sample.resp_rate {
        a_parts.push((norm(rr, 8.0, 28.0), 0.1));
    }
    if let Some(facial) = &sample.facial {
        if let Some(surprised) = facial.surprised {
            a_parts.push((surprised * 0.7, 0.1));
        }
    }
    let a_w = a_parts.iter().map(|p| p.1).sum::<f64>();
    let arousal_raw = if a_w > 0.0 {
        a_parts.iter().map(|p| p.0 * p.1).sum::<f64>() / a_w
    } else {
        0.5
    };
    let arousal = clamp(arousal_raw * 2.0 - 1.0, -1.0, 1.0);

    /* ── Valence: affective tone ── */
    let mut v_parts: Vec<(f64, f64)> = Vec::new();
    if let Some(facial) = &sample.facial {
        let positive = facial.happy.unwrap_or(0.0) + facial.surprised.unwrap_or(0.0) * 0.35;
        let negative = facial.sad.unwrap_or(0.0)
            + facial.angry.unwrap_or(0.0)
            + facial.fearful.unwrap_or(0.0)
            + facial.disgust.unwrap_or(0.0);
        let affect = (2.2 * (positive - negative)).tanh();
        v_parts.push((affect, 0.55));
    }
    if let Some(hrv) = sample.hrv {
        v_parts.push((norm(hrv, 20.0, 90.0), 0.25)); // high HRV ↔ calm positive
    }
    if let Some(gaze) = &sample.gaze {
        if let Some(fr) = gaze.fixation_rate {
            v_parts.push((norm(fr, 0.2, 0.95) * 0.5, 0.2));
        }
    }
    if let Some(audio) = &sample.audio {
        if let Some(cent) = audio.spectral_centroid {
            v_parts.push(((cent - 0.5) * 0.4, 0.1));
        }
    }
    let v_w = v_parts.iter().map(|p| p.1).sum::<f64>();
    let valence = if v_w > 0.0 {
        clamp(v_parts.iter().map(|p| p.0 * p.1).sum::<f64>() / v_w, -1.0, 1.0)
    } else {
        0.0
    };

    /* ── Engagement ── */
    let mut eng_parts: Vec<f64> = Vec::new();
    if let Some(gaze) = &sample.gaze {
        if let Some(fr) = gaze.fixation_rate {
            eng_parts.push(norm(fr, 0.2, 0.95));
        }
        if let Some(br) = gaze.blink_rate {
            eng_parts.push(1.0 - norm(br, 4.0, 25.0));
        }
    }
    if let Some(motion) = &sample.motion {
        if let Some(me) = motion.motion_energy {
            eng_parts.push(1.0 - me * 0.5);
        }
    }
    let engagement = if eng_parts.is_empty() {
        0.5
    } else {
        clamp(eng_parts.iter().sum::<f64>() / eng_parts.len() as f64, 0.0, 1.0)
    };

    /* ── Circumplex labels ── */
    let dists: Vec<f64> = ANCHORS
        .iter()
        .map(|(_, v, a)| ((valence - v).powi(2) + (arousal - a).powi(2)).sqrt())
        .collect();
    let weights = softmax_dist(&dists, 0.35);
    let mut labels: Vec<EmotionLabel> = ANCHORS
        .iter()
        .zip(weights.iter())
        .map(|((name, _, _), w)| EmotionLabel {
            emotion: (*name).to_string(),
            weight: r3(*w),
        })
        .collect();
    labels.sort_by(|a, b| {
        b.weight
            .partial_cmp(&a.weight)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    labels.truncate(5);

    /* ── Heatmap: vision-provided or agent-synthesized ── */
    let heatmap = match &sample.heatmap {
        Some(h) if h.len() == 64 => h.clone(),
        _ => synthesize_heatmap(valence, arousal, engagement),
    };

    EmotionFrame {
        ts,
        source: source.to_string(),
        valence: r3(valence),
        arousal: r3(arousal),
        engagement: r3(engagement),
        labels,
        heatmap,
    }
}


