# CineSense core-engine (Rust)
# Default build = simulator + jsonl modes. To include webcam capture, install
# OpenCV 4 dev libraries in the builder and add --features opencv to cargo build.
FROM rust:1.83-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/core-engine /usr/local/bin/cinesense-agent
ENTRYPOINT ["cinesense-agent"]
