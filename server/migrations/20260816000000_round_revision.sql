-- Round response revisions: latest answer wins, with a revision counter.
-- No version history — the agent saw prior answers when it polled them.
-- Existing rows default to revision = 1 (never revised), revised_at = NULL.

ALTER TABLE rounds ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rounds ADD COLUMN revised_at INTEGER;
