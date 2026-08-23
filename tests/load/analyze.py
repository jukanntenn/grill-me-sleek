#!/usr/bin/env python3
"""压测结果分析器 —— k6 JSON / sampler 日志 / hold-suite 指标 → Markdown 报告。

子命令：
  k6       <k6.json> [--window 30]      按时间窗聚合每端点 count/p95/错误率
  res      <sampler.log> [--window 30]  资源时间线（mem/anon/fd/wal）
  hold     <dir> <sampler.log>          S1：每级别资源快照 + 每会话边际成本
  contract <k6.json>                    S4：退化契约判定表
仅标准库。
"""

import json
import math
import sys
from collections import defaultdict

MB = 1024 * 1024


import json
import math
import sys
from collections import defaultdict
from datetime import datetime

MB = 1024 * 1024


def iso_to_ms(s):
    """k6 点数据 data.time 是 ISO8601 字符串 → epoch 毫秒。"""
    try:
        return datetime.fromisoformat(s).timestamp() * 1000
    except (ValueError, TypeError):
        return None


def parse_k6(path):
    """返回 {tag: [(t_sec, dur_ms, status)]}，t 以首条记录为 0。"""
    by_tag = defaultdict(list)
    t0 = None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("metric") != "http_req_duration" or d.get("type") != "Point":
                continue
            data = d.get("data", {})
            tags = data.get("tags", {})
            if "status" not in tags:
                continue
            t_ms = iso_to_ms(data.get("time"))
            if t_ms is None:
                continue
            t = t_ms / 1000.0
            if t0 is None:
                t0 = t
            by_tag[tags.get("name", "?")].append((t - t0, data["value"], int(tags["status"])))
    return by_tag


def pctl(vals, p):
    if not vals:
        return 0.0
    s = sorted(vals)
    k = (len(s) - 1) * p / 100.0
    lo, hi = math.floor(k), math.ceil(k)
    return s[lo] if lo == hi else s[lo] + (s[hi] - s[lo]) * (k - lo)


def cmd_k6(path, window=30):
    by_tag = parse_k6(path)
    t_end = max((p[0] for pts in by_tag.values() for p in pts), default=0)
    print(f"# k6 分桶报告（窗口 {window}s，总时长 {t_end:.0f}s）\n")
    print("| 窗口 | 端点 | 数量 | p50 | p95 | 错误(≥400) |")
    print("|---|---|---|---|---|---|")
    nb = int(t_end // window) + 1
    for b in range(nb):
        rows = []
        for tag in sorted(by_tag):
            pts = [p for p in by_tag[tag] if b * window <= p[0] < (b + 1) * window]
            if not pts:
                continue
            durs = [p[1] for p in pts]
            errs = sum(1 for p in pts if p[2] >= 400)
            rows.append((tag, len(pts), pctl(durs, 50), pctl(durs, 95), errs))
        for tag, n, p50, p95, errs in rows:
            print(f"| {b * window}-{(b + 1) * window}s | {tag} | {n} | {p50:.0f} | {p95:.0f} | {errs} |")
    print("\n## 总体\n")
    print("| 端点 | 数量 | p50 | p95 | p99 | 错误 | 5xx |")
    print("|---|---|---|---|---|---|---|")
    for tag in sorted(by_tag):
        pts = by_tag[tag]
        durs = [p[1] for p in pts]
        errs = sum(1 for p in pts if p[2] >= 400)
        s5 = sum(1 for p in pts if p[2] >= 500)
        print(f"| {tag} | {len(pts)} | {pctl(durs, 50):.0f} | {pctl(durs, 95):.0f} | {pctl(durs, 99):.0f} | {errs} | {s5} |")


def parse_mem_str(s):
    """'123.4MiB' → MiB float；空/异常 → 0。"""
    s = (s or "").strip()
    if not s:
        return 0.0
    try:
        if s.endswith("GiB"):
            return float(s[:-3]) * 1024
        if s.endswith("MiB"):
            return float(s[:-3])
        if s.endswith("KiB"):
            return float(s[:-3]) / 1024
        return float(s.rstrip("B"))
    except ValueError:
        return 0.0


def load_sampler(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            d["mem_mib"] = parse_mem_str(d.get("mem"))
            rows.append(d)
    return rows


def cmd_res(path, window=30):
    rows = load_sampler(path)
    if not rows:
        print("no samples")
        return
    t0 = rows[0]["t"]
    print(f"# 资源时间线（窗口 {window}s）\n")
    print("| 窗口 | 容器mem MiB | cpu | anon MiB | file MiB | fd | db MB | wal MB |")
    print("|---|---|---|---|---|---|---|---|")
    buckets = defaultdict(list)
    for r in rows:
        buckets[int((r["t"] - t0) / 1000 // window)].append(r)
    for b in sorted(buckets):
        rs = buckets[b]
        mem = max(r["mem_mib"] for r in rs)
        anon = max(r.get("anon", 0) for r in rs) / 1024
        file_ = max(r.get("file", 0) for r in rs) / 1024
        fd = max(r.get("fd", 0) for r in rs)
        db = max(r.get("db", 0) for r in rs) / MB
        wal = max(r.get("wal", 0) for r in rs) / MB
        def cpu_of(r):
            try:
                return float((r.get("cpu") or "0%").rstrip("%"))
            except ValueError:
                return 0.0  # docker stats 偶发输出 "/"（容器重启窗口）

        cpu = max(cpu_of(r) for r in rs)
        print(f"| {b * window}-{(b + 1) * window}s | {mem:.0f} | {cpu:.0f}% | {anon:.1f} | {file_:.1f} | {fd} | {db:.1f} | {wal:.1f} |")


def cmd_hold(directory, sampler_log):
    markers = []
    with open(f"{directory}/markers.jsonl") as f:
        for line in f:
            if line.strip():
                markers.append(json.loads(line))
    creates = []
    with open(f"{directory}/create-latency.jsonl") as f:
        for line in f:
            if line.strip():
                creates.append(json.loads(line))
    rows = load_sampler(sampler_log)

    # 每级 steady 区间的资源均值（steady_start → steady_end）
    print("# S1 持仓成本 —— 每级稳态资源\n")
    print("| 活跃会话 | SSE 连接 | 创建延迟 p50/p95 (ms) | anon MiB | 容器mem MiB | fd | 每+1000会话边际 anon |")
    print("|---|---|---|---|---|---|---|")
    levels = [m for m in markers if m["event"] == "level_created"]
    prev_anon = None
    prev_level = 0
    for i, m in enumerate(levels):
        level = m["level"]
        steady_start = next((x["t"] for x in markers if x["event"] == "steady_start" and x["level"] == level), None)
        steady_end = next((x["t"] for x in markers if x["event"] == "steady_end" and x["level"] == level), None)
        if not steady_start or not steady_end:
            continue
        rs = [r for r in rows if steady_start <= r["t"] <= steady_end]
        anon = max((r.get("anon", 0) for r in rs), default=0) / 1024
        mem = max((r["mem_mib"] for r in rs), default=0)
        fd = max((r.get("fd", 0) for r in rs), default=0)
        cs = [c for c in creates if m["t"] <= c["t"] < (levels[i + 1]["t"] if i + 1 < len(levels) else float("inf"))]
        lat = [c["ms"] for c in cs]
        sse = next((x.get("sse", 0) for x in markers if x["event"] == "level_sse_connected" and x["level"] == level), "-")
        marg = "-"
        if prev_anon is not None and level > prev_level:
            marg = f"{(anon - prev_anon) * 1000 / (level - prev_level):.1f} MiB"
        print(f"| {level} | {sse} | {pctl(lat, 50):.0f}/{pctl(lat, 95):.0f} | {anon:.1f} | {mem:.0f} | {fd} | {marg} |")
        prev_anon, prev_level = anon, level


def cmd_outcomes(path):
    """会话结局分布（session_outcome 点数据聚合）。"""
    counts = {}
    total = 0
    with open(path) as f:
        for line in f:
            if '"session_outcome"' not in line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("metric") != "session_outcome" or d.get("type") != "Point":
                continue
            kind = d["data"].get("tags", {}).get("kind", "?")
            counts[kind] = counts.get(kind, 0) + d["data"]["value"]
            total += d["data"]["value"]
    print("# 会话结局分布\n")
    for k, v in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"- {k}: {v} ({v * 100 / max(total, 1):.1f}%)")
    print(f"- 合计: {total}")


def cmd_contract(path):
    """S4 退化契约判定（预算见 tests/load/README.md）。"""
    by_tag = parse_k6(path)
    t_end = max((p[0] for pts in by_tag.values() for p in pts), default=0)
    third = t_end / 3.0

    def stats(tag, lo, hi):
        pts = [p for p in by_tag.get(tag, []) if lo <= p[0] < hi]
        durs = [p[1] for p in pts]
        return {
            "n": len(pts),
            "p95": pctl(durs, 95),
            "err": sum(1 for p in pts if p[2] >= 400),
            "s5xx": sum(1 for p in pts if p[2] >= 500),
        }

    print("# S4 退化契约判定\n")
    verdicts = []

    # ① 读路径 p95 劣化 <3×（首 1/3 vs 末 1/3）
    for tag in ("get_current", "agent_poll"):
        a, b = stats(tag, 0, third), stats(tag, 2 * third, t_end)
        ratio = b["p95"] / a["p95"] if a["p95"] else float("inf")
        ok = ratio < 3
        verdicts.append(ok)
        print(f"- {'✅' if ok else '❌'} ① 读 {tag} p95 劣化 ×{ratio:.2f}（{a['p95']:.0f}→{b['p95']:.0f}ms，预算 <3×）")

    # ② 存量写最终成功率 >99%（submit/revise/complete/cancel 全程 2xx 率）
    writes = [p for tag in ("submit_response", "revise_response", "complete_session", "cancel_session")
              for p in by_tag.get(tag, [])]
    if writes:
        ok = sum(1 for p in writes if p[2] < 300) / len(writes) > 0.99
        ok = ok and sum(1 for p in writes if p[2] >= 500) == 0
        verdicts.append(ok)
        succ = sum(1 for p in writes if p[2] < 300)
        s5 = sum(1 for p in writes if p[2] >= 500)
        print(f"- {'✅' if ok else '❌'} ② 存量写 {succ}/{len(writes)} 成功，5xx={s5}（预算 >99% 且 0 个 5xx）")

    # ③ 新建被拒必须是 429/503+Retry-After，不允许 500
    for tag in ("create_session", "create_round"):
        pts = by_tag.get(tag, [])
        s5 = [p for p in pts if p[2] >= 500]
        s429 = sum(1 for p in pts if p[2] in (429, 503))
        ok = len(s5) == 0
        verdicts.append(ok)
        print(f"- {'✅' if ok else '❌'} ③ {tag}: 500×{len(s5)}，429/503×{s429}（预算 0 个 500）")

    passed = sum(1 for v in verdicts if v)
    print(f"\n**契约判定：{passed}/{len(verdicts)} 项达标**\n")
    print("（④OOM/WAL ⑤恢复 由 res 子命令与容器事件另行判定）")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    cmd, path = sys.argv[1], sys.argv[2]
    window = 30
    args = sys.argv[3:]
    if "--window" in args:
        window = int(args[args.index("--window") + 1])
    if cmd == "k6":
        cmd_k6(path, window)
    elif cmd == "res":
        cmd_res(path, window)
    elif cmd == "hold":
        cmd_hold(path, sys.argv[3])
    elif cmd == "contract":
        cmd_contract(path)
    elif cmd == "outcomes":
        cmd_outcomes(path)
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
