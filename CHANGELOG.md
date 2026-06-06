# Changelog

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
