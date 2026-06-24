-- Enrichment tables (author profiles, post engagement, settings).
-- Apply after init.sql: psql -U postgres -d custom_feed_builder -f database/migrations/001_enrichment.sql

CREATE TABLE IF NOT EXISTS deployment_settings (
  key          TEXT PRIMARY KEY,
  value_json   JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO deployment_settings (key, value_json)
VALUES (
  'enrichment',
  '{
    "enabled": true,
    "enrichAuthors": true,
    "trackEngagement": true,
    "authorProfileTtlHours": 168,
    "authorProfilePruneDays": 90,
    "engagementJetstream": true
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS author_profiles (
  did              TEXT PRIMARY KEY,
  handle           TEXT,
  display_name     TEXT,
  description      TEXT,
  avatar_url       TEXT,
  banner_url       TEXT,
  account_created_at TIMESTAMPTZ,
  indexed_at       TIMESTAMPTZ,
  followers_count  INT NOT NULL DEFAULT 0,
  follows_count    INT NOT NULL DEFAULT 0,
  posts_count      INT NOT NULL DEFAULT 0,
  labels_json      JSONB NOT NULL DEFAULT '[]',
  profile_json     JSONB NOT NULL DEFAULT '{}',
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_author_profiles_expires ON author_profiles (expires_at);

CREATE TABLE IF NOT EXISTS post_engagement (
  post_uri        TEXT PRIMARY KEY REFERENCES ingested_posts(post_uri) ON DELETE CASCADE,
  like_count      INT NOT NULL DEFAULT 0,
  repost_count    INT NOT NULL DEFAULT 0,
  quote_count     INT NOT NULL DEFAULT 0,
  reply_count     INT NOT NULL DEFAULT 0,
  bookmark_count  INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfb;
