//! Shared multi-modal sample types (serde wire format matches the
//! orchestrator's `SignalSample` zod schema exactly — camelCase fields).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Facial {
    pub happy: Option<f64>,
    pub sad: Option<f64>,
    pub angry: Option<f64>,
    pub surprised: Option<f64>,
    pub fearful: Option<f64>,
    pub disgust: Option<f64>,
    pub neutral: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Gaze {
    pub fixation_rate: Option<f64>,
    pub blink_rate: Option<f64>,
    pub pupil_dilation: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Motion {
    pub motion_energy: Option<f64>,
    pub frame_variance: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Audio {
    pub rms: Option<f64>,
    pub spectral_centroid: Option<f64>,
    pub speech_rate: Option<f64>,
}

/// One multi-modal observation. Every field is optional; the emotion agent
/// re-weights its fusion around whatever is actually present.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SignalSample {
    pub ts: Option<u64>,
    pub heart_rate: Option<f64>,
    pub hrv: Option<f64>,
    pub skin_conductance: Option<f64>,
    pub resp_rate: Option<f64>,
    pub facial: Option<Facial>,
    pub gaze: Option<Gaze>,
    pub motion: Option<Motion>,
    pub audio: Option<Audio>,
    /// 8x8 normalized heat grid from the vision layer (row-major, 64 values)
    pub heatmap: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmotionLabel {
    pub emotion: String,
    pub weight: f64,
}

/// Fused emotional state for one instant (output of the emotion agent).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmotionFrame {
    pub ts: u64,
    pub source: String,
    pub valence: f64,
    pub arousal: f64,
    pub engagement: f64,
    pub labels: Vec<EmotionLabel>,
    pub heatmap: Vec<f64>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
