#!/usr/bin/env node
/**
 * recompute-contact-denorms.js
 *
 * Refreshes the denormalized reply summary fields on contacts:
 *   - latest_reply_category
 *   - latest_reply_date
 *   - proposal_count
 *   - next_action
 *
 * Runs AFTER ingest-replies-from-markdown.js + ingest-proposals-from-folder.js
 * have populated email_replies and touch_log.
 *
 * Safe to re-run any time. Future: replace with SQL trigger on email_replies
 * and touch_log for automatic maintenance.
 *
 * Usage:
 *   node scripts/recompute-contact-denorms.js
 *   node scripts/recompute-contact-denorms.js --dry-run
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

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Must mirror the 7-category enum in SQL + data.js.
const NEXT_ACTION_MAP = {
  'HOT_ACTIVE_PITCH':    'Continue thread',
  'WARM_SELF_IDD_DM':    'Send Phase 2 pitch',
  'WARM_NEEDS_PITCH':    'Send discovery pitch',
  'WARM_REDIRECT':       'Cold email referred contact',
  'RESEARCH_WRONG_DATA': 'Verify ownership',
  'DECLINE_STRUCTURAL':  'Log objection; no retry',
  'DECLINE_DNC':         'DNC flag',
};

async function fetchAllPaged(table, select) {
  const rows = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) { console.error(`ERROR reading ${table}:`, error.message); process.exit(1); }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Recomputing contact denormalizations...\n`);

  // 1. Load latest reply per contact
  console.log('Loading email_replies...');
  const replies = await fetchAllPaged('email_replies', 'contact_email, reply_category, received_at');
  console.log(`  ${replies.length} reply rows loaded.`);

  const latestByEmail = new Map();
  for (const r of replies) {
    if (!r.contact_email) continue;
    const existing = latestByEmail.get(r.contact_email);
    if (!existing || (r.received_at && r.received_at > (existing.received_at || ''))) {
      latestByEmail.set(r.contact_email, r);
    }
  }
  console.log(`  ${latestByEmail.size} unique contacts have replies.`);

  // 2. Load proposal counts per contact
  console.log('\nLoading touch_log proposals...');
  const touches = await fetchAllPaged('touch_log', 'contact_id, channel');
  const proposalCountById = new Map();
  for (const t of touches) {
    if (t.channel !== 'proposal' || !t.contact_id) continue;
    proposalCountById.set(t.contact_id, (proposalCountById.get(t.contact_id) || 0) + 1);
  }
  console.log(`  ${proposalCountById.size} contacts have at least one proposal.`);

  // 3. Load contacts to update
  console.log('\nLoading contacts...');
  const contacts = await fetchAllPaged('contacts', 'contact_id, email');
  console.log(`  ${contacts.length} contacts loaded.`);

  // 4. Build update payloads
  const updates = [];
  for (const c of contacts) {
    const latest = latestByEmail.get(c.email);
    const proposalCount = proposalCountById.get(c.contact_id) || 0;

    // skip contacts with nothing to update
    if (!latest && proposalCount === 0) continue;

    updates.push({
      contact_id: c.contact_id,
      latest_reply_category: latest?.reply_category || null,
      latest_reply_date: latest?.received_at || null,
      proposal_count: proposalCount,
      next_action: latest?.reply_category ? NEXT_ACTION_MAP[latest.reply_category] : null,
    });
  }
  console.log(`\nPrepared ${updates.length} contact updates.`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 5 updates:');
    console.log(JSON.stringify(updates.slice(0, 5), null, 2));
    return;
  }

  // 5. Apply updates one at a time (.update() doesn't support batch upserts with different values per row)
  console.log('\nApplying updates...');
  let done = 0;
  let errors = 0;
  for (const u of updates) {
    const { contact_id, ...fields } = u;
    const { error } = await supabase.from('contacts').update(fields).eq('contact_id', contact_id);
    if (error) { errors++; console.error(`  ERROR ${contact_id}:`, error.message); }
    done++;
    if (done % 50 === 0) process.stdout.write(`  contacts: ${done}/${updates.length}\r`);
  }
  console.log(`\n  contacts: ${done} updated (${errors} errors).`);

  // 6. Log the sync run
  await supabase.from('sync_log').insert({
    sync_type: 'recompute-contact-denorms',
    contacts_updated: done,
    replies_found: replies.length,
    stages_changed: 0,
    errors: errors > 0 ? [`${errors} row-level update errors`] : null,
    created_at: new Date().toISOString(),
  });

  console.log(`\nDone. ${done} contacts updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
