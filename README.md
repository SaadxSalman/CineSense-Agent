# CineSense-Agent 🎬🍿

A system that goes beyond simple recommendations to actively craft a hyper-personalized cinematic experience. CineSense-Agent analyzes a user's emotional state, viewing history, and real-time biometric data to generate a custom movie trailer, script, or short film tailored to their current mood and preferences.

## ✨ Features

  * **Emotion-Driven Content Generation:** An "Emotion Agent" processes real-time user data to gauge emotional state, which then informs the creative output.
  * **Multi-Modal Analysis:** Utilizes **VideoMAE-v2** to analyze video, **AudioCLIP** to understand audio cues, and a vision model to track facial expressions and gaze for a comprehensive understanding of user engagement.
  * **AI-Powered Creative Synthesis:** A "Creative Agent" uses a large language model like **Llama-3** for scriptwriting, while a "Synthesis Agent" combines video and audio generation models to produce the final, bespoke output.
  * **Semantic Cinematic Retrieval:** Creates a vector space of cinematic concepts and styles, allowing the system to intelligently retrieve and combine elements from a vast library of films.
  * **Real-time Processing:** The core backend, built with **Rust**, ensures low-latency, real-time processing of multi-modal inputs, facilitated by **tRPC** for efficient communication.

## ⚙️ Tech Stack

### 1. High-Performance Core (Processing)

* **Language:** **Rust**
* *Why:* Used for the `core-engine` to handle high-frequency data streams (biometrics/video) with zero-cost abstractions and memory safety.


* **Computer Vision:** **OpenCV (Rust Bindings)**
* *Why:* Real-time frame capture, normalization, and pre-processing before sending data to AI models.


* **Concurrency:** **Tokio**
* *Why:* Asynchronous runtime to manage multi-modal input channels without blocking the execution thread.



### 2. AI & Inference Layer (Intelligence)

* **Language:** **Python 3.10+**
* **Video Analysis:** **VideoMAE-v2**
* *Why:* A state-of-the-art masked autoencoder that excels at understanding temporal actions and micro-expressions.


* **Audio Analysis:** **AudioCLIP**
* *Why:* Multi-modal version of CLIP that understands the relationship between audio frequencies and concepts/emotions.


* **Creative Logic:** **Llama-3 (8B or 70B)**
* *Why:* Advanced reasoning capabilities for translating emotion vectors into structured cinematic screenplays.


* **Model Serving:** **FastAPI + Uvicorn**
* *Why:* Provides a high-performance bridge for the Rust engine to "talk" to the Python models via local POST requests.



### 3. Orchestration & API (The Glue)

* **Framework:** **Node.js & Express**
* **Communication:** **tRPC**
* *Why:* Provides end-to-end type safety between the backend and frontend. It eliminates the need for manual API documentation and prevents runtime errors.


* **Validation:** **Zod**
* *Why:* Strict schema validation for all data moving between the user and the agents.



### 4. Database & Semantic Retrieval

* **Database:** **MongoDB Atlas**
* **Vector Engine:** **Atlas Vector Search**
* *Why:* Allows for "Semantic Cinematic Retrieval." We store cinematic styles as high-dimensional vectors and retrieve them using cosine similarity based on the user's emotion.



### 5. Frontend & UI (Experience)

* **Framework:** **Next.js 14+ (App Router)**
* **Language:** **TypeScript**
* **Styling:** **Tailwind CSS**
* **Icons & UI:** **Lucide React** & **Framer Motion**
* *Why:* Used to animate the real-time "Emotion Heatmaps" and the smooth transition of generated scripts.



### 6. DevOps & Deployment

* **Containerization:** **Docker & Docker Compose**
* *Why:* Manages the complex environment requirements (CUDA for Python, OpenCV for Rust, and Node packages) in a single command.


* **Hardware Acceleration:** **NVIDIA Container Toolkit**
* *Why:* Enables the Docker containers to access your local GPU for real-time AI inference.

## 🚀 Getting Started

### Prerequisites

* **Node.js 20+** & npm — orchestrator + dashboard (required)
* Python 3.10+ — AI inference bridge *(optional; orchestrator has built-in fallbacks)*
* Rust toolchain — core-engine *(optional; browser + simulator cover producers)*
* Docker + NVIDIA Container Toolkit — one-command orchestration *(optional)*
* A **Llama-3** API key from any OpenAI-compatible provider (Groq / Together / OpenRouter / Ollama) *(optional)*

> **Every integration degrades gracefully.** No Mongo? In-memory store. No Llama
> key? Deterministic local screenwriter. No Python bridge / Rust engine? The
> browser's vision layer and the built-in simulator drive the pipeline. The
> system is fully functional out of the box with an empty `.env`.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/SaadxSalman/CineSense-Agent.git
    cd CineSense-Agent
    ```
2.  **Start the orchestrator (Node.js / tRPC):**
    ```bash
    cd apps/server
    npm install
    npm run dev            # → http://localhost:4000 (tRPC, /ws, /internal/ingest)
    ```
    On boot it self-seeds the 36-film concept library into the vector store.
3.  **Start the dashboard (Next.js):**
    ```bash
    cd ../web
    npm install
    npm run dev            # → http://localhost:3000
    ```
4.  Open **http://localhost:3000**, click **"Simulated biometrics"** (or **"Use my
    webcam"**), watch the emotion heatmap fuse in real time, then press
    **"synthesize my trailer"**.

### Configuration

Copy `.env.example` to `.env` (repo root) and fill in what you have:

| Variable | Purpose | Fallback when empty |
|---|---|---|
| `PORT` | orchestrator port (4000) | — |
| `MONGODB_URI` | MongoDB Atlas connection | in-memory store |
| `LLAMA_API_KEY` / `LLAMA_BASE_URL` / `LLAMA_MODEL` | Creative Agent (Llama-3 via OpenAI-compatible API) | deterministic local screenwriter |
| `PY_INFERENCE_URL` | Python VideoMAE/AudioCLIP bridge | built-in heuristics on Node side |
| `INTERNAL_API_KEY` | shared secret for the Rust engine ingest | `dev-internal-key` |
| `EMBEDDING_PROVIDER` | `local` (default) or `openai` | local hashed embeddings |
| `NEXT_PUBLIC_SERVER_URL` | dashboard → orchestrator URL | `http://localhost:4000` |

```ini
LLAMA_API_KEY=your_llama3_api_key
```

### Optional services

```bash
# Python inference bridge (VideoMAE-v2 / AudioCLIP adapters, heuristic baseline)
python -m pip install -r models/requirements.txt
python -m uvicorn inference_server:app --host 127.0.0.1 --port 8000

# Rust core-engine (real-time capture + fusion; mirrors the TS emotion math)
cd core-engine
cargo run --release -- --mode simulate --session-id <dashboard-session-id>
cargo run --release -- --mode jsonl --stream-path ./stream.jsonl   # replay a file
cargo run --release --features opencv -- --mode camera             # real webcam
```

### Scripts & verification

```bash
npm run seed          # upload movie vectors to the configured store (Mongo workflow)
npm run simulate      # end-to-end pipeline test over real HTTP/tRPC:
                      # session → biometric stream → emotion fusion →
                      # semantic retrieval → trailer synthesis → persistence
npm run typecheck:server
```

### Docker

```bash
docker compose up --build                              # mongo + models + server + web
docker compose --profile engine run engine \
  --api-url http://server:4000 --mode simulate --session-id docker-demo
```

---

## 🧠 How a mood becomes a movie

```
 multi-modal signals                 fused state                creative output
┌───────────────────────┐   ┌──────────────────────────┐   ┌───────────────────────────────┐
│ webcam 8×8 grid +     │   │ Emotion Agent            │   │ Semantic Retrieval            │
│ motion energy         │   │  normalize → fuse →      │   │  embed mood query →           │
│ (browser / Rust /     │ → │  valence · arousal ·     │ → │  cosine search over 36        │
│  simulator)           │   │  engagement + labels     │   │  cinematic concepts           │
├───────────────────────┤   │  (Russell circumplex)    │   ├───────────────────────────────┤
│ heart rate · HRV ·    │   └──────────────┬───────────┘   │ Creative Agent                │
│ skin conductance ·    │                  │ WS /ws live   │  Llama-3 → screenplay JSON    │
│ gaze · blink · audio  │                  ▼               │  (local fallback included)    │
└───────────────────────┘   ┌──────────────────────────┐   ├───────────────────────────────┤
                            │ Dashboard                │   │ Synthesis Agent               │
                            │  heatmap · circumplex ·  │ ◂ │  pacing/grade/score from      │
                            │  trailer player · script │   │  arousal/valence → blueprint  │
                            └──────────────────────────┘   └───────────────────────────────┘
```

1.  **Signal ingestion** — the dashboard's webcam vision layer, the Rust
    core-engine, or the built-in simulator emit `SignalSample`s over tRPC
    (`emotion.ingest`) or the Rust-only REST path (`POST /internal/ingest`).
2.  **Emotion Agent** — every sample is fused into a frame (valence, arousal,
    engagement, top-5 circumplex labels, 8×8 heatmap), kept in a rolling 30 s
    window and broadcast over the WebSocket bus.
3.  **Semantic Cinematic Retrieval** — the fused state becomes a mood query,
    is embedded (local hashed n-grams by default), and searched against the
    concept vectors (Atlas Vector Search on MongoDB, in-process cosine
    otherwise).
4.  **Creative Agent** — Llama-3 turns state + concepts into a validated
    screenplay JSON; without an API key the deterministic local screenwriter
    applies the same circumplex geometry as creative rules.
5.  **Synthesis Agent** — the screenplay becomes a timed trailer blueprint
    (shot types, transitions, color grade, score cues) whose pacing is a
    direct function of the viewer's arousal, then persisted and rendered by
    the animated CineSynth player.

---



To wrap everything up, here is the finalized, comprehensive directory structure for **CineSense-Agent**. This structure organizes your multi-language stack (Rust, Python, TypeScript) into a clean, modular monorepo that is ready for Docker orchestration.

### 📂 Project Structure

```text
CineSense-Agent/
├── apps/
│   ├── web/                          # Next.js 15 dashboard (App Router)
│   │   ├── src/
│   │   │   ├── app/                  # layout, providers, dashboard page, styles
│   │   │   ├── components/           # SystemStatus, SessionControls, EmotionHeatmap,
│   │   │   │                         #   EmotionReadout, ConceptSearch, TrailerPlayer,
│   │   │   │                         #   ScriptView, HistoryList
│   │   │   ├── hooks/                # useEmotionStream (WS bus), useBiometricSimulator,
│   │   │   │                         #   useWebcamSignals (browser vision layer)
│   │   │   └── utils/                # tRPC client — AppRouter type imported from the
│   │   │                             #   server source (end-to-end type safety)
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── server/                       # Node.js orchestrator (tRPC + WS + REST)
│       ├── src/
│       │   ├── trpc/                 # context + routers (health, emotion, concepts, content)
│       │   ├── services/             # emotionAgent, retrieval, embedding, llama,
│       │   │                         #   localScreenwriter, synthesis, inference,
│       │   │                         #   seed, eventBus
│       │   ├── store/                # Store interface: MemoryStore + MongoStore
│       │   │                         #   (Atlas Vector Search w/ cosine fallback)
│       │   ├── data/                 # 36-concept cinematic seed library
│       │   ├── ws.ts                 # /ws real-time emotion bus
│       │   └── index.ts              # entry: /trpc · /ws · /internal/ingest · /healthz
│       ├── Dockerfile
│       └── package.json
│
├── core-engine/                      # Rust (Tokio) capture + fusion
│   ├── src/
│   │   ├── main.rs                   # CLI: --mode simulate | jsonl | camera
│   │   ├── emotion_agent/            # normalization + fusion (mirrors the TS agent)
│   │   ├── fusion/                   # rolling-window aggregation
│   │   ├── sources/                  # simulator · jsonl replay · opencv camera (feature)
│   │   ├── transport.rs              # batched ingest with retry/backoff
│   │   └── types.rs                  # camelCase wire types (match server zod schema)
│   ├── Dockerfile
│   └── Cargo.toml
│
├── models/                           # Python AI inference bridge (FastAPI)
│   ├── inference_server.py           # /health · /analyze/video · /analyze/audio
│   │                                 #   (VideoMAE-v2 / AudioCLIP adapters, heuristic baseline)
│   ├── requirements.txt
│   └── Dockerfile                    # GPU-ready via NVIDIA Container Toolkit
│
├── scripts/                          # Utility scripts (repo root, npm run …)
│   ├── seed_concepts.ts              # upload movie vectors to the store
│   └── simulate_stream.ts            # end-to-end pipeline test via tRPC client
│
├── .env.example                      # all config, with fallbacks documented
├── docker-compose.yml                # mongo + models + server + web (+ engine profile)
└── README.md
```

---