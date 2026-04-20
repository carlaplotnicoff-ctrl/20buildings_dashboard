-- SPIRE Migration — Run in Supabase SQL Editor
-- Creates new tables and adds columns for the Spire CRM app

-- 1. Touch Log
CREATE TABLE IF NOT EXISTS touch_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT NOT NULL,
  building_id TEXT,
  channel TEXT NOT NULL,
  outcome TEXT NOT NULL,
  notes TEXT,
  objections TEXT,
  next_step TEXT,
  next_step_date DATE,
  logged_by TEXT NOT NULL DEFAULT 'Carla',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Email Replies (synced from HubSpot)
CREATE TABLE IF NOT EXISTS email_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_email TEXT NOT NULL,
  building_name TEXT,
  subject TEXT,
  body_preview TEXT,
  direction TEXT NOT NULL DEFAULT 'INCOMING',
  hs_engagement_id TEXT UNIQUE,
  received_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Stage History
CREATE TABLE IF NOT EXISTS stage_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id TEXT NOT NULL,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'system',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Import Log
CREATE TABLE IF NOT EXISTS import_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  import_type TEXT NOT NULL DEFAULT 'apollo_csv',
  market TEXT,
  imported_by TEXT NOT NULL DEFAULT 'Carla',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Sync Log
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,
  contacts_updated INTEGER DEFAULT 0,
  replies_found INTEGER DEFAULT 0,
  stages_changed INTEGER DEFAULT 0,
  errors TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. New columns on contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_status TEXT DEFAULT 'Not Contacted';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_touches INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_touch_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_touch_channel TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_step TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_step_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 7. RLS policies (allow anon full access — internal tool, no auth)
ALTER TABLE touch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_touch_log" ON touch_log;
CREATE POLICY "anon_all_touch_log" ON touch_log FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_email_replies" ON email_replies;
CREATE POLICY "anon_all_email_replies" ON email_replies FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_stage_history" ON stage_history;
CREATE POLICY "anon_all_stage_history" ON stage_history FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_import_log" ON import_log;
CREATE POLICY "anon_all_import_log" ON import_log FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_sync_log" ON sync_log;
CREATE POLICY "anon_all_sync_log" ON sync_log FOR ALL TO anon USING (true) WITH CHECK (true);
