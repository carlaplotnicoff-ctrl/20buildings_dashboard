#!/usr/bin/env node
/**
 * import-spire-data.js
 *
 * Imports the 3 master CSVs into a freshly reset Supabase schema.
 * Run AFTER executing reset-schema.sql in the Supabase SQL Editor.
 *
 * Usage:
 *   node scripts/import-spire-data.js
 */

import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://gapfldixgqpmlzwijftm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhcGZsZGl4Z3FwbWx6d2lqZnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTQ3NTYsImV4cCI6MjA5MDYzMDc1Nn0.qf1cX1BacUwMuemFKd7WdUmZ4uDoJNJWnUWBp5fCT3U';

const DATA_DIR = path.join(
  process.env.HOME,
  'Library/CloudStorage/GoogleDrive-carla.plotnicoff@thecloud9team.com',
  'Shared drives/C9 | Customer Acquisition/02_Marketing/01_Active Projects',
  '20Buildings | Project (Master Folder)/1_PROJECTS/SPIRE'
);

const BATCH_SIZE = 500;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function readCsv(filename) {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    console.warn(`  CSV parse warnings in ${filename}:`, result.errors.slice(0, 3));
  }
  return result.data;
}

function clean(val) {
  if (val === undefined || val === null || val === '' || val === 'None' || val === 'nan') return null;
  return val;
}

function toBool(val) {
  if (val === 'True' || val === 'true' || val === '1') return true;
  if (val === 'False' || val === 'false' || val === '0') return false;
  return null;
}

function toNum(val) {
  if (val === '' || val === null || val === undefined) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function insertBatches(table, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`  ERROR inserting batch at row ${i} into ${table}:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`  ${table}: ${inserted}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${inserted} rows inserted.`);
}

// ── Import functions ─────────────────────────────────────────────────────────

function transformBuildings(raw) {
  return raw.map(r => ({
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
}

function transformContacts(raw) {
  return raw.map(r => ({
    contact_id:            clean(r.contact_id),
    email:                 clean(r.email),
    first_name:            clean(r.first_name),
    last_name:             clean(r.last_name),
    job_title:             clean(r.job_title),
    company:               clean(r.company),
    phone:                 clean(r.phone),
    linkedin:              clean(r.linkedin),
    tier:                  clean(r.tier),
    market:                clean(r.market),
    source:                clean(r.source),
    batch:                 clean(r.batch),
    hs_enrolled:           toBool(r.hs_enrolled),
    hs_currently_enrolled: toBool(r.hs_currently_enrolled),
    hs_opened:             toBool(r.hs_opened),
    hs_replied:            toBool(r.hs_replied),
    hs_last_replied:       clean(r.hs_last_replied),
    hs_lead_status:        clean(r.hs_lead_status),
    hs_opted_out:          toBool(r.hs_opted_out),
  }));
}

function transformBuildingContacts(raw) {
  // Deduplicate on (building_name, contact_email)
  const seen = new Set();
  return raw
    .map(r => ({
      building_name: clean(r.building_name),
      contact_email: clean(r.contact_email),
      market:        clean(r.market),
    }))
    .filter(r => {
      if (!r.building_name || !r.contact_email) return false;
      const key = `${r.building_name}||${r.contact_email}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('SPIRE CRM — Data Import');
  console.log('=======================');
  console.log(`Source: ${DATA_DIR}\n`);

  // Buildings
  console.log('Reading buildings.csv...');
  const buildingsRaw = readCsv('buildings.csv');
  const buildings = transformBuildings(buildingsRaw);
  console.log(`  Parsed: ${buildings.length} buildings`);
  await insertBatches('buildings', buildings);

  // Contacts
  console.log('\nReading contacts.csv...');
  const contactsRaw = readCsv('contacts.csv');
  const contacts = transformContacts(contactsRaw);
  console.log(`  Parsed: ${contacts.length} contacts`);
  await insertBatches('contacts', contacts);

  // Building ↔ Contact links
  console.log('\nReading building_contacts.csv...');
  const bcRaw = readCsv('building_contacts.csv');
  const bc = transformBuildingContacts(bcRaw);
  console.log(`  Parsed: ${bc.length} links (after dedup)`);
  await insertBatches('building_contacts', bc);

  console.log('\nDone.');
  console.log(`  Buildings: ${buildings.length}`);
  console.log(`  Contacts:  ${contacts.length}`);
  console.log(`  Links:     ${bc.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
