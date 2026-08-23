# GS-RFC: production reaches its origin through the host Caddy gateway

Status: implemented

English | [中文](2026-08-24-production-origin-via-host-gateway.zh.md)

Supersedes [the Cloudflare-only-origin record](./2026-08-15-production-cloudflare-only-origin.md).

## Problem

ttyo gained a shared, host-level systemd Caddy gateway: it binds 443 — the one proxied HTTPS port where Cloudflare's edge both connects and caches — imports `/etc/caddy/conf.d/*.caddy` so each service joins with its own site block, and sits behind a host firewall that admits only Cloudflare CIDRs on 443. grilling-sleek's production stood outside that convention: the container's own Caddy published `:8443` to the internet, terminated the edge leg itself with the Origin CA certificate, and policed Cloudflare-only traffic with an application-layer `@not_cf` matcher. On the shared box that meant two TLS terminators and two enforcement stories, and it silently forfeited the CDN: every proxied HTTPS port except 443 is cache-disabled at the edge (re-enabling is Enterprise-only), so each asset hit and each entry-HTML view re-originated across the VPS uplink forever.

## Decision

Production joins the host gateway. `devops/ansible/deploy.yml` (production-only tasks, running before the container is recreated and flushing handlers ahead of the traffic flip) copies the Origin CA certificate from `~/docker/grilling-sleek/certs/` to `/etc/caddy/certs/grilling-sleek/` and templates `/etc/caddy/conf.d/grilling-sleek.caddy` — `grillingsleek.online`, Origin CA TLS, `reverse_proxy 127.0.0.1:8081` — reloading the gateway only on change (root via `--ask-become-pass`). The compose file publishes `127.0.0.1:8081:8443` loopback-only; the container Caddy serves plain HTTP, so the `tls_profile` knob is gone — every environment is HTTP inside the container. The `@not_cf` matcher and the CF-CIDR `trusted_proxies` went with it: the host firewall is the sole Cloudflare-only enforcement point, and `cloudflare_cidrs` in `group_vars/production/vars.yml` becomes purely the firewall-resync home (no template consumes it). Client-IP trust moves to the loopback hop, matching the contract `server/src/main.rs` documents for the governor extractor: `trusted_proxies private_ranges` plus `header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}` — CF-Connecting-IP passes the gateway untouched, so the XFF reaching Rust stays the single Cloudflare-asserted value. Edge caching arrives with 443: `/assets/*` caches by default (extension-based), the entry HTML via the one-time `cache-entry-html` Cache Rule recorded in the runbook ([docs/deployment.md](../../../docs/deployment.md)). Switching from the live direct-8443 topology is a runbook step: delete the zone's port-rewrite Origin Rule in the dashboard, then deploy.

## Alternatives considered

**Keep the direct-8443 origin ([the superseded record](./2026-08-15-production-cloudflare-only-origin.md)).** It lost: the scanner-protection ground it held is now the host firewall's, and on the shared VPS it forks TLS termination into two conventions while sitting on a cache-disabled port — the origin absorbed every static hit forever.

**Terminate TLS in the container behind the gateway.** It lost: an extra TLS hop buys no security when the gateway→container leg is loopback-only plain HTTP by construction, and it would drag the certificate mount back into the container that the shared-gateway convention just removed.

**Recreate the CIDR gate inside the gateway site block.** It lost: the packet-layer firewall already admits only Cloudflare on 443; an application-layer 403 would be a second, weaker copy of the same rule with its own sync burden.

## Consequences

Production deploys now require sudo (`--ask-become-pass`) for the gateway tasks, and origin-side debugging spans two layers (`docker logs grilling-sleek` for the app, `journalctl -u caddy` for the gateway). Certificate rotation became cheaper — re-run the playbook and the changed copy reloads the gateway, no container restart. The switch day depends on a dashboard edit (deleting the Origin Rule) that Ansible cannot perform; the runbook owns that ordering. What it bought: one TLS terminator and one enforcement point on the box, an origin port unreachable off-host by construction, and the edge actually caching — assets by default, the entry HTML within a 5-minute bound.
