-- Removes the read-only Power BI login created by the earlier 003 migration.
--
-- Reporting now lives inside the app, so nothing outside the API connects to
-- this database and the extra role is just standing attack surface. On a fresh
-- database the role never existed and this is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powerbi_reader') THEN
    -- Privileges must go before the role can be dropped.
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM powerbi_reader';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM powerbi_reader';
    EXECUTE 'DROP ROLE powerbi_reader';
  END IF;
END
$$;
