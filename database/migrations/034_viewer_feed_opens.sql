-- Track when each viewer last opened each feed (for hours_since_last_open signal)
CREATE TABLE IF NOT EXISTS viewer_feed_opens (
  viewer_did TEXT NOT NULL,
  feed_id TEXT NOT NULL,
  last_open_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (viewer_did, feed_id)
);
