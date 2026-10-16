DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'klarbook_app') THEN
    CREATE ROLE klarbook_app NOLOGIN;
  END IF;
END $$;

GRANT klarbook_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO klarbook_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO klarbook_app;