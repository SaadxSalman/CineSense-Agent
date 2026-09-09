# CineSense-Agent 🎬🍿

> **Emotion-driven cinema, synthesized live from your body — and from your videos.**

CineSense-Agent is a full-stack, multi-language system that goes beyond movie recommendations. It reads a person's emotional state in real time (webcam vision, physiological signals, gaze, motion, audio) — or analyzes the emotional arc of **any uploaded video** — then AI-writes a bespoke trailer, short-film concept, or screenplay tailored to that mood, blended from a vector library of **36 cinematic concepts** (Blade Runner 2049, Perfect Blue, Parasite, Spirited Away, Whiplash, Call Me by Your Name…).

---

## 🧠 What it does — the two pipelines

```
 PIPELINE 1 · LIVE EMOTION (sense the viewer)
┌───────────────────────────┐   ┌──────────────────────────────┐   ┌─────────────────────────────┐
│ webcam 8×8 grid           │   │ Emotion Agent (Fusion)       │   │ Semantic Cinematic Retrieval │
│ heart rate / HRV / GSR    │──▶│ normalize → valence · arousal│──▶│ embed mood query → cosine   │
│ gaze / blinks / pupil     │   │ → engagement · circumplex    │   │ search over 36 concepts     │
│ motion energy / audio     │   │ labels · 8×8 heatmap         │   │ (Atlas Vector Search)       │
└───────────────────────────┘   └──────────────┬───────────────┘   └──────────────┬──────────────┘
                                               │ WS /ws (live)                     ▼
                                               │                 ┌──────────────────────────────────┐
 PIPELINE 2 · VIDEO EMOTION (sense the footage)│                 │ Creative Agent (LLM / local)      │
┌───────────────────────────┐                  │                 │ Emotion + concepts → screenplay  │
│ upload any video          │   ┌────────────┐ │                 └──────────────┬───────────────────┘
│ browser decodes it        │──▶│ Video      │ │                                ▼
│ frames + color + motion   │   │ Analyst    │─│                 ┌──────────────────────────────────┐
│ + audio features          │   └────────────┘ │                 │ Synthesis Agent                  │
└───────────────────────────┘   emotion timeline│                 │ timing · shots · transitions ·   │
                                (curves/peaks) │                 │ grade · score ← viewer arousal   │
                                                └────────────────▶└──────────────┬───────────────────┘
                                                                                  ▼
                                                        CineSynth player: animated trailer + full script
```

Both pipelines converge on the same creative engine, so the outcome is always a **bespoke, playable cinematic piece** whose pacing, color grade and score are a direct function of the dominant emotional state.

---

## ✨ Feature highlights

- **Real-time emotion fusion** — heart rate, HRV, skin conductance, respiration, facial action likelihoods, gaze/fixations/blinks, pupil dilation, motion energy and audio loudness are each normalized to physiological reference ranges, weighted, and fused into **valence (-1..1)**, **arousal (-1..1)** and **engagement (0..1)**.
- **Russell circumplex labelling** — (valence, arousal) projects onto 13 emotion anchors (excited, happy, content, relaxed, calm, sleepy, bored, sad, anxious, tense, alert, fearful, angry) via softmax distance weighting → top-5 labels with weights.
- **Live 8×8 affect heatmap** — uses the real webcam brightness grid, or agent-synthesized arousal/engagement blobs; cell color temperature follows valence (warm = positive, cold = negative).
- **Webcam vision layer** — the dashboard samples your camera into an 8×8 grid + motion energy entirely in-browser. Nothing leaves your machine.
- **Biometric simulator** — a physiologically-plausible synthetic stream (hr/HRV/GSR/facial/gaze/motion/audio drifting through emotional episodes) so the whole pipeline runs with zero hardware.
- **Semantic Cinematic Retrieval** — 36 hand-curated film concepts (mood, tags, palettes, pacing, style notes) embedded into a vector space; both live mood queries and free-text searches retrieve the nearest cinematic DNA.
- **AI Creative Agent** — any OpenAI-compatible `/chat/completions` endpoint (Groq, Together, OpenRouter, Ollama) turns emotion + concepts into a zod-validated screenplay JSON (title, logline, grade, music cues, 5–7 scenes with shots/transitions/dialogue). Ships a **deterministic local screenwriter** fallback.
- **Synthesis Agent + CineSynth player** — blueprints timed scenes, letterboxed aspect, Ken-Burns motion, per-scene grade, transitions and score cues, then renders an animated storyboard player with narration captions and optional browser text-to-speech.
- **Video Emotion Analysis** — upload any mp4/webm/mov; the browser extracts frame grids (16×12), color statistics, motion energy and audio loudness; the server fuses these into a synchronized valence/arousal timeline, peak moments, overall mood — and can **generate a new trailer from that video's mood**.
- **End-to-end type safety** — the Next.js app imports `AppRouter` directly from the server source; every procedure is validated by Zod and serialized with superjson.
- **Rust core-engine** — optional high-performance producer (Tokio): `simulate` / `jsonl` replay / `camera` via OpenCV, mirroring the TypeScript fusion math, shipping batches over an authenticated REST ingest.
- **Python inference bridge** — FastAPI service with **VideoMAE-v2 / AudioCLIP** adapter slots (heuristic baseline runs anywhere; real model weights drop in on GPU).
- **Graceful degradation everywhere** — no Mongo → in-memory store; no LLM key → local screenwriter; no Python bridge / Rust engine → browser + simulator drive everything. **Zero-config functional.**

---

## ⚙️ Tech stack (as built & verified)

| Layer | Technology | Role in the system |
|---|---|---|
| Dashboard | **Next.js 15** (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Framer Motion · Lucide React | real-time heatmap, circumplex, CineSynth player, Video Scan panel |
| Orchestrator | **Node.js** · Express 5 · **tRPC v11** · Zod 4 · superjson · `ws` | end-to-end typed API, WebSocket bus, agent pipelines, persistence |
| Database & vectors | **MongoDB Atlas** (Mongoose) · Atlas Vector Search · in-memory fallback | sessions, 36 concepts + embeddings, generated content, video-analysis jobs |
| Creative Agent | OpenAI-compatible `POST /chat/completions` — **Groq `openai/gpt-oss-120b`** configured; any **Llama-3** endpoint swappable | screenplay JSON generation from emotion + concepts |
| Embeddings | **local hashed n-gram** (default, zero-cost, deterministic) or OpenAI `text-embedding-3-small` | concept & mood query vectors |
| Core capture | **Rust + Tokio** (`simulate` · `jsonl` · `camera`) with optional OpenCV | high-frequency multi-modal capture, mirrored fusion math |
| ML inference | **Python 3.11 FastAPI + Uvicorn** (VideoMAE-v2 / AudioCLIP adapter slots, heuristic baseline) | optional deep video/audio analysis, GPU-ready |
| Infra | Docker + `docker-compose.yml` (mongo · models · server · web · engine profile) · Dockerfiles | one-command deployment |

### Repository layout at a glance

```
CineSense-Agent/
├── apps/
│   ├── server/      # Node orchestrator — tRPC, WS bus, agents, stores, video analyst
│   └── web/         # Next.js 15 dashboard — emotion + video analysis UI, CineSynth player
├── core-engine/     # Rust (Tokio) capture & fusion engine
├── models/          # Python FastAPI inference bridge (VideoMAE/AudioCLIP adapters)
├── scripts/         # seed_concepts.ts · simulate_stream.ts (e2e smoke test)
└── docker-compose.yml · .env.example · .gitignore
```

---

## 🏗️ How it works, agent by agent

### 1. Emotion Agent (live viewer sensing)
`apps/server/src/services/emotionAgent.ts` (+ Rust `emotion_agent/mod.rs`)

1. **Normalize** each raw signal to `[0,1]` against reference ranges: HR `55–120 bpm`, HRV `20–90 ms`, GSR `0.5–8 µS`, respiration `8–28 bpm`, blink rate `4–25 bpm`.
2. **Fuse** a weighted blend:
   - **Arousal** ← HR (0.3), motion energy (0.2), audio RMS (0.15), blink-rate inversion (0.15), GSR (0.2), respiration (0.1), surprise (0.1)
   - **Valence** ← facial affect `tanh(2.2·(pos − neg))` (0.55), HRV (0.25), gaze fixation (0.2), audio spectral centroid (0.1)
   - **Engagement** ← mean of gaze fixation, blink inversion, motion inversion (defaults to 0.5 without gaze)
3. **Label** via the circumplex — softmax over squared distance to 13 anchors.
4. **Heatmap** — vision-provided grid if present, else a synthesized engagement blob drifted by valence/arousal.

Frames roll into a 30-second sliding window per session (`currentEmotionState`), broadcast over WebSocket (`/ws`), and drive the `content.generate` precondition.

### 2. Video Analyst (uploaded-footage sensing)
`apps/server/src/services/videoAnalyst.ts`

Each browser-extracted observation (`tSec`, 16×12 grayscale grid, avg RGB, saturation, motionEnergy, audio loudness/brightness) is fused as:

- **Arousal** ← `0.35·motion + 0.25·loudness + 0.20·saturation + 0.20·contrast`
- **Valence** ← warm/bright/saturated reads pleasant; **dark + frantic** produces a dread penalty: `0.5·warmth + 0.3·brightness + 0.2·saturation − 0.45·dread`
- **Engagement** ← `0.35·motion + 0.35·loudness + 0.30·contrast`

The timeline is summarized into an overall mood, top labels and the **3 peak moments** (highest intensity of the per-point dominant emotion).

### 3. Semantic Cinematic Retrieval
`apps/server/src/services/retrieval.ts` + `embedding.ts` + `data/concepts.ts`

- The fused state (`dominant`, label weights, valence/arousal words) is composed into a natural-language mood query, e.g.
  `emotion: bored, feelings: bored calm sleepy, mood: wistful ambiguous calm unhurried, genres: sci-fi neo-noir, cinematography film style color palette soundtrack`
- Embedded with **local hashed n-grams** (default — deterministic, zero-cost, cosine-meaningful) or OpenAI.
- Searched over the **36-concept vector space** — Atlas **`$vectorSearch`** (cosine) when the index exists, transparent in-process cosine fallback otherwise.
- Top-6 hits supply the Creative Agent with style palette, mood, tags and visual notes.

### 4. Creative Agent (LLM screenwriter)
`apps/server/src/services/llama.ts` + `localScreenwriter.ts`

- **LLM path:** sends the emotional state + retrieved concept DNA to any OpenAI-compatible endpoint. A strict system prompt demands a single JSON object matching the `Screenplay` zod schema (title, logline, color grade, music key/BPM/cues, 5–7 scenes with shot type, duration, styleNotes, paletteRef, motion intensity, narration/dialogue, transition).
- **Reasoning-model support:** `gpt-oss`/`o1`/`o3` models receive `reasoning_effort: low` so `message.content` carries the JSON cleanly.
- **Fallback path:** deterministic *local screenwriter* uses the circumplex geometry itself as creative rules — arousal → shot/transition pacing tables, valence → major/minor key, palette from top concepts, templated narration/dialogue seeded by the dominant emotion.

### 5. Synthesis Agent → CineSynth player
`apps/server/src/services/synthesis.ts` → `apps/web/src/components/TrailerPlayer.tsx`

The validated screenplay becomes a **TrailerBlueprint**: scenes timed on a start/duration axis, shots, transitions, per-scene `paletteRef`, `motionIntensity` (drives the player's Ken-Burns scale + grain), aspect (`2.39:1` for high arousal, else `16:9`), and a readability-formatted screenplay text. The player animates each scene with the grade color, letterboxing, narration/dialogue captions, and optional **text-to-speech narration**.

### 6. Rust core-engine (optional high-throughput producer)
`core-engine/src/**`

`cargo run --release -- --mode simulate --session-id X` streams fused samples in batches to `POST /internal/ingest` (shared `INTERNAL_API_KEY`) with retry/backoff. Modes: **simulate** (synthetic, hardware-free), **jsonl** (replay a file of `SignalSample` objects), **camera** (needs `--features opencv` + system OpenCV). Its `emotion_agent` mirrors the TS math **exactly**, so outputs are interchangeable.

### 7. Python inference bridge (optional deep-ML layer)
`models/inference_server.py`

FastAPI with `/health`, `/analyze/video` (batch of frame grids → facial likelihoods + refined heatmaps), `/analyze/audio` (loudness, spectral centroid, speech presence). Runs on CPU heuristics by default; set `ENABLE_VIDEOMAE=1` / `ENABLE_AUDIOCLIP=1` and install torch+transformers to activate the real **VideoMAE-v2 / AudioCLIP** adapters.

---

## 🚀 Getting Started

### Prerequisites

| Component | Required? | Notes |
|---|---|---|
| **Node.js 20+ & npm** | ✅ required | runs orchestrator + dashboard |
| **MongoDB Atlas** (or local/`docker compose` Mongo) | recommended | without it → in-memory store (still fully functional) |
| **LLM API key** (Groq/OpenRouter/Together/Ollama) | recommended | without it → deterministic local screenwriter |
| Python 3.10+ | optional | inference bridge (heuristic baseline still runs on Node) |
| Rust toolchain | optional | core-engine producer |
| Docker | optional | one-command orchestration |

**The system is fully functional with an empty `.env`** — every integration degrades gracefully.

### Quick start

```bash
# 1. clone
git clone https://github.com/SaadxSalman/CineSense-Agent.git
cd CineSense-Agent

# 2. environment (copy & edit)
cp .env.example .env

# 3. orchestrator → http://localhost:4000
cd apps/server
npm install
npm run dev            # dev mode; or `npm run build && npm run start`

# 4. dashboard → http://localhost:3000  (new terminal)
cd ../web
npm install
npm run dev            # dev mode; or `npm run build && npm run start`
```

Open **http://localhost:3000**, click **"Simulated biometrics"** (no hardware needed), watch the heatmap fuse for a few seconds, then **"synthesize my trailer"**. To analyze a video, scroll to **Video Scan**, choose a file, and either browse its emotional timeline or click **"synthesize trailer from this video's mood"**.

### Environment variables (`.env`)

| Variable | Purpose | Fallback when empty |
|---|---|---|
| `PORT` | orchestrator port | `4000` |
| `CORS_ORIGIN` | comma-separated dashboard origins | `http://localhost:3000` |
| `MONGODB_URI` | MongoDB connection (Atlas SRV or expanded) | in-memory store |
| `LLAMA_API_KEY` | LLM API key (any OpenAI-compatible provider) | local screenwriter |
| `LLAMA_BASE_URL` | e.g. `https://api.groq.com/openai/v1` | Groq |
| `LLAMA_MODEL` | e.g. `openai/gpt-oss-120b`, `llama-3.1-8b-instant` | `llama-3.1-8b-instant` |
| `LLAMA_TIMEOUT_MS` | LLM call timeout | `20000` |
| `PY_INFERENCE_URL` | Python bridge base URL | built-in heuristics |
| `INTERNAL_API_KEY` | Rust engine ↔ orchestrator shared secret | `dev-internal-key` |
| `EMBEDDING_PROVIDER` | `local` (default) or `openai` | local hashed embeddings |
| `EMBEDDING_DIM` | vector dimension (`128` local, `1536` OpenAI) | `128` |
| `OPENAI_API_KEY` | used only when provider=`openai` | — |
| `NEXT_PUBLIC_SERVER_URL` | dashboard → orchestrator URL | `http://localhost:4000` |

> **Atlas / Windows tip:** if you hit `querySrv ECONNREFUSED`, the network's DNS is dropping SRV records — use the **expanded (non-SRV) connection string** built from your cluster's shard hostnames (see the comments in `.env.example`).

### Optional services

```bash
# Python inference bridge (VideoMAE-v2 / AudioCLIP adapters, heuristic baseline)
cd models
python -m pip install -r requirements.txt
python -m uvicorn inference_server:app --host 127.0.0.1 --port 8000

# Rust core-engine (real-time capture + fusion; mirrors the TS emotion math)
cd core-engine
cargo run --release -- --mode simulate --session-id <dashboard-session-id>
cargo run --release -- --mode jsonl --stream-path ./stream.jsonl        # replay a file
cargo run --release --features opencv -- --mode camera                  # real webcam
```

### Scripts & verification

```bash
# from the repo root
npm run dev:server       # dev orchestrator (port 4000)
npm run dev:web          # dev dashboard (port 3000)
npm run start:server     # production orchestrator (after build:server)
npm run start:web        # production dashboard (after build:web)
npm run typecheck:server # TypeScript validation of the orchestrator
npm run seed             # (re)seed cinematic concept vectors into the store
npm run simulate         # end-to-end pipeline smoke test over real HTTP/tRPC:
                         #   session → biometric stream → emotion fusion →
                         #   semantic retrieval → AI trailer → persistence
```

### Docker

```bash
docker compose up --build                                # mongo + models + server + web
docker compose --profile engine run engine \
  --api-url http://server:4000 --mode simulate --session-id docker-demo
```

---

## 🔌 API surface (tRPC, `/trpc`)

| Router | Procedures | Description |
|---|---|---|
| `health` | `health`, `diagnostics`, `pingBus` | liveness + per-subsystem status matrix |
| `emotion` | `createSession`, `getSession`, `listSessions`, `closeSession`, `ingest`, `current`, `history` | sessions + biometric ingestion + fused state |
| `concepts` | `search`, `list` | free-text semantic retrieval over the 36 concepts |
| `content` | `generate`, `list`, `get` | full generation pipeline (optionally `videoJobId`-driven) |
| `videos` | `startUpload`, `submitSamples`, `finalize`, `get`, `list` | video emotion analysis jobs |

Plus native WebSocket bus at `/ws` (`emotion` frames, `content` done, `engine` heartbeats) and the Rust-only authenticated REST route `POST /internal/ingest`.

---

## 🧪 Verified end-to-end (this repository's CI-equivalent smoke test)

**Live-emotion pipeline** (`npm run simulate`) — calm → tense drift, correctly fused:

```
t=0   dominant=relaxed  valence=0.65 arousal=-0.65 engagement=0.58
t=8   dominant=anxious  valence=-0.13 arousal= 0.06 engagement=0.75
retrieval "tense rain-soaked neon detective dread" → Blade Runner 2049 (0.324) · Drive (0.305) …
AI trailer → 6 scenes · grade "Blue Hour Ash" · D minor · concepts blended
```

**Video-emotion pipeline** — a 30s synthetic clip (dark/slow/sad → bright/fast/warm):

```
submit  → latest: sad      v=-1.00 a=-0.82   ← dark phase
submit  → latest: content  v=+0.79 a=+0.27   ← bright phase
finalize→ dominant: sad | valence -0.10 | arousal -0.27 | peaks at the phase transition
generate(videoJobId) → "Echoes of a Fading Summer" — *A bittersweet journey through the
  last golden days of a love that lingers like a fading sunrise.* (LLM · 6 scenes · 60s)
```

**Persistence** — both generated pieces and the video job survive an orchestrator
restart when MongoDB Atlas is configured (`store=mongo`).

---

## 📂 Full directory structure

```text
CineSense-Agent/
├── apps/
│   ├── web/                              # Next.js 15 dashboard (App Router)
│   │   ├── src/
│   │   │   ├── app/                      # page.tsx (dashboard) · layout · providers · globals.css
│   │   │   ├── components/               # SystemStatus · SessionControls · EmotionHeatmap ·
│   │   │   │                             #   EmotionReadout · ConceptSearch · TrailerPlayer ·
│   │   │   │                             #   ScriptView · HistoryList · VideoScan
│   │   │   ├── hooks/                    # useEmotionStream (WS) · useBiometricSimulator ·
│   │   │   │                             #   useWebcamSignals (vision layer) · useVideoScan
│   │   │   └── utils/                    # tRPC client (AppRouter imported from server source) · types
│   │   ├── Dockerfile                    # multi-stage → standalone server
│   │   └── package.json
│   │
│   └── server/                           # Node.js orchestrator (tRPC + WS + REST)
│       ├── src/
│       │   ├── trpc/                     # context · root · routers (health, emotion, concepts,
│       │   │                             #   content, videos)
│       │   ├── services/                 # emotionAgent · videoAnalyst · retrieval · embedding ·
│       │   │                             #   llama · localScreenwriter · synthesis · inference ·
│       │   │                             #   seed · eventBus
│       │   ├── store/                    # Store interface: MemoryStore + MongoStore
│       │   │                             #   (+ Atlas Vector Search with cosine fallback)
│       │   ├── data/                     # 36-concept cinematic seed library
│       │   ├── ws.ts                     # /ws real-time emotion/content/engine bus
│       │   ├── config.ts                 # env-driven configuration
│       │   └── index.ts                  # entry: /trpc · /ws · /internal/ingest · /healthz
│       ├── Dockerfile
│       └── package.json
│
├── core-engine/                          # Rust (Tokio) capture + fusion engine
│   ├── src/
│   │   ├── main.rs                       # CLI: --mode simulate | jsonl | camera
│   │   ├── emotion_agent/mod.rs          # normalization + circumplex fusion (mirrors TS agent)
│   │   ├── fusion/mod.rs                 # rolling-window aggregation
│   │   ├── sources/                      # simulator · jsonl replay · opencv camera (feature)
│   │   ├── transport.rs                  # batched ingest with retry/backoff
│   │   └── types.rs                      # camelCase wire types (match server zod schema)
│   ├── Dockerfile
│   └── Cargo.toml
│
├── models/                               # Python AI inference bridge (FastAPI)
│   ├── inference_server.py               # /health · /analyze/video · /analyze/audio
│   │                                     #   (VideoMAE-v2 / AudioCLIP adapters, heuristic baseline)
│   ├── requirements.txt
│   └── Dockerfile                        # GPU-ready via NVIDIA Container Toolkit
│
├── scripts/                              # utility scripts (repo root, npm run …)
│   ├── seed_concepts.ts                  # (re)embed + upload movie vectors
│   └── simulate_stream.ts                # end-to-end pipeline smoke test via tRPC client
│
├── .env.example                          # all configuration, documented fallbacks
├── docker-compose.yml                    # mongo + models + server + web (+ engine profile)
├── package.json                          # root scripts (dev/start/build/seed/simulate)
└── README.md
```

---

## 🩺 Health & diagnostics

The dashboard's **System Status** panel polls `health.diagnostics`, which reports each
subsystem live: orchestrator, store (memory/mongo + concept count), Creative Agent
(provider + model), Vision/Audio Bridge (Python), Rust Engine (heartbeat age), embeddings
(provider + dim) and the WebSocket subscriber count. Every optional subsystem reports
**offline** with a clear reason — and the matching fallback is what keeps the system running.

---

## 🧭 Roadmap / ideas

- **Real VideoMAE-v2 / AudioCLIP inference** — enable `ENABLE_VIDEOMAE=1` + GPU container in
  `models/` for deep scene/expression semantics instead of the color/dynamics heuristics.
- **Video emotional-arc → timing map** — drive a generated trailer's pacing to mirror the
  *shape* of an uploaded video's curve (not just its average mood).
- **Multi-user seat rotation** in the Rust engine for true high-frequency capture.
- **Stable Diffusion / video-diffusion rendering** hook for the synthesis agent.
- **Auth layer** (sessions per user, content ownership, shareable public links).

---

## 📝 License & credits

MIT-style educational/experimental project. All film titles are referenced strictly as
stylistic concepts for retrieval (no copyrighted media is stored or reproduced).

*Dockerfiles & scripts referenced above are real, present in the repo, and were exercised
while building this project.*