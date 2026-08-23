# AGENTS.md — e2e/

[English](AGENTS.md) | 中文

仅对 Playwright 树生效的命令；仓库级规则在根 [`AGENTS.md`](../AGENTS.zh.md)，此处绝不重复。

## Commands

```
pnpm test            # pretest brings up docker-compose.local and waits for
                     # /v1/healthz, posttest tears it down
pnpm test:headed     # visible browser; pnpm report shows the last run
```

E2E 驱动真实栈——真实 server、真实 SQLite、真实浏览器（PRINCIPLES：minimal mock, maximal real）；只有请求边界可以 mock。`MANUAL.zh.md`（配对：`MANUAL.md`）是手动测试 companion。
