// sync_enrollment_dates.js
// Pulls hs_latest_sequence_enrolled_date from HubSpot for all contacts
// with hs_sequences_enrolled_count > 0 and updates Supabase contacts table.
//
// Run: node scripts/sync_enrollment_dates.js

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY  = process.env.VITE_SUPABASE_ANON_KEY;

async function hsSearch(offset = 0) {
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [{
        filters: [{ propertyName: 'hs_sequences_enrolled_count', operator: 'GT', value: '0' }]
      }],
      properties: [
        'email',
        'hs_sequences_is_enrolled',
        'hs_latest_sequence_enrolled_date',
        'hs_sequences_enrolled_count',
        'hs_email_last_reply_date',
        'hs_email_replied',
      ],
      limit: 200,
      after: offset || undefined,
    }),
  });
  if (!res.ok) throw new Error(`HubSpot error ${res.status}`);
  return res.json();
}



const fs = require('fs');

async function supabaseUpdate(rows, batchIndex) {
  // Write SQL to file — will be executed via Supabase MCP
  const values = rows.map(r => {
    const email = r.email.replace(/'/g, "''");
    const enrolledAt = r.hs_enrolled_at ? `'${r.hs_enrolled_at}'` : 'NULL';
    const current = r.hs_currently_enrolled ? 'true' : 'false';
    const count = r.hs_sequences_enrolled_count || 0;
    return `('${email}', ${enrolledAt}, ${current}, ${count})`;
  }).join(',\n    ');

  const sql = `UPDATE contacts SET
  hs_enrolled_at = v.enrolled_at::TIMESTAMPTZ,
  hs_currently_enrolled = v.currently_enrolled::BOOLEAN,
  hs_sequences_enrolled_count = v.enrolled_count::INTEGER
FROM (VALUES
    ${values}
) AS v(email, enrolled_at, currently_enrolled, enrolled_count)
WHERE contacts.email = v.email;\n`;

  fs.appendFileSync('/tmp/full_enrollment_sync.sql', sql + '\n');
}

async function main() {
  console.log('Starting HubSpot → Supabase enrollment date sync...\n');

  let after = undefined;
  let total = 0;
  let page = 0;
  const allRows = [];

  while (true) {
    page++;
    console.log(`Fetching page ${page} (offset: ${after || 0})...`);
    const data = await hsSearch(after);
    const results = data.results || [];

    if (results.length === 0) break;

    for (const contact of results) {
      const props = contact.properties || {};
      const email = props.email;
      if (!email) continue;

      const enrolledAt = props.hs_latest_sequence_enrolled_date || null;
      const currentlyEnrolled = props.hs_sequences_is_enrolled === 'true';
      const enrolledCount = parseInt(props.hs_sequences_enrolled_count || '0', 10);
      const lastRepliedDate = props.hs_email_last_reply_date || null;
      const hsReplied = props.hs_email_replied === 'true';

      allRows.push({
        email,
        hs_enrolled_at: enrolledAt,
        hs_currently_enrolled: currentlyEnrolled,
        hs_sequences_enrolled_count: enrolledCount,
        // Also update replied fields if HubSpot has them
        ...(lastRepliedDate ? { hs_last_replied: lastRepliedDate } : {}),
        ...(hsReplied !== undefined ? { hs_replied: hsReplied } : {}),
      });
    }

    total += results.length;
    console.log(`  → ${results.length} contacts fetched (total so far: ${total})`);

    // Check for next page
    after = data.paging?.next?.after;
    if (!after) break;
  }

  console.log(`\nTotal contacts to update: ${allRows.length}`);
  console.log('Pushing to Supabase in batches of 500...\n');

  // Push in batches of 500
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    await supabaseUpdate(batch);
    updated += batch.length;
    console.log(`  Updated ${updated}/${allRows.length}`);
  }

  console.log('\n✓ Sync complete.');
  console.log(`  Total contacts synced: ${allRows.length}`);
  console.log(`  Currently enrolled: ${allRows.filter(r => r.hs_currently_enrolled).length}`);
  console.log(`  Ever enrolled: ${allRows.length}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
