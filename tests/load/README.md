# 压力测试

两层设施：

- **CI 门禁**（`core-flow.js`）：固定简化的双角色流程 + 档位，tag 推送跑 smoke。
- **真实场景套件**（`lifecycle.js` + Node 工具）：按业务画像建模，回答
  甜点区 / 最大活跃会话 / 退化行为 / 韧性问题。生产上线前手动执行。

两者都跑在 `docker/docker-compose.load.yml` 的受限环境上（模拟生产 VPS：
2 vCPU / 2 GiB / 无 swap），结果对线上容量有直接参考意义。

## 业务画像参数表（lifecycle.js / hold-suite 的建模依据）

已从源码核实的客户端行为：agent 长轮询 `wait≤55s` 连续循环、默认 10min
放弃；ky 对 429/5xx 重试 3 次并尊重 Retry-After；创建带 Idempotency-Key；
每 tab 一条 SSE，断开后无抖动指数退避（1→30s）+ GET current 重同步。

| 参数     | 取值                                            |
| -------- | ----------------------------------------------- |
| 会话结局 | 完成 60% / 取消 10% / 弃答 30%（挂到 TTL 1h）   |
| 轮数     | 1 轮 40% / 2 轮 35% / 3 轮 25%                  |
| 修订     | 每个已答轮 20% 概率修订 1-2 次                  |
| 载荷     | P50 8KB / P99 ~32KB / 峰值 63KB（种子化可复现） |
| 时序     | 读题 P50 30s / 轮间 P50 120s（对数正态）        |
| 传输     | 全请求带 Accept-Encoding: gzip（对齐 CF/Caddy） |

## CI 门禁（core-flow.js 档位）

| 档位      | 负载                | 用途                                     |
| --------- | ------------------- | ---------------------------------------- |
| `smoke`   | 10 VU × 1m          | CI 冒烟（tag 推送默认），链路与基线吞吐  |
| `steps`   | 10→200 VU 阶梯 ~15m | 甜点区粗扫：p95 / 错误率 / 内存拐点      |
| `soak`    | 30 VU × 30m         | 稳定性：WAL 增长、内存泄漏、sweeper 行为 |
| `extreme` | 500 VU × 1.5m       | 极限：配合资源限制找崩塌点               |

## 真实场景套件

| 场景    | 工具                     | 回答的问题                                  |
| ------- | ------------------------ | ------------------------------------------- |
| S1 持仓 | `hold-suite.mjs`         | 2 GiB 下最多多少活跃会话；每会话边际 RSS/FD |
| S2 到达 | `lifecycle.js` arrival   | QoS 预算内最大新会话/min（甜点区正式数字）  |
| S3 尖峰 | `lifecycle.js` + tc 整形 | HN 时刻（60s 内 0→500 会话）扛不扛得住      |
| S4 退化 | `lifecycle.js` ×2/×5     | 过载时是否「拒新保老」而非全崩              |
| S5 风暴 | `sse-holder.mjs`+chaos   | 服务端闪断后无抖动退避的同步重连波          |
| S6 恢复 | `chaos.sh kill9`         | 崩溃恢复时间随活跃数的扩展性                |
| S7 浸泡 | `lifecycle.js` 2-4h      | 长时间下 WAL/内存/FD 增长                   |
| S8 链路 | 手工低量过 CF            | SSE keepalive / 长轮询 / 压缩 / 缓存生效性  |

### S4 退化契约（判定见 `analyze.py contract`）

1. 读路径（get_current / agent_poll）p95 劣化 < 3×（对比首末 1/3 窗口）
2. 存量会话写（submit/revise/complete/cancel）成功 >99% 且 0 个 5xx
3. 新建（create_session / create_round）0 个 500 —— 拒绝必须是 429/503+Retry-After
4. 无 OOM-kill、WAL < 100MB（sampler 曲线判定）
5. 负载回落后 5min 内指标回基线

## 工具

```bash
# 资源采样（容器 mem/cpu + 后端进程 anon/file/fd + db/wal 尺寸）
./sampler.sh grill-load /tmp/s1-sampler.log 5

# 混沌：kill9（只杀后端，s6 拉起）/ restart（整容器）
./chaos.sh kill9 | restart

# 分析：k6 分桶 / 资源曲线 / S1 边际成本 / 结局分布 / S4 契约
python3 analyze.py k6 <k6.json> [--window 30]
python3 analyze.py res <sampler.log>
python3 analyze.py hold <hold-out-dir> <sampler.log>
python3 analyze.py outcomes <k6.json>
python3 analyze.py contract <k6.json>
```

lifecycle.js 关键环境变量：`MODE=arrival`（开模型，`ARRIVAL_RATE_PER_MIN` +
`RAMP` + `HOLD`）、`DURATION_SCALE`（压缩人类时间，**仅验证用，正式跑必须 1**）、
`SEED`（载荷种子）。

## 本地运行

```bash
# 起受限环境（镜像需已存在：本地构建或指向私有 registry）
GSLEEK_LOAD_IMAGE=192.168.5.50:5000/grilling-sleek:main \
  docker compose -f docker/docker-compose.load.yml up -d

# 例：到达率扫描
k6 run -e MODE=arrival -e ARRIVAL_RATE_PER_MIN=64 -e RAMP=2m -e HOLD=6m \
  --out json=results.json tests/load/lifecycle.js

# 可选：模拟 3 Mbps 出口（只整出方向/下载方向）
docker exec grill-load sh -c \
  'apk add -q iproute2 && tc qdisc add dev eth0 root tbf rate 3mbit burst 32kbit latency 400ms'
```

带宽结论看 k6 的 `data_received`（已带 gzip，即线上字节）与 3 Mbps 上限的
余量：生产在 Cloudflare 之后，静态资源走 CDN 不占源站带宽，源站只有
`/v1/*` API 流量。

## 已知边界

- k6 不支持流式响应 —— SSE 并发成本由 `hold-suite.mjs` / `sse-holder.mjs`
  （Node 原生 socket）覆盖。
- 后端被 kill -9 时，经 Caddy 的 HTTP/1.1 SSE 连接不会立刻断开（挂到
  keepalive 超时 ~85-100s）——S5 风暴用 `restart` 模式制造确定性断连。
- 容量压测直打源站，不过 Cloudflare（尊重免费代理；S8 仅低量功能验证过 CF）。
- `SESSION_TTL` 是编译期常量（1h），到期回收行为只能靠 ≥2h 浸泡覆盖。
