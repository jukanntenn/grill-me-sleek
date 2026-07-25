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
#
# Runtime image bundles s6-overlay + Caddy + Rust binary (all-in-one).

# ===========================================================================
# Stage 0: Frontend — build web/dist inside Docker (self-contained)
# ===========================================================================
FROM node:22-alpine AS frontend
RUN corepack enable
WORKDIR /web
# Copy lockfile + manifest first for layer caching (deps only re-install when they change).
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
# Copy source and build.
COPY web/ .
ENV CI=true
# Build frontend — this ensures we always use the latest source code
# Note: .dockerignore excludes web/dist/, so we always build fresh
RUN pnpm build

# ===========================================================================
# Stage 1: Chef — prepare the dependency recipe
# ===========================================================================
FROM rust:alpine AS chef
RUN apk add --no-cache musl-dev cmake curl
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

# sqlx compile-time macros read the offline cache (.sqlx/) committed to the repo.
# Ensure `cargo sqlx prepare` has been run before docker build when queries change.
ENV SQLX_OFFLINE=true
RUN cargo build --release

# ===========================================================================
# Stage 4: Runtime — alpine + s6-overlay + Caddy
# ===========================================================================
FROM alpine:3.21

ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.0.2
ARG CADDY_VERSION=v2.9.1

RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl

# s6-overlay process supervisor
ADD "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" /tmp/s6-overlay-noarch.tar.xz
RUN S6_ARCH=$(case "${TARGETARCH}" in amd64) echo "x86_64" ;; arm64) echo "aarch64" ;; esac) && \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" -o /tmp/s6-overlay-arch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-overlay-arch.tar.xz && \
    rm -f /tmp/s6-overlay-*.tar.xz

# Caddy reverse proxy
RUN curl -fsSL \
    "https://github.com/caddyserver/caddy/releases/download/${CADDY_VERSION}/caddy_${CADDY_VERSION##v}_linux_${TARGETARCH}.tar.gz" \
    | tar xz -C /usr/local/bin caddy && \
    chmod +x /usr/local/bin/caddy

# s6 service definitions
COPY docker/s6/cont-init.d /etc/cont-init.d
COPY docker/s6/s6-rc.d /etc/s6-overlay/s6-rc.d
RUN chmod +x /etc/cont-init.d/*.sh

# Caddy config (overridden at runtime by Ansible-mounted volume)
COPY docker/Caddyfile /app/Caddyfile

# Rust binary (libsqlite3 is statically linked via sqlite-bundled — no .so needed).
COPY --from=builder /app/target/release/grilling-sleek /app/grilling-sleek

# Migrations are embedded in the binary via sqlx::migrate!, but keep a copy for
# manual inspection / recovery.
COPY --from=builder /app/migrations /app/migrations

# Frontend build (served by Caddy's file_server). Built in the frontend stage.
COPY --from=frontend /web/dist /app/web/dist

# Data + log directories
RUN mkdir -p /app/data /app/log

ENV RUST_LOG=info
ENV S6_KEEP_ENV=1

EXPOSE 8443

WORKDIR /app
ENTRYPOINT ["/init"]
