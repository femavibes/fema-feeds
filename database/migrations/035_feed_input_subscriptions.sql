-- Track which community feeds a user has subscribed to as inputs for their own feeds.
CREATE TABLE IF NOT EXISTS feed_input_subscriptions (
  viewer_did TEXT NOT NULL,
  feed_id TEXT NOT NULL,
  feed_name TEXT NOT NULL,
  owner_did TEXT,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (viewer_did, feed_id)
);
