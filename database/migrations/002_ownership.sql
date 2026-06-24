-- Transfer table ownership to app user (cfb) so migrations work via DATABASE_URL on native Windows.

DO $$
DECLARE
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfb') THEN
    RAISE NOTICE 'Role cfb does not exist — skip ownership transfer';
    RETURN;
  END IF;
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO cfb', r.tablename);
  END LOOP;
END $$;
