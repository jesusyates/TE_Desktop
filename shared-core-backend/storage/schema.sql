-- C-7 Shared Core SQLite schema（幂等迁移）
-- 禁止：业务层直接执行本文件；仅 migrate 在启动时加载。

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  market TEXT NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT NOT NULL,
  product TEXT NOT NULL,
  plan TEXT NOT NULL,
  quota INTEGER NOT NULL,
  used INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  product TEXT NOT NULL,
  action TEXT NOT NULL,
  amount INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  market TEXT,
  locale TEXT,
  client_platform TEXT,
  session_version INTEGER,
  task_id TEXT
);

CREATE TABLE IF NOT EXISTS task_audits (
  task_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  product TEXT NOT NULL,
  market TEXT NOT NULL,
  locale TEXT NOT NULL,
  client_platform TEXT NOT NULL,
  plan TEXT,
  quota INTEGER,
  used INTEGER,
  session_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  market TEXT NOT NULL,
  locale TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_versions (
  user_id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events (user_id, product);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_task ON usage_events (task_id);
CREATE INDEX IF NOT EXISTS idx_task_audit_user ON task_audits (user_id);

CREATE TABLE IF NOT EXISTS execution_history (
  history_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  source_task_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exec_hist_user_created ON execution_history (user_id, created_at DESC);
