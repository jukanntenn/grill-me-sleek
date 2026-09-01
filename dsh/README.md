# @grilling-sleek/dsh-tool-grill-user

English | [中文](README.zh.md)

A DeepSeek Harness (dsh) plugin that gives the agent the `grill_user` tool:
one decision-tree branch of structured questions per call, each question with
a recommended answer, and the user's decisions returned as structured JSON.
It is the dsh distribution channel of grill-me-sleek — the same Hub and
answer page the CLI and the packaged skill use, mounted natively as a Cordis
plugin.

## How it answers

`grill_user` asks on two links at once and the first answer wins:

- **Downstream** — the native `userQuestions` waterfall: desktop cards, IM
  bridges, remote apps. Every answerer already in the composition works with
  zero code.
- **Hub** — a grill-me-sleek round on the configured Hub. The user opens the
  answer page (`https://<hub>/#session_id`) on any network and answers there.

The Hub round opens before the card goes out (bounded by a 2 s reveal
budget), so the answer-page URL rides the question card — on the first
question's detail line, the one page every answerer sees — and is logged once
per round; answer on whichever surface you see first. A
Hub round that cannot be opened in time degrades that round to the card only
(warned; the result then carries no `hub`).

The loser is converged: a Hub win withdraws the downstream question
everywhere (the gateway's cancel frame); a downstream win proxy-submits the
answers to the Hub and revises on conflict so both agree. The Harness session
log records the round through the tool call itself — arguments carry the
questions, the result carries the answers and the opened Hub linkage — so
replay and history see what was asked and answered.

## Install

Prerequisite: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`) itself. Then one command:

```sh
dsh plugin --profile web add @grilling-sleek/dsh-tool-grill-user
```

Restart the profile — that is the whole install. The package ships its
`cordis.patch.yml` bundle patch, so the CLI's plugin coordinator mounts it
into the profile's bundle stack; no profile file edits.

Out of the box every round races on the public Hub at
`https://grillingsleek.online` — the same answer page the CLI and the
packaged skill use — so the browser answer surface works with zero
configuration. Point the plugin at a self-hosted Hub instead (or go
hubless) by re-inserting the plugin row with a `config` block in any later
layer — the profile's own `cordis.patch.yml` or a `--patch` overlay; later
layers win per row:

```yaml
- insert:
    - id: tool-grill-user
      name: "@grilling-sleek/dsh-tool-grill-user"
      config:
        baseUrl: "https://your-hub.example.com"
```

With `baseUrl: ""` the plugin runs hubless: user questions are then the
only answer surface, and a profile without any answerer fails the call
immediately instead of hanging.

| Field                  | Default                        | Meaning                                                       |
| ---------------------- | ------------------------------ | ------------------------------------------------------------- |
| `baseUrl`              | `https://grillingsleek.online` | Hub origin serving the answer page; `''` switches to hubless  |
| `maxQuestionsPerRound` | `16`                           | Largest accepted question batch per round (1..64)             |
| `roundTimeoutMs`       | `14400000`                     | How long one round may stay pending before closing as expired |

The plugin also registers the `grilling-sleek` interview skill at runtime
(when a skill registry is present), so `/grilling-sleek` and model-matched
triggering work with no separate skill installation.

Secondary channels: every `dsh-v*` GitHub Release carries the packed
tarball — `dsh plugin --profile web add ./grilling-sleek-dsh-tool-grill-user-<version>.tgz`
— and a git pin also works (`dsh plugin --profile web add github:jukanntenn/grill-me-sleek#<sha>`).
A git install fetches sources and runs the `prepare` build, so allowlist
the package in the profile's `pnpm-workspace.yaml` `allowBuilds` first.

## Version line

`0.0.x` cuts are dogfooding, published as npm `latest` — an untagged
install rides the current one. From `0.1.0-rc.1` on, pre-releases publish
under `next` and `0.1.0` hands `latest` to the stable line. A release is
cut by pushing a `dsh/package.json` version bump to `main`; the workflow
publishes, tags `dsh-v<version>`, and opens the GitHub Release with the
tarball ([GS-RFC 2026-09-01](../.agents/gs-rfcs/proposed/2026-09-01-dsh-plugin-distribution.md)).

## The interview discipline

One branch per call; stable `grill_`-prefixed snake_case question ids; two or
more options with the recommendation marked (`recommended` + `explanation`);
optionless questions are free text. Main agent only — an owned subagent has
no human answerer and its call is rejected before any round exists. Answers
return as `{ roundId, hub?: { sessionId, url }, answers: [{ id, selected,
custom? }] }` — `hub` present whenever the round raced on one — including the
synthesized `grill_additional_notes` catch-all.

## Known limitations

- **No custom session events.** The Harness persistence read path refuses
  event types outside its generated catalog, which only in-repo packages can
  enter — so this plugin records rounds through the standard tool call and
  result instead of a dedicated `grilling/*` event family. A future upstream
  contribution could restore the dedicated family without changing the tool.
- **The losing surface sees a bare withdrawal.** The cancel frame carries no
  payload: other ends learn the question was cancelled, not the winning
  answers.
- **Hub convergence is best effort.** A failed proxy submit or revise is
  logged and swallowed; the round is already answered in the session log.
- **A Hub round that cannot open degrades the round.** The call answers on
  the card alone (warned, and the result carries no `hub`); a misconfigured
  `baseUrl` therefore converges nothing — the warning and the missing field
  are the diagnosis surface.
- **Late answers are dropped by design.** An answer submitted in the
  milliseconds between the race settling and the withdrawal arriving is
  accepted by its surface and silently discarded.
- The package tracks the published dsh alpha channel (`0.1.2-alpha.x`);
  pre-release Harness may rename seams, and this package follows.

Design rationale and the alternatives that lost live in
[GS-RFC 2026-08-31](../.agents/gs-rfcs/implemented/2026-08-31-dsh-grilling-integration.md).
