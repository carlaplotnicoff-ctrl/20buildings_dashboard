#!/usr/bin/env node
/**
 * upsert-batch5-buildings.js
 *
 * Reads buildings.csv and upserts only batch=5 rows into Supabase.
 * Safe to run on an existing database — uses upsert (on conflict update).
 *
 * Usage:
 *   node scripts/upsert-batch5-buildings.js
 */

import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://gapfldixgqpmlzwijftm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhcGZsZGl4Z3FwbWx6d2lqZnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTQ3NTYsImV4cCI6MjA5MDYzMDc1Nn0.qf1cX1BacUwMuemFKd7WdUmZ4uDoJNJWnUWBp5fCT3U';

const DATA_DIR = path.join(
  process.env.HOME,
  'Library/CloudStorage/GoogleDrive-carla.plotnicoff@thecloud9team.com',
  'Shared drives/C9 | Customer Acquisition/02_Marketing/01_Active Projects',
  '20Buildings | Project (Master Folder)/1_PROJECTS/SPIRE'
);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function clean(val) {
  if (val === undefined || val === null || val === '' || val === 'None' || val === 'nan') return null;
  return val;
}

function toNum(val) {
  if (val === '' || val === null || val === undefined) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function main() {
  console.log('SPIRE — Upsert Batch 5 Buildings');
  console.log('=================================');

  const filePath = path.join(DATA_DIR, 'buildings.csv');
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, errors } = Papa.parse(raw, { header: true, skipEmptyLines: true });

  if (errors.length > 0) {
    console.warn('CSV parse warnings:', errors.slice(0, 3));
  }

  // Filter to batch 5 only
  const batch5 = data.filter(r => r.batch === '5');
  console.log(`Found ${batch5.length} batch-5 buildings in buildings.csv`);

  if (batch5.length === 0) {
    console.error('No batch-5 rows found — check the batch column in buildings.csv');
    process.exit(1);
  }

  const rows = batch5.map(r => ({
    building_id:        clean(r.building_id),
    building_name:      clean(r.building_name),
    address:            clean(r.address),
    market:             clean(r.market),
    source:             clean(r.source),
    total_units:        toNum(r.total_units),
    owner_1:            clean(r.owner_1),
    owner_2:            clean(r.owner_2),
    owner_3:            clean(r.owner_3),
    management_company: clean(r.management_company),
    pain_point:         clean(r.pain_point),
    stage:              clean(r.stage),
    batch:              clean(r.batch),
    concessions:        clean(r.concessions),
    contacted:          clean(r.contacted),
    notes:              clean(r.notes),
  }));

  console.log('\nBuildings to upsert:');
  rows.forEach(r => console.log(`  ${r.building_id} — ${r.building_name} (PP:${r.pain_point}, stage:${r.stage})`));

  console.log('\nUpserting into Supabase...');
  const { data: result, error } = await supabase
    .from('buildings')
    .upsert(rows, { onConflict: 'building_id' });

  if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }

  console.log(`\nDone. ${rows.length} buildings upserted successfully.`);

  // Verify by querying back
  const { data: verify, error: verifyErr } = await supabase
    .from('buildings')
    .select('building_id, building_name, pain_point, stage')
    .eq('batch', '5')
    .order('building_id');

  if (verifyErr) {
    console.warn('Verification query failed:', verifyErr.message);
  } else {
    console.log(`\nVerification — ${verify.length} batch-5 buildings in Supabase:`);
    verify.forEach(b => console.log(`  ${b.building_id} — ${b.building_name} (PP:${b.pain_point}, ${b.stage})`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
