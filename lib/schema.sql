CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Row Level Security
-- ============================================================
-- RLS is enabled on all tables.  This app is backend-only
-- (Next.js API routes using the service_role key), so the
-- service role bypasses RLS automatically.  The policies below
-- ensure that any accidental anon/authenticated requests are
-- also permitted (adjust if you ever add auth-gated features).

ALTER TABLE persons                ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_company_edges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_cache              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_graphs           ENABLE ROW LEVEL SECURITY;

-- Allow full access for the service role (used by the API)
CREATE POLICY "service_role_all_persons"              ON persons              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_companies"            ON companies            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_person_company_edges" ON person_company_edges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_llm_cache"            ON llm_cache            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_settings"             ON settings             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_saved_graphs"         ON saved_graphs         FOR ALL USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT UNIQUE NOT NULL,
  summary TEXT,
  photo_url TEXT,
  raw_llm_response JSONB,
  llm_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT UNIQUE NOT NULL,
  description TEXT,
  products TEXT,
  history TEXT,
  logo_url TEXT,
  domain TEXT,
  raw_llm_response JSONB,
  llm_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS person_company_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position TEXT,
  start_year INTEGER,
  end_year INTEGER,
  projects JSONB,
  coworkers JSONB,
  reports_to TEXT,
  performance_comments TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(person_id, company_id, position)
);

CREATE TABLE IF NOT EXISTS llm_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_type TEXT NOT NULL,
  query_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(query_type, query_key, provider)
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_provider TEXT NOT NULL DEFAULT 'anthropic',
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO settings (id, active_provider) VALUES (1, 'anthropic')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS saved_graphs (
  id TEXT PRIMARY KEY,
  name TEXT,
  persons JSONB NOT NULL,
  companies JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add image columns to existing tables (safe to run repeatedly)
DO $$ BEGIN
  ALTER TABLE persons ADD COLUMN IF NOT EXISTS photo_url TEXT;
  ALTER TABLE persons ADD COLUMN IF NOT EXISTS resume_url TEXT;
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add missing columns to saved_graphs (safe to run repeatedly)
DO $$ BEGIN
  ALTER TABLE saved_graphs ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE saved_graphs ADD COLUMN IF NOT EXISTS persons JSONB;
  ALTER TABLE saved_graphs ADD COLUMN IF NOT EXISTS companies JSONB;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
