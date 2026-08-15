-- A least-privilege login for Power BI.
--
-- Power BI's DirectQuery connection uses this role. It can read the vw_* views
-- and nothing else: no base tables, no password hashes, no writes.
--
-- Run this once as a superuser, substituting a real password:
--   psql -v pbi_password="'...'" -f 003_powerbi_role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powerbi_reader') THEN
    CREATE ROLE powerbi_reader LOGIN PASSWORD 'change_me_before_deploying';
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM powerbi_reader;
GRANT USAGE ON SCHEMA public TO powerbi_reader;

-- Grant only the analytics views, never the base tables.
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'public' AND table_name LIKE 'vw\_%'
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO powerbi_reader', v.table_name);
  END LOOP;
END
$$;

-- Any future vw_* view still needs an explicit grant; default privileges on
-- views are not filtered by name, so keep this migration as the single place
-- where Power BI's read surface is declared.
