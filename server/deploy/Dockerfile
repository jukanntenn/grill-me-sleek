# syntax=docker/dockerfile:1
# grilling-sleek multi-stage Dockerfile.
#
# DESIGN.md §2432:
#   - rust:1.85-alpine builder; sqlx uses `sqlite-bundled` so the runtime image
#     needs no system libsqlite3.
#   - cargo-chef caches the dependency build layer (rebuilt only when Cargo.toml
#     changes), keeping iterative rebuilds fast.
#   - sqlx offline mode (SQLX_OFFLINE=true): the container has no DB at build
#     time, so it reads the committed `.sqlx/` cache. Run `cargo sqlx prepare`
#     locally before building when queries change.

# ===========================================================================
# Stage 1: Chef — prepare the dependency recipe
# ===========================================================================
FROM rust:1.85-alpine AS chef
RUN apk add --no-cache musl-dev cmake
RUN cargo install cargo-chef --locked
WORKDIR /app

# ===========================================================================
# Stage 2: Planner — fingerprint which deps need building
# ===========================================================================
FROM chef AS planner
COPY server/ .
RUN cargo chef prepare --recipe-path recipe.json

# ===========================================================================
# Stage 3: Builder — compile deps (cached) then the app
# ===========================================================================
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies first — this layer is cached unless Cargo.toml changes.
RUN cargo chef cook --release --recipe-path recipe.json

COPY server/ .
COPY web/dist /srv/web/dist

# sqlx compile-time macros read the offline cache (.sqlx/) committed to the repo.
# Ensure `cargo sqlx prepare` has been run before docker build.
ENV SQLX_OFFLINE=true
RUN cargo build --release

# ===========================================================================
# Stage 4: Runtime — minimal alpine, no toolchain
# ===========================================================================
FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates
WORKDIR /srv

# Binary (libsqlite3 is statically linked via sqlite-bundled — no .so needed).
COPY --from=builder /app/target/release/grilling-sleek /usr/local/bin/grilling-sleek

# Migrations are embedded in the binary via sqlx::migrate!, but keep a copy for
# manual inspection / recovery.
COPY --from=builder /app/migrations /srv/migrations

# Frontend build (served by Caddy's file_server).
COPY --from=builder /srv/web/dist /srv/web/dist

# Data + log volumes (DB file, tracing rolling logs).
RUN mkdir -p /srv/data /srv/log/grilling-sleek

ENV RUST_LOG=info
# OTel collector endpoint (uncomment in production):
# ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

EXPOSE 8080
CMD ["grilling-sleek"]
