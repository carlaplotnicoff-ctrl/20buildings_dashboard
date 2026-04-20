import pg from 'pg';
const { Client } = pg;

// Supabase direct connection
const client = new Client({
  host: 'db.gapfldixgqpmlzwijftm.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  // 1. touch_log table
  `CREATE TABLE IF NOT EXISTS touch_log (
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
  )`,

  // 2. email_replies table
  `CREATE TABLE IF NOT EXISTS email_replies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_email TEXT NOT NULL,
    building_name TEXT,
    subject TEXT,
    body_preview TEXT,
    direction TEXT NOT NULL DEFAULT 'INCOMING',
    hs_engagement_id TEXT UNIQUE,
    received_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now()
  )`,

  // 3. stage_history table
  `CREATE TABLE IF NOT EXISTS stage_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    building_id TEXT NOT NULL,
    old_stage TEXT,
    new_stage TEXT NOT NULL,
    changed_by TEXT NOT NULL DEFAULT 'system',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  // 4. import_log table
  `CREATE TABLE IF NOT EXISTS import_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    filename TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    import_type TEXT NOT NULL DEFAULT 'apollo_csv',
    market TEXT,
    imported_by TEXT NOT NULL DEFAULT 'Carla',
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  // 5. sync_log table
  `CREATE TABLE IF NOT EXISTS sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sync_type TEXT NOT NULL,
    contacts_updated INTEGER DEFAULT 0,
    replies_found INTEGER DEFAULT 0,
    stages_changed INTEGER DEFAULT 0,
    errors TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  // 6. New columns on contacts (use DO block to avoid errors if columns exist)
  `DO $$ BEGIN
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_status TEXT DEFAULT 'Not Contacted';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_touches INTEGER DEFAULT 0;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_touch_date DATE;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_touch_channel TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_step TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_step_date DATE;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
  EXCEPTION WHEN duplicate_column THEN NULL;
  END $$`,

  // 7. Enable RLS but allow anon access (internal tool)
  `ALTER TABLE touch_log ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY IF NOT EXISTS "anon_all_touch_log" ON touch_log FOR ALL TO anon USING (true) WITH CHECK (true)`,
  `ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY IF NOT EXISTS "anon_all_email_replies" ON email_replies FOR ALL TO anon USING (true) WITH CHECK (true)`,
  `ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY IF NOT EXISTS "anon_all_stage_history" ON stage_history FOR ALL TO anon USING (true) WITH CHECK (true)`,
  `ALTER TABLE import_log ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY IF NOT EXISTS "anon_all_import_log" ON import_log FOR ALL TO anon USING (true) WITH CHECK (true)`,
  `ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY IF NOT EXISTS "anon_all_sync_log" ON sync_log FOR ALL TO anon USING (true) WITH CHECK (true)`,
];

async function run() {
  console.log('Connecting to Supabase...');
  await client.connect();
  console.log('Connected.\n');

  for (const sql of migrations) {
    const label = sql.slice(0, 60).replace(/\n/g, ' ');
    try {
      await client.query(sql);
      console.log(`OK: ${label}...`);
    } catch (e) {
      // Ignore "already exists" type errors
      if (e.message.includes('already exists')) {
        console.log(`SKIP (exists): ${label}...`);
      } else {
        console.error(`ERR: ${label}...`);
        console.error(`  ${e.message}`);
      }
    }
  }

  console.log('\nMigrations complete.');
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
