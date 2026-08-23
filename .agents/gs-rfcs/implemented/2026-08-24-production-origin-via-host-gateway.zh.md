# GS-RFC: production reaches its origin through the host Caddy gateway

Status: implemented

[English](2026-08-24-production-origin-via-host-gateway.md) | 中文

取代 [Cloudflare-only 源站记录](./2026-08-15-production-cloudflare-only-origin.zh.md)。

## Problem

ttyo 上出现了共享的宿主级 systemd Caddy 网关：它绑定 443——Cloudflare 边缘既回源又缓存的唯一代理 HTTPS 端口——以 `import /etc/caddy/conf.d/*.caddy` 让各服务以自己的站点块接入，身后是仅对 Cloudflare 网段放行 443 的宿主防火墙。grilling-sleek 的 production 站在这套约定之外：容器自己的 Caddy 把 `:8443` 发布到互联网、自带 Origin CA 证书终结回源一程、并用应用层的 `@not_cf` 匹配器维持仅限 Cloudflare。在共享的机器上，这意味着两个 TLS 终结点和两套执行逻辑，还悄悄放弃了 CDN：除 443 外的所有代理 HTTPS 端口在边缘一律缓存禁用（重新启用仅限 Enterprise），于是每次资产命中、每次入口 HTML 浏览都永远穿越 VPS 上行回源。

## Decision

production 接入宿主网关。`devops/ansible/deploy.yml`（仅 production 的任务，在容器重建之前运行，并在流量切换前 flush handlers）把 Origin CA 证书从 `~/docker/grilling-sleek/certs/` 复制到 `/etc/caddy/certs/grilling-sleek/`，并模板化 `/etc/caddy/conf.d/grilling-sleek.caddy`——`grillingsleek.online`、Origin CA TLS、`reverse_proxy 127.0.0.1:8081`——仅在变更时重载网关（root 经 `--ask-become-pass`）。compose 以仅回环方式发布 `127.0.0.1:8081:8443`；容器 Caddy 服务明文 HTTP，`tls_profile` 旋钮随之消失——每个环境在容器内都是 HTTP。`@not_cf` 匹配器与 CF 网段的 `trusted_proxies` 一并移除：宿主防火墙是唯一的仅限 Cloudflare 执行点，`group_vars/production/vars.yml` 的 `cloudflare_cidrs` 变成纯粹的防火墙同步归宿（没有任何模板消费它）。客户端 IP 的信任移到回环一跳，与 `server/src/main.rs` 为 governor 提取器记录的契约一致：`trusted_proxies private_ranges` 加 `header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}`——CF-Connecting-IP 原样穿过网关，到达 Rust 的 XFF 恒为 Cloudflare 断言的单值。边缘缓存随 443 到来：`/assets/*` 默认缓存（按扩展名），入口 HTML 经 runbook 记录的一次性 `cache-entry-html` Cache Rule（[docs/deployment.md](../../../docs/deployment.md)）。从现存直连 8443 拓扑切换是 runbook 的一个步骤：先在控制台删除 zone 里改写端口的 Origin Rule，再部署。

## Alternatives considered

**保留直连 8443 的源站（[被取代的记录](./2026-08-15-production-cloudflare-only-origin.zh.md)）。** 它输在：它守住的防扫描阵地如今由宿主防火墙承担，而在共享 VPS 上它把 TLS 终结分裂成两套约定，还坐在缓存禁用端口上——源站永远吸收每一次静态命中。

**网关之后仍在容器内终结 TLS。** 它输在：网关→容器一跳按构造就是仅回环明文 HTTP，多一跳 TLS 买不来安全，还会把共享网关约定刚移除的证书挂载拖回容器。

**在网关站点块里复刻 CIDR 门槛。** 它输在：包层防火墙已经只对 Cloudflare 放行 443；应用层的 403 只会是同一规则的第二份更弱的副本，还附带自己的同步负担。

## Consequences

production 部署现在需要 sudo（`--ask-become-pass`）执行网关任务，源站侧排障跨两层（应用看 `docker logs grilling-sleek`，网关看 `journalctl -u caddy`）。证书轮换变得更便宜——重跑 playbook，变更的复制触发网关重载，无需重启容器。切换日依赖一次 Ansible 无法执行的控制台编辑（删除 Origin Rule）；该顺序由 runbook 承载。换来的是：这台机器上只有一个 TLS 终结点和一个执行点、源站端口按构造在主机外不可达、边缘真正开始缓存——资产默认缓存，入口 HTML 以 5 分钟为上限。
