-- Custom Feed Builder â€” initial schema (slice 2)
-- Run automatically via docker-compose on first start.

CREATE TABLE IF NOT EXISTS ingested_posts (
  post_uri     TEXT PRIMARY KEY,
  cid          TEXT NOT NULL,
  author_did   TEXT NOT NULL,
  indexed_at   TIMESTAMPTZ NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}',
  rank_snapshot JSONB NOT NULL DEFAULT '{}',
  expires_at   TIMESTAMPTZ,
  labels_checked_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingested_posts_expires ON ingested_posts (expires_at);
CREATE INDEX IF NOT EXISTS idx_ingested_posts_author ON ingested_posts (author_did);
CREATE INDEX IF NOT EXISTS idx_ingested_posts_labels_checked
  ON ingested_posts (labels_checked_at NULLS FIRST);

-- GIN indexes on common filter fields inside the eval snapshot (summary_json).
CREATE INDEX IF NOT EXISTS idx_ingested_posts_summary_facet_tags
  ON ingested_posts USING GIN ((summary_json->'facetTags'));
CREATE INDEX IF NOT EXISTS idx_ingested_posts_summary_outline_tags
  ON ingested_posts USING GIN ((summary_json->'outlineTags'));
CREATE INDEX IF NOT EXISTS idx_ingested_posts_summary_labels
  ON ingested_posts USING GIN ((summary_json->'allLabelVals'));
CREATE INDEX IF NOT EXISTS idx_ingested_posts_summary_self_labels
  ON ingested_posts USING GIN ((summary_json->'selfLabels'));
CREATE INDEX IF NOT EXISTS idx_ingested_posts_summary_hidden_facet_tags
  ON ingested_posts USING GIN ((summary_json->'hiddenFacetTags'));

CREATE TABLE IF NOT EXISTS labeler_sources (
  did          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  is_builtin   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO labeler_sources (did, name, enabled, is_builtin)
VALUES ('did:plc:ar7c4by46qjdydhdevvrndac', 'Bluesky Moderation', true, true)
ON CONFLICT (did) DO NOTHING;

CREATE TABLE IF NOT EXISTS labeler_stream_cursors (
  labeler_did TEXT PRIMARY KEY,
  cursor_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingested_post_projects (
  post_uri    TEXT NOT NULL REFERENCES ingested_posts(post_uri) ON DELETE CASCADE,
  project_id  TEXT NOT NULL,
  matched_via TEXT NOT NULL CHECK (matched_via IN ('author', 'jetstream', 'plugin')),
  PRIMARY KEY (post_uri, project_id)
);

CREATE TABLE IF NOT EXISTS author_list_cache (
  list_id        TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  source_json    JSONB NOT NULL,
  dids           TEXT[] NOT NULL DEFAULT '{}',
  member_count   INT NOT NULL DEFAULT 0,
  graph_name     TEXT,
  refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_poll_at   TIMESTAMPTZ,
  remote_poll_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_author_list_cache_remote_poll
  ON author_list_cache (remote_poll_key)
  WHERE remote_poll_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_author_list_cache_poll ON author_list_cache (next_poll_at);

CREATE TABLE IF NOT EXISTS feed_candidates (
  feed_id      TEXT NOT NULL,
  post_uri     TEXT NOT NULL REFERENCES ingested_posts(post_uri) ON DELETE CASCADE,
  score        DOUBLE PRECISION NOT NULL DEFAULT 0,
  sort_key     DOUBLE PRECISION NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feed_id, post_uri)
);

CREATE INDEX IF NOT EXISTS idx_feed_candidates_sort ON feed_candidates (feed_id, sort_key DESC);

CREATE TABLE IF NOT EXISTS viewer_follow_cache (
  viewer_did    TEXT PRIMARY KEY,
  followed_dids TEXT[] NOT NULL DEFAULT '{}',
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_viewer_follow_cache_expires ON viewer_follow_cache (expires_at);

CREATE TABLE IF NOT EXISTS feed_served_posts (
  viewer_did        TEXT NOT NULL,
  feed_id           TEXT NOT NULL,
  post_uri          TEXT NOT NULL,
  req_id            TEXT NOT NULL,
  position          INT NOT NULL DEFAULT 0,
  served_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at           TIMESTAMPTZ,
  impression_count  INT NOT NULL DEFAULT 1,
  PRIMARY KEY (viewer_did, feed_id, post_uri)
);

CREATE INDEX IF NOT EXISTS idx_feed_served_posts_viewer_feed
  ON feed_served_posts (viewer_did, feed_id, served_at DESC);

CREATE TABLE IF NOT EXISTS viewer_post_interactions (
  viewer_did   TEXT NOT NULL,
  post_uri     TEXT NOT NULL,
  event        TEXT NOT NULL CHECK (event IN (
    'interactionSeen',
    'interactionLike',
    'interactionRepost',
    'interactionReply',
    'interactionQuote',
    'interactionShare'
  )),
  feed_id      TEXT,
  req_id       TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (viewer_did, post_uri, event)
);

CREATE INDEX IF NOT EXISTS idx_viewer_post_interactions_viewer
  ON viewer_post_interactions (viewer_did, occurred_at DESC);

-- Enrichment (author profiles, engagement counters, deployment settings)
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
    "resolveLabelerLabels": true,
    "labelStreamEnabled": true,
    "labelRefreshEnabled": true,
    "labelRefreshIntervalMinutes": 5,
    "labelRefreshMaxAgeDays": 7,
    "labelRefreshBatchSize": 40,
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

-- App user (created by setup-windows.ps1) needs access to tables owned by postgres superuser.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfb;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfb;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cfb;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cfb;
