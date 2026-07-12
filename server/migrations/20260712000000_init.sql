-- 会话元信息（活跃表，终态时归档后删除）
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT    PRIMARY KEY,               -- 128-bit base64url
    status      INTEGER NOT NULL DEFAULT 0,         -- 0=active, 1=completed, 2=cancelled, 3=expired
    curr_round  INTEGER,                            -- 当前轮 rounds.id（1:1）
    name        TEXT,                               -- 会话名称
    created_at  INTEGER NOT NULL,                   -- Unix 秒
    expires_at  INTEGER NOT NULL,                   -- created_at + SESSION_TTL（3600）
    cancel_reason TEXT,                             -- 取消原因枚举（仅 cancelled 非空）
    cancel_detail TEXT,                             -- 取消补充自由文本（可空）
    cancel_actor  TEXT                              -- user/agent（仅 cancelled）
);

-- 轮次明细（每轮一行，全保留；终态时随会话一起归档后删除）
CREATE TABLE IF NOT EXISTS rounds (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL,                   -- 逻辑轮号（1, 2, 3...）
    name        TEXT,                               -- 该轮名称（可空）
    grilling    TEXT    NOT NULL,                   -- 该轮完整 Grilling JSON
    response    TEXT,                               -- 该轮用户回答 JSON（NULL=未提交）
    created_at  INTEGER NOT NULL,
    UNIQUE (session_id, seq)
);

-- 终态归档（永久保留，用于审计与问题回溯）
CREATE TABLE IF NOT EXISTS session_archive (
    id              TEXT    PRIMARY KEY,            -- 原 session id
    status          INTEGER NOT NULL,               -- 1=completed, 2=cancelled, 3=expired
    name            TEXT,
    cancel_reason   TEXT,
    cancel_detail   TEXT,
    cancel_actor    TEXT,
    total_rounds    INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    archived_at     INTEGER NOT NULL,
    snapshot        TEXT    NOT NULL                -- rounds 列表 JSON
);

CREATE INDEX IF NOT EXISTS idx_sessions_status_expires ON sessions (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_archive_status_archived ON session_archive (status, archived_at);
CREATE INDEX IF NOT EXISTS idx_archive_created         ON session_archive (created_at);
