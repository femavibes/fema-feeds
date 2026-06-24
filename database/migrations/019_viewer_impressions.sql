-- Viewer follow cache + feed impression / interaction log (ranker personalization).

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

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfb;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cfb;
