-- Daily feed stats: impressions (all requests) and unique viewers (authenticated).
CREATE TABLE IF NOT EXISTS feed_daily_stats (
  feed_id     TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  impressions BIGINT NOT NULL DEFAULT 0,
  unique_viewers INT NOT NULL DEFAULT 0,
  PRIMARY KEY (feed_id, date)
);

CREATE INDEX IF NOT EXISTS idx_feed_daily_stats_date ON feed_daily_stats (date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON feed_daily_stats TO cfb;
