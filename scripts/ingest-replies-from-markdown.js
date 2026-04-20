#!/usr/bin/env node
/**
 * ingest-replies-from-markdown.js
 *
 * One-shot backfill: parses the MASTER-INDEX.md "By City" section
 * (authoritative source with canonical 7-bucket categories) and upserts rows
 * into email_replies. Each row gets source='markdown_backfill' so it's
 * distinguishable from live HubSpot-sync rows.
 *
 * The MASTER-INDEX is chosen over per-city files because it already applies
 * the 7-bucket taxonomy to every reply; per-city files mix formats (tables
 * vs bullet lists in Chicago).
 *
 * Idempotent: upserts on synthetic md_backfill_<city>_<contact>_<building>
 * hs_engagement_id, so re-running is safe.
 *
 * Usage:
 *   node scripts/ingest-replies-from-markdown.js
 *   node scripts/ingest-replies-from-markdown.js --dry-run
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
    console.error(`FATAL: .env not found at ${envPath}. Copy .env.example and fill in credentials.`);
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

const MASTER_INDEX = path.join(
  process.env.HOME,
  'Library/CloudStorage/GoogleDrive-carla.plotnicoff@thecloud9team.com',
  'Shared drives/C9 | Customer Acquisition/02_Marketing/01_Active Projects',
  '20Buildings | Project (Master Folder)/1_PROJECTS/20 Buildings',
  '20_Buildings_context/04_EVIDENCE/replies/MASTER-INDEX.md'
);

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Map MASTER-INDEX subheadings to canonical 7-bucket categories ──────────

function headingToCategory(heading) {
  if (!heading) return null;
  const h = heading.toLowerCase();
  if (h.includes('hot')) return 'HOT_ACTIVE_PITCH';
  if (h.includes('self-id') || h.includes('self\'ve id') || h.includes('self id')) return 'WARM_SELF_IDD_DM';
  if (h.includes('needs pitch')) return 'WARM_NEEDS_PITCH';
  if (h.includes('redirect')) return 'WARM_REDIRECT';
  if (h.includes('research') || h.includes('wrong data')) return 'RESEARCH_WRONG_DATA';
  if (h.includes('structural')) return 'DECLINE_STRUCTURAL';
  if (h.includes('dnc') || h.includes('explicit dnc')) return 'DECLINE_DNC';
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clean(val) {
  if (val === undefined || val === null) return null;
  const s = val.toString().trim();
  if (!s || s === 'None' || s === 'nan' || s === '—' || s === '-') return null;
  return s;
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);
}

function parseDate(dateStr, defaultYear = '2026') {
  if (!dateStr) return null;
  const s = dateStr.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();
  const m = s.match(/([A-Za-z]{3})\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (m) {
    const [, mon, day, yr] = m;
    const d = new Date(`${mon} ${day}, ${yr || defaultYear}`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // "Feb" / "Mar" / "Fresh Start" alone → null
  return null;
}

// ── Parse MASTER-INDEX ──────────────────────────────────────────────────────

function parseMasterIndex(content) {
  const rows = [];
  const lines = content.split('\n');

  let inByCity = false;
  let currentCity = null;
  let currentCategory = null;
  let headers = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Enter the By City section
    if (line.startsWith('## By City')) { inByCity = true; continue; }
    if (inByCity && line.startsWith('## ') && !line.startsWith('## By City')) { break; }
    if (!inByCity) continue;

    // City heading: ### Chicago (46 replies)
    const cityMatch = line.match(/^### ([A-Za-z]+)\s*\(/);
    if (cityMatch) {
      currentCity = cityMatch[1];
      currentCategory = null;
      inTable = false;
      headers = [];
      continue;
    }

    // Category heading: #### 🟢 WARM — Self-ID'd DM (8)
    if (line.startsWith('#### ')) {
      currentCategory = headingToCategory(line);
      inTable = false;
      headers = [];
      continue;
    }

    // Table header/separator detection
    if (line.startsWith('|')) {
      if (line.includes('---')) {
        inTable = true;
        continue;
      }
      // Non-separator pipe row
      if (!inTable && headers.length === 0) {
        // This is the header row ABOVE the separator
        headers = line.split('|').map(h => h.trim().toLowerCase()).filter(h => h !== '');
        continue;
      }
      if (inTable) {
        const cells = line.split('|').map(c => c.trim());
        // Trim leading/trailing empty cells (from leading/trailing pipes)
        const dataCells = cells.slice(1, -1);
        if (dataCells.length === 0) continue;

        const row = {};
        headers.forEach((h, idx) => { row[h] = dataCells[idx] || null; });

        const contact = clean(row.contact || row['contact(s)']);
        if (!contact) continue;

        rows.push({
          city: currentCity,
          contact_raw: contact,
          company: clean(row.company),
          building: clean(row.building),
          reply_category: currentCategory,
          received_at: parseDate(clean(row.date)),
          tier: clean(row.tier || row.sequence),
          status: clean(row.status),
          notes: clean(row['next action'] || row.notes || row.issue || row.objection || row.reason || row.ask || row['→ referred']),
        });
      }
    } else if (inTable) {
      // Empty line ends the table
      inTable = false;
      headers = [];
    }
  }

  return rows;
}

// ── Contact lookup ──────────────────────────────────────────────────────────

async function loadContactsLookup() {
  const lookup = new Map();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('contact_id, email, first_name, last_name, company')
      .range(from, from + PAGE - 1);
    if (error) { console.error('ERROR loading contacts:', error.message); process.exit(1); }
    for (const c of data || []) {
      const first = (c.first_name || '').toLowerCase().trim();
      const last = (c.last_name || '').toLowerCase().trim();
      const name = `${first} ${last}`.trim();
      if (!name) continue;
      // Primary key: just the name
      if (!lookup.has(name)) lookup.set(name, c);
      // Secondary: name + company (for disambiguation)
      const company = (c.company || '').toLowerCase().trim();
      if (company) lookup.set(`${name}|${company}`, c);
    }
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return lookup;
}

function matchContact(row, lookup) {
  // Strip markdown/emoji/arrow noise from name
  const raw = (row.contact_raw || '').toLowerCase();
  const plain = raw
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/[🔥🟢🟡🔵🔴⚫📄✅⏳]/g, '')
    .split('→')[0]
    .split('/')[0]
    .split(' + ')[0]
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const company = (row.company || '').toLowerCase().replace(/\*\*/g, '').trim();
  // Prefer name+company match when available
  if (company && lookup.has(`${plain}|${company}`)) return lookup.get(`${plain}|${company}`);
  return lookup.get(plain) || null;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Ingesting replies from MASTER-INDEX.md...\n`);

  // 1. Parse
  if (!fs.existsSync(MASTER_INDEX)) {
    console.error(`FATAL: MASTER-INDEX.md not found at ${MASTER_INDEX}`);
    process.exit(1);
  }
  const content = fs.readFileSync(MASTER_INDEX, 'utf8');
  const rows = parseMasterIndex(content);
  console.log(`Parsed ${rows.length} rows from MASTER-INDEX.md`);

  // Breakdown per category
  const byCategory = {};
  const byCity = {};
  rows.forEach(r => {
    byCategory[r.reply_category || 'null'] = (byCategory[r.reply_category || 'null'] || 0) + 1;
    byCity[r.city || 'null'] = (byCity[r.city || 'null'] || 0) + 1;
  });
  console.log('\nBy category:');
  Object.entries(byCategory).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('\nBy city:');
  Object.entries(byCity).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // 2. Load contacts
  console.log('\nLoading contacts lookup from Supabase...');
  const lookup = await loadContactsLookup();
  console.log(`  Loaded ${lookup.size} contact keys.`);

  // 3. Build inserts. Skip rows with no matched email (contact_email has NOT NULL
  // constraint). We use a synthetic placeholder so the category data survives —
  // operator can link real emails later via ingest-replies.errors.csv.
  const inserts = [];
  const unmatched = [];
  for (const row of rows) {
    const contact = matchContact(row, lookup);
    const engagementId = `md_backfill_${slugify(row.city)}_${slugify(row.contact_raw)}_${slugify(row.building || 'none')}`;
    const placeholderEmail = `unmatched+${slugify(row.contact_raw) || 'unknown'}@markdown-backfill.local`;

    inserts.push({
      hs_engagement_id: engagementId,
      contact_email: contact?.email || placeholderEmail,
      building_name: row.building,
      subject: null,
      body_preview: row.notes ? row.notes.slice(0, 500) : null,
      full_body: row.notes,
      direction: 'INCOMING',
      received_at: row.received_at,
      synced_at: new Date().toISOString(),
      reply_category: row.reply_category,
      ai_summary: row.notes ? row.notes.slice(0, 200) : null,
      classified_at: new Date().toISOString(),
      city: row.city,
      tier: row.tier,
      source: 'markdown_backfill',
    });

    if (!contact) unmatched.push(row);
  }

  // Dedupe by hs_engagement_id (same contact can appear in multiple MASTER-INDEX
  // tables — e.g. urgent actions + by-city — which would cause an ON CONFLICT
  // error in a single batch). Keep the first occurrence.
  const seen = new Set();
  const deduped = [];
  let duplicatesDropped = 0;
  for (const row of inserts) {
    if (seen.has(row.hs_engagement_id)) { duplicatesDropped++; continue; }
    seen.add(row.hs_engagement_id);
    deduped.push(row);
  }
  const originalCount = inserts.length;
  inserts.length = 0;
  inserts.push(...deduped);
  if (duplicatesDropped) console.log(`  Dropped ${duplicatesDropped} within-batch duplicates (kept ${inserts.length}/${originalCount}).`);

  console.log(`\nMatched contacts: ${inserts.length - unmatched.length}/${inserts.length}`);
  if (unmatched.length) {
    const errorsPath = path.join(__dirname, 'ingest-replies.errors.csv');
    const csv = [
      'city,contact_raw,company,building,category,notes',
      ...unmatched.map(r => [r.city, r.contact_raw, r.company, r.building, r.reply_category, r.notes]
        .map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    fs.writeFileSync(errorsPath, csv);
    console.log(`  ${unmatched.length} unmatched → ${errorsPath}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would upsert', inserts.length, 'rows.');
    console.log('\nSample (first 3):');
    console.log(JSON.stringify(inserts.slice(0, 3), null, 2));
    return;
  }

  // 4. Upsert
  console.log(`\nUpserting ${inserts.length} rows into email_replies...`);
  const BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const batch = inserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from('email_replies')
      .upsert(batch, { onConflict: 'hs_engagement_id' });
    if (error) {
      console.error(`  ERROR at batch ${i}:`, error.message);
      process.exit(1);
    }
    upserted += batch.length;
    process.stdout.write(`  email_replies: ${upserted}/${inserts.length}\r`);
  }
  console.log(`\n  email_replies: ${upserted} rows upserted.`);

  // 5. Log
  await supabase.from('import_log').insert({
    filename: 'MASTER-INDEX.md',
    row_count: upserted,
    import_type: 'reply_backfill',
    market: 'all',
    imported_by: 'ingest-replies-from-markdown.js',
    created_at: new Date().toISOString(),
  });

  console.log(`\nDone. ${upserted} replies ingested. ${unmatched.length} unmatched contacts.`);
}

main().catch(err => { console.error(err); process.exit(1); });
