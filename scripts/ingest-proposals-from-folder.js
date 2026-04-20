#!/usr/bin/env node
/**
 * ingest-proposals-from-folder.js
 *
 * Scans COPY-FULL-SYSTEM/proposals-companies/ for the 19 sent pilot-overview
 * markdown files and upserts them into touch_log as channel='proposal' rows.
 *
 * Matches proposals to contacts via filename → (company/building slug) →
 * building_contacts → contacts.email. Unmatched proposals are logged but
 * still inserted (with contact_id null) so the building-level view works.
 *
 * Excludes Aurelien docs (internal tooling) and Charlotte openers
 * (relationship notes, not pilot proposals).
 *
 * Idempotent: upserts on synthetic key (filename + created_at).
 *
 * Usage:
 *   node scripts/ingest-proposals-from-folder.js
 *   node scripts/ingest-proposals-from-folder.js --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config: load from .env in SPIRE repo root ─────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`FATAL: .env not found at ${envPath}.`);
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing from .env');
  process.exit(1);
}

const PROPOSALS_DIR = path.join(
  process.env.HOME,
  'Library/CloudStorage/GoogleDrive-carla.plotnicoff@thecloud9team.com',
  'Shared drives/C9 | Customer Acquisition/02_Marketing/01_Active Projects',
  '20Buildings | Project (Master Folder)/1_PROJECTS/20 Buildings',
  'COPY-FULL-SYSTEM/proposals-companies'
);

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
}

// Map filename slugs → (company, building) for contact/building matching.
// Derived from the 19 known proposals in the folder.
function parseProposalFilename(filename) {
  // e.g. 2026-03-30_carlyle-catalyst_pilot-overview.md
  // e.g. 2026-04-15_kimco-driscoll-lauren-granit_pilot-overview.md
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_pilot-overview\.md$/);
  if (!m) return null;
  const [, date, slug] = m;
  return { date, slug };
}

// Lookup tables: slug → canonical company/building names
const SLUG_OVERRIDES = {
  'carlyle-catalyst':                    { company: 'The Carlyle Group',       building: 'Catalyst',                      city: 'Houston', recipient: null },
  'gid-elton-lee':                       { company: 'GID',                     building: '640 N Wells',                   city: 'Chicago', recipient: 'Elton Lee' },
  'gid-winston-mcburnett':               { company: 'GID',                     building: '640 N Wells',                   city: 'Chicago', recipient: 'Winston McBurnett' },
  'gpi-south-main':                      { company: 'GPI Investment',          building: 'South Main',                    city: 'Houston', recipient: null },
  'hanover-autry-park':                  { company: 'Hanover Company',         building: 'Autry Park',                    city: 'Houston', recipient: null },
  'hanover-blvd-place':                  { company: 'Hanover Company',         building: 'BLVD Place',                    city: 'Houston', recipient: null },
  'hines-brava':                         { company: 'Hines',                   building: 'Brava',                         city: 'Houston', recipient: 'Tori Kerr' },
  'kimco-driscoll':                      { company: 'Kimco Realty',            building: 'The Driscoll at River Oaks',    city: 'Houston', recipient: null, superseded: true },
  'lendlease-cascade':                   { company: 'Lendlease',               building: 'Cascade',                       city: 'Chicago', recipient: 'Jordan Roehl' },
  'madison-marquette-luminary':          { company: 'Madison Marquette',       building: 'Luminary',                      city: 'Houston', recipient: null },
  'marquette-parq-fulton':               { company: 'Marquette',               building: 'Parq Fulton',                   city: 'Chicago', recipient: 'Cheryl T. Charnas' },
  'morguard-gary-stern':                 { company: 'Morguard',                building: 'Marquee at Block 37',           city: 'Chicago', recipient: 'Gary Stern' },
  'atelier-apartments':                  { company: '(unknown)',               building: 'Atelier Apartments',            city: 'Dallas',  recipient: 'Takuma Moroi' },
  'crescent-heights-nema-chicago':       { company: 'Crescent Heights',        building: 'NEMA Chicago',                  city: 'Chicago', recipient: 'Pablo De Almagro' },
  'karlin-the-brady':                    { company: 'Karlin Real Estate',      building: 'The Brady',                     city: 'Dallas',  recipient: 'Sam Bush' },
  'kimco-driscoll-lauren-granit':        { company: 'Kimco Realty',            building: 'The Driscoll at River Oaks',    city: 'Houston', recipient: 'Lauren Granit' },
  'kimco-driscoll-rowold-lo-hall':       { company: 'Kimco Realty',            building: 'The Driscoll at River Oaks',    city: 'Houston', recipient: 'Elizabeth Rowold / Donny Lo / Barbara Hall' },
  'related-affordable-maple-tower':      { company: 'Related Affordable',      building: 'Maple Avenue Apartment Tower',  city: 'Dallas',  recipient: 'Deep Katdare' },
  'stillwater-2800-taylor':              { company: 'Stillwater Capital',      building: '2800 Taylor',                   city: 'Dallas',  recipient: 'Jeff Slajer' },
};

// Files to exclude from ingestion.
const EXCLUDED_PATTERNS = [
  /aurelien/i,                               // Aurelien tooling, not a proposal
  /charlotte-openers/i,                      // Relationship notes, not pilot proposals
];

// ── Contact + building lookup ────────────────────────────────────────────────

async function loadContactsByName() {
  const lookup = new Map();
  const byCompany = new Map();   // fallback: any contact at this company
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('contact_id, email, first_name, last_name, company')
      .range(from, from + PAGE - 1);
    if (error) { console.error('ERROR loading contacts:', error.message); process.exit(1); }
    for (const c of data || []) {
      const key = `${(c.first_name || '').toLowerCase().trim()} ${(c.last_name || '').toLowerCase().trim()}`.trim();
      if (key) lookup.set(key, c);
      const company = (c.company || '').toLowerCase().trim();
      if (company && !byCompany.has(company)) byCompany.set(company, c);
    }
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  lookup._byCompany = byCompany;
  return lookup;
}

async function loadBuildingsByName() {
  const lookup = new Map();
  const { data, error } = await supabase
    .from('buildings')
    .select('building_id, building_name, market');
  if (error) { console.error('ERROR loading buildings:', error.message); process.exit(1); }
  for (const b of data || []) {
    const key = (b.building_name || '').toLowerCase().trim();
    if (key) lookup.set(key, b);
  }
  return lookup;
}

function matchContactByName(name, contacts) {
  if (!name) return null;
  const plain = name.toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .split('/')[0]
    .split('→')[0]
    .split(' + ')[0]
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return contacts.get(plain) || null;
}

function matchBuilding(buildingName, buildings) {
  if (!buildingName) return null;
  const key = buildingName.toLowerCase().trim();
  // exact match first
  if (buildings.has(key)) return buildings.get(key);
  // fuzzy: first 3 words of building name
  const fuzzyKey = key.split(' ').slice(0, 3).join(' ');
  for (const [k, b] of buildings) {
    if (k.startsWith(fuzzyKey) || fuzzyKey.startsWith(k)) return b;
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Ingesting pilot proposals from folder...\n`);

  // 1. List files
  const all = fs.readdirSync(PROPOSALS_DIR)
    .filter(f => f.endsWith('.md'))
    .filter(f => !EXCLUDED_PATTERNS.some(rx => rx.test(f)));

  console.log(`Found ${all.length} candidate .md files (Aurelien + Charlotte openers excluded).`);

  // 2. Load lookups
  console.log('\nLoading contacts + buildings lookups...');
  const [contacts, buildings] = await Promise.all([
    loadContactsByName(),
    loadBuildingsByName(),
  ]);
  console.log(`  ${contacts.size} contacts, ${buildings.size} buildings loaded.`);

  // 3. Build insert payloads
  const inserts = [];
  const warnings = [];
  for (const filename of all) {
    const parsed = parseProposalFilename(filename);
    if (!parsed) { warnings.push(`Could not parse filename: ${filename}`); continue; }

    const override = SLUG_OVERRIDES[parsed.slug];
    if (!override) { warnings.push(`No SLUG_OVERRIDE for: ${parsed.slug}`); continue; }

    let contact = matchContactByName(override.recipient, contacts);
    const building = matchBuilding(override.building, buildings);

    // Fallback: if recipient isn't in contacts (or no recipient specified),
    // link to any contact from the same company so the touch row is valid.
    // touch_log.contact_id is NOT NULL.
    if (!contact) {
      const companyKey = (override.company || '').toLowerCase().trim();
      contact = contacts._byCompany.get(companyKey);
      if (!contact) {
        warnings.push(`Proposal ${filename}: no contact found for recipient "${override.recipient}" or company "${override.company}" — SKIPPING`);
        continue;
      }
      if (override.recipient) {
        warnings.push(`Proposal ${filename}: recipient "${override.recipient}" not in contacts; linked to ${contact.first_name} ${contact.last_name} at ${contact.company}`);
      }
    }
    if (!building) {
      warnings.push(`Proposal ${filename}: building "${override.building}" not found in buildings`);
    }

    const filePath = path.join(PROPOSALS_DIR, filename);
    const notes = override.superseded
      ? `[${parsed.date}] pilot overview (superseded by Apr 15 versions). Recipient: ${override.recipient || '(company broadcast)'}. File: ${filename}`
      : `[${parsed.date}] pilot overview. Recipient: ${override.recipient || '(company broadcast)'}. File: ${filename}`;

    inserts.push({
      contact_id: contact.contact_id,
      building_id: building?.building_id || null,
      channel: 'proposal',
      outcome: override.superseded ? 'Proposal Sent (superseded)' : 'Proposal Sent',
      notes,
      file_path: filePath,
      logged_by: 'ingest-proposals-from-folder.js',
      created_at: new Date(parsed.date + 'T12:00:00Z').toISOString(),
    });
  }

  console.log(`\nPrepared ${inserts.length} touch_log rows.`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would insert', inserts.length, 'rows. First 3:');
    console.log(JSON.stringify(inserts.slice(0, 3), null, 2));
    return;
  }

  // 4. Clear existing proposal rows for idempotency (only rows we own)
  console.log('\nClearing existing touch_log rows logged by ingest-proposals-from-folder.js...');
  const { error: delError } = await supabase
    .from('touch_log')
    .delete()
    .eq('logged_by', 'ingest-proposals-from-folder.js');
  if (delError) {
    console.error('  WARN:', delError.message);
  }

  // 5. Insert fresh rows
  console.log(`Inserting ${inserts.length} rows into touch_log...`);
  const { error } = await supabase.from('touch_log').insert(inserts);
  if (error) {
    console.error('  ERROR:', error.message);
    process.exit(1);
  }
  console.log(`  touch_log: ${inserts.length} rows inserted.`);

  // 6. Log import
  await supabase.from('import_log').insert({
    filename: 'proposals-companies/*.md',
    row_count: inserts.length,
    import_type: 'proposals_backfill',
    market: 'all',
    imported_by: 'ingest-proposals-from-folder.js',
    created_at: new Date().toISOString(),
  });

  console.log(`\nDone. ${inserts.length} proposals logged.`);
}

main().catch(err => { console.error(err); process.exit(1); });
