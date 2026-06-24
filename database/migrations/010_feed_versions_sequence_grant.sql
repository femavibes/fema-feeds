-- App role needs the feed_versions serial sequence (INSERT uses nextval).

GRANT USAGE, SELECT ON SEQUENCE feed_versions_id_seq TO cfb;
