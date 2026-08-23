# AGENTS.md — e2e/

English | [中文](AGENTS.zh.md)

Orders for the Playwright tree only; the root [`AGENTS.md`](../AGENTS.md) carries the repo-wide rules and is never repeated here.

## Commands

```
pnpm test            # pretest brings up docker-compose.local and waits for
                     # /v1/healthz, posttest tears it down
pnpm test:headed     # visible browser; pnpm report shows the last run
```

E2E drives the real stack — real server, real SQLite, real browser (PRINCIPLES: minimal mock, maximal real); only the request boundary may be mocked. `MANUAL.md` (pair: `MANUAL.zh.md`) is the manual-test companion.
