-- Interest topics + post tags (deployment-scoped; Near You post_interests pattern without ATlas skymap).

CREATE TABLE IF NOT EXISTS interest_topics (
  slug          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  built_in      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interest_match_rules (
  id            SERIAL PRIMARY KEY,
  topic_slug    TEXT NOT NULL REFERENCES interest_topics(slug) ON DELETE CASCADE,
  match_type    TEXT NOT NULL CHECK (match_type IN ('label', 'hashtag', 'keyword')),
  match_value   TEXT NOT NULL,
  confidence    REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (topic_slug, match_type, match_value)
);

CREATE INDEX IF NOT EXISTS idx_interest_match_rules_topic ON interest_match_rules (topic_slug);

CREATE TABLE IF NOT EXISTS post_interest_tags (
  post_uri      TEXT NOT NULL REFERENCES ingested_posts(post_uri) ON DELETE CASCADE,
  topic_slug    TEXT NOT NULL REFERENCES interest_topics(slug) ON DELETE CASCADE,
  confidence    REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source        TEXT NOT NULL CHECK (source IN ('label', 'hashtag', 'keyword', 'builtin')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_uri, topic_slug)
);

CREATE INDEX IF NOT EXISTS idx_post_interest_tags_topic ON post_interest_tags (topic_slug);

INSERT INTO interest_topics (slug, name, description, built_in)
VALUES (
  'nsfw',
  'NSFW',
  'Adult or graphic content — tagged from Bluesky moderation and self-labels',
  true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO interest_match_rules (topic_slug, match_type, match_value, confidence)
VALUES
  ('nsfw', 'label', 'porn', 1.0),
  ('nsfw', 'label', 'sexual', 1.0),
  ('nsfw', 'label', 'nudity', 1.0),
  ('nsfw', 'label', 'graphic-media', 1.0)
ON CONFLICT (topic_slug, match_type, match_value) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfb;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cfb;
