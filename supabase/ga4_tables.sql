-- GA4 → Supabase: tabelas preenchidas por /api/sync-ga4 (cron semanal).
-- Rodar uma vez no Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS ga4_daily (
  date                  date PRIMARY KEY,
  sessions              integer NOT NULL DEFAULT 0,
  total_users           integer NOT NULL DEFAULT 0,
  new_users             integer NOT NULL DEFAULT 0,
  active_users          integer NOT NULL DEFAULT 0,
  page_views            integer NOT NULL DEFAULT 0,
  engaged_sessions      integer NOT NULL DEFAULT 0,
  avg_session_duration  numeric NOT NULL DEFAULT 0,  -- segundos
  bounce_rate           numeric NOT NULL DEFAULT 0,  -- 0..1
  event_count           integer NOT NULL DEFAULT 0,
  synced_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ga4_daily_pages (
  date          date NOT NULL,
  page_path     text NOT NULL,
  page_views    integer NOT NULL DEFAULT 0,
  active_users  integer NOT NULL DEFAULT 0,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, page_path)
);

CREATE TABLE IF NOT EXISTS ga4_daily_traffic (
  date              date NOT NULL,
  source            text NOT NULL,
  medium            text NOT NULL,
  sessions          integer NOT NULL DEFAULT 0,
  total_users       integer NOT NULL DEFAULT 0,
  engaged_sessions  integer NOT NULL DEFAULT 0,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, source, medium)
);

CREATE TABLE IF NOT EXISTS ga4_daily_events (
  date         date NOT NULL,
  event_name   text NOT NULL,
  event_count  integer NOT NULL DEFAULT 0,
  total_users  integer NOT NULL DEFAULT 0,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, event_name)
);

-- Escrita só via service role (bypassa RLS). Leitura liberada para admins.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ga4_daily','ga4_daily_pages','ga4_daily_traffic','ga4_daily_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin reads %s" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "admin reads %s" ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ''admin''))',
      t, t
    );
  END LOOP;
END $$;
