# Cloudflare 部署（production）

[English](deployment.md) | 中文

运维手册：把 production——`https://grillingsleek.online`——在 Cloudflare 之后架起来并保持健康。源站侧跑在 ttyo（`43.133.160.29`），由 [`devops/ansible/deploy.yml`](../devops/ansible/deploy.yml) 部署；拓扑的 why 见 [GS-RFC](../.agents/gs-rfcs/implemented/2026-08-24-production-origin-via-host-gateway.zh.md)。

## Topology

```
Visitor ──HTTPS:443──> Cloudflare edge (proxied, Full strict) ──HTTPS:443──> host Caddy gateway (Origin CA) ──HTTP──> 127.0.0.1:8081 → container Caddy :8443 ──> Rust 127.0.0.1:8000 / static
```

| 层   | 值                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 边缘 | 443，TLS 由 Cloudflare 终结；443 是唯一启用边缘缓存的代理 HTTPS 端口                                        |
| 源站 | 宿主 443 → VPS 上的 systemd Caddy 网关（多服务共享，`import /etc/caddy/conf.d/*.caddy`），持 Origin CA 证书 |
| 应用 | 容器 Caddy 明文 HTTP `:8443`，仅回环发布（`127.0.0.1:8081`）                                                |

网关与宿主防火墙（入站默认拒绝；443 仅放行 Cloudflare 网段）已存在于 ttyo——随共享这台 VPS 的另一个服务一并建立。本手册把 grilling-sleek 接入它们。

## Prerequisites

- 一个 Cloudflare 账户；创建证书的成员需要 API access。
- `grillingsleek.online` 在你控制的注册商处。
- SSH 到 `alice@ttyo`；一份仓库 checkout（ansible inventory 在仓库根）。
- ttyo 上：宿主 Caddy 网关在跑（`systemctl status caddy`）、`/etc/caddy/conf.d/` 就位，以及网关任务所需的 sudo（`--ask-become-pass`）。

## 1. Onboard the zone (Cloudflare console)

1. Dashboard → **Onboard a domain** → 输入 `grillingsleek.online` → **Continue** → 选择计划。
2. 检查扫描出的 DNS 记录；缺的在 DNS → Records 下补齐。
3. 在注册商处把 nameserver 换成 Cloudflare 分配的两个。若注册商侧启用了 DNSSEC，先关闭再切换。
4. 等 zone 状态变为 **Active**。

## 2. Point DNS at the origin (console)

1. DNS → Records → **Add record**：Type `A`、Name `@`、IPv4 address `43.133.160.29`、Proxy status **Proxied**（橙色云）、TTL Auto。
2. **Save**。

## 3. Issue the Origin CA certificate (console)

1. SSL/TLS → Origin Server → **Origin Certificates** → **Create Certificate**。
2. 保持默认：密钥由 Cloudflare 生成（RSA）、主机名 `grillingsleek.online` + `*.grillingsleek.online`、PEM 格式；选择有效期。
3. 复制 **Origin Certificate** 与 **Private Key**——私钥只显示一次。
4. 记下到期日；Cloudflare 不发送到期通知。

## 4. Install the certificate on ttyo

deploy.yml 创建 `~/docker/grilling-sleek/certs/` 但从不取证书。两个文件就位（带外传输；私钥仅属主可读）：

```
# on ttyo, as alice
install -m 0644 origin.pem ~/docker/grilling-sleek/certs/origin.pem
install -m 0600 origin.key ~/docker/grilling-sleek/certs/origin.key
```

playbook 会把它们复制到 `/etc/caddy/certs/grilling-sleek/` 供网关使用（[站点块模板](../devops/ansible/templates/grilling-sleek.caddy.j2)），并在变更时重载网关。

## 5. One-time edge setup (console)

1. **SSL 模式** —— SSL/TLS → Overview：**Full (strict)**，在步骤 4 的证书上机之后设置。
2. **Browser Cache TTL** —— Caching → Configuration：**Respect Existing Headers**，让源站的 `max-age` 原样到达浏览器。
3. **入口 HTML Cache Rule** —— Rules → Overview → Create rule → Cache Rule：规则名 `cache-entry-html`；When incoming requests match：`URI Path` `equals` `/`；Then → Cache eligibility → **Eligible for cache**；Edge TTL 保持未设置，让源站的 `max-age=300` 生效。缺了这条规则，入口 HTML 恒为 `DYNAMIC`——HTML 默认不入缓存。
4. **仅切换日**（从直连 8443 拓扑迁移时）：删除把回源端口改写为 8443 的 Origin Rule——Rules → Overview。边缘必须先能落在 443，下面的部署才能把容器切到仅回环。

## 6. Deploy and verify

1. 从仓库根部署（[AGENTS.md §3](../AGENTS.md#3-commands)）；网关任务需要 root：

```
ansible-playbook devops/ansible/deploy.yml -e target=production --ask-become-pass
```

playbook 先模板化站点块、复制证书并重载网关，**再**把容器重建到 `127.0.0.1:8081`。镜像由 `image_tag` pin；`/v1/healthz` 不上报 `expected_version` 即失败。

2. 健康与版本：`curl -s https://grillingsleek.online/v1/healthz` → `version` 与 [`group_vars/production/vars.yml`](../devops/ansible/group_vars/production/vars.yml) 中 pin 的 tag 一致。
3. 边缘缓存（GET——HEAD 永不缓存）：`curl -sD- -o /dev/null https://grillingsleek.online/ | grep -i cf-cache-status` → 先 `MISS`、重复访问 `HIT`；`/assets/*` 默认可缓存（无需规则）。
4. 从任意非 Cloudflare 网络直连源站按设计失败：`curl -ksI --max-time 5 https://43.133.160.29/` 超时（宿主防火墙丢弃非 CF 的 443），旧的 `:8443` 上不再有任何监听。

## 7. Maintenance

- **轮换 Origin CA 证书**：重复步骤 3–4，再重跑部署命令——复制的变更触发网关重载；容器不受影响。
- **同步 Cloudflare CIDR**：<https://www.cloudflare.com/ips/> 变更时，在 ttyo 上刷新宿主防火墙（唯一执行点），并更新 group_vars 中的 `cloudflare_cidrs`——该变量是清单在文档中的归宿。
- **提高版本 pin**：production 只部署已发布的 tag——新版本需要先 release。

验证失败时：应用侧在 ttyo 上 `docker logs grilling-sleek`，网关侧 `journalctl -u caddy`；恢复方式是 fix-forward。
