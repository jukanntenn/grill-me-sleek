# GS-RFC: the production origin is Cloudflare-only

Status: implemented

English | [中文](2026-08-15-production-cloudflare-only-origin.zh.md)

Superseded by [the host-gateway record](./2026-08-24-production-origin-via-host-gateway.md) — production now reaches its origin through the shared host Caddy gateway on 443.

## Problem

Production (ttyo, a public IP) must serve visitors over TLS without exposing a brute-forceable origin, and staging and production had grown two deploy paths that drifted. A public origin with its own certificates keeps port 8443 open to the whole internet, and every scanning bot that finds it becomes Caddy's problem (topology unified and locked down in `0defc11`, 2026-08-15).

## Decision

One playbook deploys both environments: `devops/ansible/deploy.yml` with `group_vars/{staging,production}` and host vars; `ansible.cfg` at the repo root holds the inventory and avpm vault ids. Production traffic is Cloudflare-only: Caddy terminates the edge-to-origin leg with a Cloudflare Origin CA certificate (Full Strict mode) on `:8443`, connections from non-Cloudflare CIDRs get `403` from the `@not_cf` matcher, and `trusted_proxies` lets only Cloudflare front `X-Forwarded-For` — a direct connection's spoofed XFF is overwritten by Caddy, closing the forgery gap. The CIDR list renders from `cloudflare_cidrs` in `group_vars/production/vars.yml` (source: cloudflare.com/ips). Production pins a Docker Hub version tag (`image_tag`, e.g. `0.2.0-rc.2`; releases move it) while staging deploys the rolling `main` tag from the LAN registry `192.168.5.50:5000`; `docker-publish.yml` deliberately does not move it for pre-release tags. Post-deploy, the health check compares `/v1/healthz` `version` against `server/Cargo.toml`; secrets use per-variable `!vault` encryption with avpm vault ids.

## Alternatives considered

**A public origin with its own certificates.** It lost: the box is a public IP; Cloudflare-only means the origin is invisible to scanners and TLS trusts exactly one counterparty instead of everyone.

**Two environment playbooks.** It lost: two files for two environments drift; one playbook plus group vars is the single-source shape — staging and production differ by variables, not by scripts.

**Staging as an open mirror of production.** It lost: staging deploys the rolling `main` tag over LAN HTTP behind no edge — deliberately cheaper — while production pins released versions; making them identical would import production's release ceremony into every staging deploy.

## Consequences

Direct-to-origin traffic is rejected by design, and production deploys only released versions — a production change requires a release first (the `release` skill owns that flow). The costs: debugging the origin requires knowing the Cloudflare-only rule (bypassing it means temporarily widening the CIDR matcher, a deliberate act), the pinned tag means staging-only fixes do not reach production until cut, and Origin CA certificates expire on Cloudflare's schedule and must be rotated on the host.
