-- 007 created feed_drafts / feed_versions as superuser; app role needs table + sequence access.

GRANT SELECT, INSERT, UPDATE, DELETE ON feed_drafts, feed_versions TO cfb;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cfb;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cfb;
