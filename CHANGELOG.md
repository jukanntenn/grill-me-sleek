# Changelog

## [0.2.0-rc.2] - 2026-07-23

### Added
- Round indicator shows which question batch you're on and how many remain.
- "None of the above" option on questions — pick it when none of the predefined answers fit.
- Auto-recommended answers are pre-selected when opening a question page.
- Self-hosting support — deploy your own instance with Docker and Caddy reverse proxy.
- API documentation available at /docs with Swagger UI.
- CLI structured logging — logs rotate automatically and go to `~/.local/state/grilling-sleek/logs/`.
- CLI persistent configuration — set server, timeouts, and other options via `grilling-sleek config`.

### Changed
- CLI renamed from `grill` to `grilling-sleek` — update your scripts and PATH references.
- CLI is now installed via npm (`npm install -g @grilling-sleek/cli`) instead of bundled in the skill directory.
- Environment variables renamed from `GS_*` to `GRILLING_SLEEK_*` — update your shell configs.
- Server listens on port 8000 instead of 8080 — update your reverse proxy or firewall rules.
- Questions load faster under heavy traffic — SQLite connection pool tuned for high concurrency.

## [0.2.0-rc.1] - 2026-07-15

### Added
- OpenAI Codex support — install manually by copying the skill to `~/.agents/skills/`.
- New web UI rebuilt with React — faster rendering, cleaner layout, and better accessibility.
- Architecture diagram in README showing how the Agent, CLI, Hub, and Browser interact.

### Changed
- Rewritten as CLI + Hub architecture — the Agent talks to a hosted Hub (grillingsleek.online) instead of running a local server. No more Python dependency.
- Now requires Node.js ≥ 22 (the CLI is a bundled Node.js script).
- Skill renamed from `grill-me-sleek` to `grilling-sleek` to match the new architecture.

## [0.1.2] - 2026-06-06

### Added
- Multi-select question support — some questions now let you pick multiple answers with checkboxes.
- Always-visible custom text field on every question — add notes to any answer, not just "Other" options.
- Structured summary confirmation step — the agent presents all decisions in the terminal and waits for your approval before finishing.
- Completion and waiting pages now rendered with the same consistent styling as the question UI.

### Changed
- Questions appear faster — the browser opens as soon as the first batch is ready instead of waiting until all are generated.
- WSL browser auto-open is more reliable — now prioritizes Windows host commands (cmd.exe, wslview, PowerShell).
- Answer submission form correctly captures multi-select choices as a group.

### Fixed
- Running multiple Claude instances simultaneously no longer causes answer mix-ups — each instance gets its own isolated session.
- Custom text is now properly captured even when no predefined option is selected.

## [0.1.1] - 2026-05-29

### Changed
- Optimized web UI with natural layout, compact spacing, text-based selection highlighting, and wider viewport for efficient review.

## [0.1.0] - 2026-05-29

### Added
- Web-based batch interview with all questions at once, recommended answers pre-selected
- Multi-batch iteration in the same browser tab
- Claude Code marketplace installation support (`/plugin install grill-me-sleek@jukanntenn`)
