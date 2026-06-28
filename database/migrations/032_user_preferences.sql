CREATE TABLE IF NOT EXISTS user_preferences (
  user_did TEXT PRIMARY KEY,
  prefs_json JSONB NOT NULL DEFAULT '{}'
);
