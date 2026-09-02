# GS-RFC: the unified version train, gated end to end

Status: implemented

English | [中文](2026-09-02-unified-version-consistency-gates.zh.md)

## Problem

The repo ships one version number in nine places. What held them together was a checklist in the release skill — and the checklist enumerated only four of them (`.claude-plugin/plugin.json`, `marketplace.json`, two README badges), a list inherited from a plugin-only project template. The rc.2 release commit (`058c739`) had bumped every manifest — `server/Cargo.toml` and all four `package.json` files included; rc.3 (`6311283`) and rc.4 (`bf4602a`) followed the skill literally and bumped exactly its four plus the CHANGELOG. The train split: Cargo.toml and every `package.json` stayed at `0.2.0-rc.2` while the tag, CHANGELOG, badges, and plugin manifests moved to `0.2.0-rc.4`.

Two facts kept the split invisible for two releases. `release.yml` overwrote the CLI version inside CI's ephemeral checkout (`pnpm version --no-git-tag-version`) before publishing to npm, so the JS lane reported rc.4 and looked healthy. And no layer anywhere compared a pushed tag against the manifests: ci.yml triggers on `main` pushes and PRs only, tag pushes run no prek gate, and `docker-publish.yml` built whatever `server/Cargo.toml` said — baking `env!("CARGO_PKG_VERSION")` = 0.2.0-rc.2 into the rc.4 image binary.

The split surfaced only at the production deploy: check_deploy.py compares `/v1/healthz` against `expected_version`, the mismatch failed the deploy, and `a6df4ab` pinned `expected_version` to the binary's real value with an explanatory comment. The deploy playbook's staging path assumed the root package.json reaches Cargo.toml via `scripts/sync-version.py` — an assumption nothing enforced, on a script that covered three of the eight followers and was wired to no gate at all.

## Decision

The version is decided in the repository, and layered mechanical gates make inconsistency unable to commit, land, or publish.

One invariant — the unified version train: root `package.json` (the anchor), `cli/`, `web/`, `e2e/` `package.json`, `server/Cargo.toml`, `.claude-plugin/plugin.json` + `marketplace.json`, and the `README.md`/`README.zh.md` badges all carry the same version at every commit. dsh is not a member — [it rides its own version line](../proposed/2026-09-01-dsh-plugin-distribution.md); CHANGELOG.md is history, not a manifest. `scripts/versionlib.py` defines the member set once, with per-kind readers and surgical setters (git tags drop a leading `v`; shields badges escape `-` as `--`; normalization handles both), so the mutating tool and the gates cannot disagree about membership.

The gate is `scripts/verify_versions.py` — read-only, fail-fast, never auto-fixing — at four layers, each catching what the previous cannot:

1. **The prek `version-sync` hook** (check group, pre-commit): staging any member — or the gate's own scripts — re-checks the whole train, so a half bump cannot be committed. One more member of [prek's single-source gating](./2026-08-15-prek-single-source-of-gating.md).
2. **CI**: `prek run --all-files` already runs the check group on every push and PR; the hook joined it for free. Catches `--no-verify`.
3. **The publish workflows**: release.yml and docker-publish.yml each gained a first `verify` job running `verify_versions.py --expect <tag>` — on both trigger paths, tag push and manual `workflow_dispatch` version input, since tag pushes bypass pre-commit and CI alike. A disagreeing tag creates no GitHub Release, publishes no npm package, pushes no image. release.yml's `pnpm version` publish-time override is deleted: under the gate it is dead code, and it was the exact mechanism that masked npm-side drift.
4. **Deploy**: check_deploy.py's healthz-vs-`expected_version` comparison — the layer that caught this incident. Under the invariant `expected_version` equals `image_tag`; the group_vars field stays explicit as a deliberate-pin escape hatch for known anomalies (the use `a6df4ab` put it to).

The mutating half is `scripts/sync-version.py`: edit the anchor and it propagates to the train (surgical text edits, no re-serialization), re-reads it, and fails unless it is consistent. The release skill's bump step now drives it — anchor edit, `sync-version.py`, `cargo update -p grilling-sleek` for Cargo.lock (whose freshness `clippy --locked` already gates) — then runs the gate before the ceremony continues; the old four-file list, the `README_zh.md` spelling, and the `X.Y.Z`-only validation are fixed with it, and root `package.json`'s `npm version` hook stages the full train.

Landing the gates required realigning the train first — otherwise the hook is born red — so the same batch bumps the laggards to `0.2.0-rc.4`.

## Alternatives considered

**Tag-driven injection (the tag as the source of truth).** Keep the manifests stale and inject the tag version at build time — a docker build-arg for the binary, the existing `pnpm version` for npm. It lost: in-repo builds would report stale versions, `server/Cargo.toml`'s version field would become dead metadata, and the standing contract — healthz reports Cargo.toml, the deploy check compares against it — would need rewriting. The masks this incident revealed are this alternative's permanent state.

**Keep the pin workaround (`expected_version` maintained by hand).** It lost: the split becomes policy. Every release reconciles two numbers by hand, and the deploy check's meaning erodes from "the tag is running" to "whatever the binary happens to say".

**Manifest-driven release, like the dsh line.** Let a push carrying a new version be the release and derive the tag — `dsh-release.yml` does exactly this, and that inverse order is why dsh cannot split this way. It lost for the unified line: the v* ceremony — curated CHANGELOG, confirmation pauses, multi-arch image plus npm plus GitHub Release — exists to be deliberate, and auto-firing on a version-bump push deletes the pause. The dsh cadence argument (daily dogfood cuts) does not apply.

**Fix the skill checklist only, no mechanical gates.** It lost: that is the status quo's exact failure shape. rc.2's full bump lived in process knowledge that was lost when the skill changed, and nothing noticed for two releases. A checklist cannot hold an invariant.

## Consequences

A half bump now fails at `git commit`, a split tree fails CI, and a wrong tag fails before any artifact exists — drift can no longer reach users. `--no-verify` pushes to main remain detect-after-land (red CI, same guarantee class as the documentation gates), but they can no longer become a release. The costs: the member set is a convention that must grow with any new version-bearing file — the prek `files` regex and `versionlib.TRAIN` have to grow together, and a new member added without both is uncovered until noticed; tag and train are now so tightly coupled that re-tagging without a realignment commit is impossible by design (delete the tag, fix the tree, re-tag); and the published `0.2.0-rc.4` image permanently reports `0.2.0-rc.2` — production's `expected_version` stays pinned, with an expiry note in group_vars, until the next release's image deploys. What the trade bought: one number everywhere by construction, local green == CI green == published truth, and the deploy check's original meaning back.
