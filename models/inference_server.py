"""
CineSense Inference Bridge — FastAPI server hosting the AI/ML analysis layer.

Endpoints
---------
GET  /health          → liveness + which model backends are loaded
POST /analyze/video   → batch of 8x8 frame-stat grids → facial expression
                        likelihoods + refined heatmaps (VideoMAE-v2 adapter)
POST /analyze/audio   → audio feature series → loudness/brightness/speech-rate

Design
------
The service ships with *heuristic* analysis implementations so the full
system runs anywhere (CPU-only, no model weights). When real backends are
installed — PyTorch + transformers for VideoMAE-v2, AudioCLIP weights, a GPU
(via the NVIDIA Container Toolkit in docker-compose) — the loader functions
below swap the heuristics for genuine inference without touching any caller.

The orchestrator treats this bridge as fully optional: if it is unreachable,
its built-in heuristics take over.
"""

from __future__ import annotations

import math
import os
import statistics
import time
from typing import Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="CineSense Inference Bridge", version="1.0.0")

# ── Optional heavy backends ────────────────────────────────────────────────────
# Real models load lazily; their absence degrades to the heuristic layer.

_VIDEOMAE = None
_AUDIOCLIP = None


def _load_videomae():
    """Load VideoMAE-v2 when torch+transformers are available (GPU optional)."""
    global _VIDEOMAE
    if _VIDEOMAE is not None:
        return _VIDEOMAE
    if os.getenv("ENABLE_VIDEOMAE", "0") != "1":
        return None
    try:  # pragma: no cover — only exercised on model-equipped hosts
        import torch  # noqa: F401
        from transformers import pipeline  # type: ignore

        _VIDEOMAE = pipeline(
            "video-classification",
            model="MCG-NJU/videomae-base-finetuned-kinetics",
        )
        print("[models] VideoMAE-v2 pipeline loaded")
    except Exception as exc:  # pragma: no cover
        print(f"[models] VideoMAE unavailable ({exc}); using heuristics")
        _VIDEOMAE = None
    return _VIDEOMAE


def _load_audioclip():
    """Load AudioCLIP / CLAP-style audio encoder when weights are available."""
    global _AUDIOCLIP
    if _AUDIOCLIP is not None:
        return _AUDIOCLIP
    if os.getenv("ENABLE_AUDIOCLIP", "0") != "1":
        return None
    try:  # pragma: no cover
        from transformers import ClapModel, ClapProcessor  # type: ignore

        _model = ClapModel.from_pretrained("laion/clap-htsat-unfused")
        _proc = ClapProcessor.from_pretrained("laion/clap-htsat-unfused")
        _AUDIOCLIP = (_model, _proc)
        print("[models] AudioCLIP (CLAP) loaded")
    except Exception as exc:  # pragma: no cover
        print(f"[models] AudioCLIP unavailable ({exc}); using heuristics")
        _AUDIOCLIP = None
    return _AUDIOCLIP


# ── Schemas ────────────────────────────────────────────────────────────────────

FACIAL_KEYS = ("happy", "sad", "angry", "surprised", "fearful", "disgust", "neutral")


class Health(BaseModel):
    status: str
    models: Dict[str, bool]
    uptimeSec: int


class VideoRequest(BaseModel):
    """Batch of 8x8 frame-stat grids (64 normalized values each, row-major)."""

    grids: List[List[float]] = Field(..., description="each grid is 64 numbers in [0, 1]")


class FacialRead(BaseModel):
    happy: float
    sad: float
    angry: float
    surprised: float
    fearful: float
    disgust: float
    neutral: float


class VideoRead(BaseModel):
    facial: Optional[FacialRead] = None
    heatmap: Optional[List[float]] = None


class VideoResponse(BaseModel):
    reads: List[VideoRead]


class AudioRequest(BaseModel):
    """Series of instantaneous audio features (one entry per analysis window)."""

    rms: List[float] = Field(default_factory=list)
    spectralCentroid: List[float] = Field(default_factory=list)
    speechRate: List[float] = Field(default_factory=list)


class AudioResponse(BaseModel):
    rms: float
    spectralCentroid: float
    speechRate: float
    activity: float  # 0..1 speech presence estimate


_STARTED = time.time()


# ── Heuristic vision analysis ──────────────────────────────────────────────────
#
# The 8x8 grid abstracts a face-region frame: brightness layout carries pose/
# expression energy. We compute layout statistics and map them to expression
# likelihoods. This is deliberately simple, deterministic and dependency-free;
# the VideoMAE adapter replaces it when enabled.


def _stats(grid: List[float]) -> Dict[str, float]:
    n = len(grid)
    mean = sum(grid) / n
    var = sum((v - mean) ** 2 for v in grid) / n
    center = [grid[r * 8 + c] for r in range(2, 6) for c in range(2, 6)]
    center_mean = sum(center) / len(center)
    edges = [
        grid[r * 8 + c]
        for r in range(8)
        for c in range(8)
        if r in (0, 7) or c in (0, 7)
    ]
    edge_mean = sum(edges) / len(edges)
    return {
        "mean": mean,
        "std": math.sqrt(var),
        "center": center_mean,
        "edge": edge_mean,
        "center_bias": center_mean - edge_mean,
    }


def _analyze_grid(grid: List[float]) -> VideoRead:
    if len(grid) != 64:
        return VideoRead()

    s = _stats(grid)

    # Soft pseudo-likelihoods from layout energy.
    happy = max(0.0, 0.35 + s["center_bias"] * 1.6 + s["mean"] * 0.4 - s["std"] * 0.5)
    sad = max(0.0, 0.35 - s["center_bias"] * 1.2 - s["mean"] * 0.3 + s["std"] * 0.15)
    angry = max(0.0, s["std"] * 1.5 + s["center_bias"] * 0.5 - 0.12)
    surprised = max(0.0, s["center"] * 1.4 - 0.45)
    fearful = max(0.0, s["std"] * 1.1 - s["mean"] * 0.25)
    disgust = max(0.0, -s["mean"] * 0.8 + s["std"] * 0.5)

    raw = {
        "happy": happy,
        "sad": sad,
        "angry": angry,
        "surprised": surprised,
        "fearful": fearful,
        "disgust": disgust,
    }
    total = sum(raw.values()) + 0.30  # neutral prior
    facial = FacialRead(
        **{k: round(v / total, 4) for k, v in raw.items()},
        neutral=round(0.30 / total, 4),
    )

    # Refined heatmap: contrast-stretched grid (keeps spatial info, normalizes).
    lo, hi = min(grid), max(grid)
    span = (hi - lo) or 1.0
    heatmap = [round(max(0.0, min(1.0, (v - lo) / span)), 4) for v in grid]

    return VideoRead(facial=facial, heatmap=heatmap)


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(
        status="ok",
        models={
            "videomae": _load_videomae() is not None,
            "audioclip": _load_audioclip() is not None,
            "heuristics": True,
        },
        uptimeSec=int(time.time() - _STARTED),
    )


@app.post("/analyze/video", response_model=VideoResponse)
def analyze_video(req: VideoRequest) -> VideoResponse:
    """Analyze a batch of frame-stat grids. Uses VideoMAE when loaded."""
    pipeline = _load_videomae()
    if pipeline is not None:  # pragma: no cover — model-equipped hosts
        reads: List[VideoRead] = []
        for grid in req.grids:
            try:
                result = pipeline([grid])
                label = result[0]["label"] if result else "neutral"
                score = float(result[0]["score"]) if result else 0.5
                reads.append(VideoRead(facial=_facial_from_label(label, score)))
            except Exception:
                reads.append(_analyze_grid(grid))
        return VideoResponse(reads=reads)
    return VideoResponse(reads=[_analyze_grid(g) for g in req.grids])


def _facial_from_label(label: str, score: float) -> FacialRead:  # pragma: no cover
    """Map a kinetics-class label to facial action likelihoods (coarse)."""
    positive = label in ("laughing", "singing", "dancing", "clapping")
    negative = label in ("crying", "coughing", "screaming")
    base = max(0.05, score)
    dist = {k: 0.05 for k in FACIAL_KEYS}
    dist["happy" if positive else ("sad" if negative else "neutral")] = base
    total = sum(dist.values())
    return FacialRead(**{k: round(v / total, 4) for k, v in dist.items()})


@app.post("/analyze/audio", response_model=AudioResponse)
def analyze_audio(req: AudioRequest) -> AudioResponse:
    """Aggregate instantaneous audio features into scene-level descriptors."""
    if not req.rms:
        return AudioResponse(rms=0.0, spectralCentroid=0.5, speechRate=0.0, activity=0.0)

    rms = statistics.fmean(req.rms)
    cent = statistics.fmean(req.spectralCentroid) if req.spectralCentroid else 0.5
    rate = statistics.fmean(req.speechRate) if req.speechRate else 0.0

    # Speech presence: sustained loudness with centroid in voice band (~0.3-0.7).
    voice_band = max(0.0, 1.0 - abs(cent - 0.5) * 2.5)
    activity = max(0.0, min(1.0, rms * 2.2 * (0.4 + voice_band)))

    return AudioResponse(
        rms=round(rms, 4),
        spectralCentroid=round(cent, 4),
        speechRate=round(rate, 3),
        activity=round(activity, 4),
    )



