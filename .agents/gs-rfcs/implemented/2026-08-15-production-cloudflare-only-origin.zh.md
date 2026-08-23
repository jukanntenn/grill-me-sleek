# GS-RFC: production 源站仅限 Cloudflare

Status: implemented

[English](2026-08-15-production-cloudflare-only-origin.md) | 中文

被 [宿主网关记录](./2026-08-24-production-origin-via-host-gateway.zh.md) 取代——production 现在经 443 上的共享宿主 Caddy 网关回源。

## Problem

production（ttyo，公网 IP）要经 TLS 服务访客，又不能暴露一个可被暴力扫描的源站；而 staging 与 production 已经长出两条互相漂移的部署路径。持有自己证书的公网源站让 8443 端口对整个互联网开放，每一个找到它的扫描机器人都会变成 Caddy 的问题（拓扑随 `0defc11` 于 2026-08-15 统一并上锁）。

## Decision

一个 playbook 部署两套环境：`devops/ansible/deploy.yml` 配 `group_vars/{staging,production}` 与 host vars；仓库根的 `ansible.cfg` 持有 inventory 与 avpm vault id。production 流量仅限 Cloudflare：Caddy 在 `:8443` 上用 Cloudflare Origin CA 证书（Full Strict 模式）终结 edge→origin 一程，非 Cloudflare 网段的连接被 `@not_cf` 匹配器以 `403` 拒绝，`trusted_proxies` 使只有 Cloudflare 可以前置 `X-Forwarded-For`——直连伪造的 XFF 会被 Caddy 覆写，堵住伪造缺口。CIDR 清单由 `group_vars/production/vars.yml` 的 `cloudflare_cidrs` 渲染（来源：cloudflare.com/ips）。production 锁定 Docker Hub 版本 tag（`image_tag`，如 `0.2.0-rc.2`；发布时更新），staging 则部署来自 LAN registry `192.168.5.50:5000` 的滚动 `main` tag；`docker-publish.yml` 刻意不为预发布 tag 移动它。部署后健康检查将 `/v1/healthz` 的 `version` 与 `server/Cargo.toml` 比对；密钥使用逐变量 `!vault` 加密与 avpm vault id。

## Alternatives considered

**持有自己证书的公网源站。** 落败：机器是公网 IP；Cloudflare-only 让源站对扫描器不可见，TLS 只信任唯一的对端而不是所有人。

**两套环境的 playbook。** 落败：两个文件必然漂移；一个 playbook 加 group vars 才是单一真源的形态——staging 与 production 靠变量不同，而不是靠脚本不同。

**staging 做成 production 的开放镜像。** 落败：staging 经 LAN HTTP 部署滚动 `main` tag、没有边缘——刻意更便宜——而 production 锁定已发布版本；让两者一致会把 production 的发布仪式搬进每一次 staging 部署。

## Consequences

设计上拒绝直连源站的流量，production 只部署已发布版本——改 production 需要先发布（`release` 技能拥有该流程）。代价：调试源站需要知道 Cloudflare-only 规则（绕过意味着临时放宽 CIDR 匹配器，这是一个刻意的动作）；锁定 tag 意味着只进 staging 的修复在发布前到不了 production；Origin CA 证书按 Cloudflare 的日程过期，必须在主机上轮换。
