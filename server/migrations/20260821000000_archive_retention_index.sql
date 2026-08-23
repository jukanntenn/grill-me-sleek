-- Archive retention: session_archive is no longer kept forever; rows older
-- than GSLEEK_ARCHIVE_RETENTION_DAYS (default 7) are purged in batches by the
-- background retention task. This supersedes the init migration's
-- "永久保留" comment.
--
-- The existing idx_archive_status_archived leads with `status`, so a pure
-- archived_at range scan (the purge predicate) cannot seek it. Dedicated
-- index for the purge range scan.

CREATE INDEX IF NOT EXISTS idx_archive_archived_at ON session_archive (archived_at);
