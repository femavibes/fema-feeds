-- Multi-user auth: Bluesky OAuth sessions, per-user settings, browser sessions.

CREATE TABLE IF NOT EXISTS users (
  did           TEXT PRIMARY KEY,
  handle        TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id            TEXT PRIMARY KEY,
  user_did      TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_user ON browser_sessions(user_did);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_expires ON browser_sessions(expires_at);

/** ATProto OAuth token sets keyed by user DID (persistent session store). */
CREATE TABLE IF NOT EXISTS oauth_sessions (
  user_did      TEXT PRIMARY KEY REFERENCES users(did) ON DELETE CASCADE,
  session_json  JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/** Per-user settings (feedgen, duckdns, etc.). Replaces singleton feedgen for multi-user. */
CREATE TABLE IF NOT EXISTS user_settings (
  owner_did     TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  value_json    JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_did, key)
);

/** Short-lived OAuth CSRF state (auto-expire via application cleanup). */
CREATE TABLE IF NOT EXISTS oauth_state (
  state_key     TEXT PRIMARY KEY,
  value_json    JSONB NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_state(expires_at);
