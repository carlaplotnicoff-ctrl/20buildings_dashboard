/**
 * HubSpot Engagement Sync Script
 *
 * Pulls engagement data from HubSpot for all 20B contacts
 * and updates Supabase contacts table + email_replies table.
 *
 * Run manually: node scripts/hubspot-sync.mjs
 * Later: deploy as Supabase Edge Function with daily cron.
 */

import { createClient } from '@supabase/supabase-js';

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 20B HubSpot list IDs
const LIST_IDS = {
  chicago: [963, 966, 990, 997, 998, 996, 995],
  houston: [999, 1000, 1001, 1002],
  dallas: [1003, 1004, 1005, 1006],
};

async function hubspotGet(path) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Search HubSpot contacts by email, returning engagement properties.
 */
async function searchContactByEmail(email) {
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: [
        'email',
        'hs_sequences_is_enrolled',
        'hs_sequences_enrolled_count',
        'hs_sales_email_last_replied',
        'hs_sales_email_last_opened',
        'hs_email_optout',
        'hs_lead_status',
      ],
      limit: 1,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] || null;
}

/**
 * Fetch email engagements associated with a HubSpot contact.
 */
async function getContactEmails(contactId) {
  try {
    const data = await hubspotGet(`/crm/v3/objects/contacts/${contactId}/associations/emails`);
    const emailIds = (data.results || []).map(r => r.id);

    const emails = [];
    for (const id of emailIds.slice(0, 20)) { // up to 20 most recent per contact
      try {
        const email = await hubspotGet(`/crm/v3/objects/emails/${id}?properties=hs_email_subject,hs_email_text,hs_email_direction,hs_timestamp`);
        emails.push(email);
      } catch (e) {
        // skip individual email errors
      }
    }
    return emails;
  } catch (e) {
    return [];
  }
}

async function syncContacts() {
  console.log('Starting HubSpot sync...\n');

  // Load all contacts from Supabase
  let allContacts = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('contacts').select('contact_id, email').range(from, from + 999);
    if (error) { console.error('Supabase error:', error.message); break; }
    allContacts = allContacts.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Loaded ${allContacts.length} contacts from Supabase`);

  let updated = 0;
  let repliesFound = 0;
  const errors = [];

  // Process in batches of 10 (rate limiting)
  for (let i = 0; i < allContacts.length; i += 10) {
    const batch = allContacts.slice(i, i + 10);

    const results = await Promise.allSettled(batch.map(async (contact) => {
      if (!contact.email) return;

      const hsContact = await searchContactByEmail(contact.email);
      if (!hsContact) return;

      const props = hsContact.properties || {};
      const updates = {
        hs_enrolled: props.hs_sequences_enrolled_count > 0,
        hs_currently_enrolled: props.hs_sequences_is_enrolled === 'true',
        hs_replied: !!props.hs_sales_email_last_replied,
        hs_opened: !!props.hs_sales_email_last_opened,
        hs_last_replied: props.hs_sales_email_last_replied || null,
        hs_lead_status: props.hs_lead_status || null,
        hs_opted_out: props.hs_email_optout === 'true',
      };

      const { error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('contact_id', contact.contact_id);

      if (error) throw new Error(`Update ${contact.email}: ${error.message}`);
      updated++;

      // Fetch email engagements (both inbound replies and outbound responses)
      if (updates.hs_replied) {
        const emails = await getContactEmails(hsContact.id);
        for (const em of emails) {
          const p = em.properties || {};
          const dir = p.hs_email_direction;

          // Inbound: contact replied to us
          if (dir === 'INCOMING_EMAIL') {
            const { error: replyErr } = await supabase
              .from('email_replies')
              .upsert({
                contact_email: contact.email,
                subject: p.hs_email_subject,
                body_preview: (p.hs_email_text || '').slice(0, 500),
                direction: 'INCOMING',
                hs_engagement_id: em.id,
                received_at: p.hs_timestamp,
              }, { onConflict: 'hs_engagement_id' });

            if (!replyErr) repliesFound++;
          }

          // Outbound: Marcus/Carla replied back to the contact
          if (dir === 'EMAIL' || dir === 'REPLY_TO') {
            await supabase
              .from('email_replies')
              .upsert({
                contact_email: contact.email,
                subject: p.hs_email_subject,
                body_preview: (p.hs_email_text || '').slice(0, 500),
                direction: 'OUTGOING',
                hs_engagement_id: em.id,
                received_at: p.hs_timestamp,
              }, { onConflict: 'hs_engagement_id' });
          }
        }
      }
    }));

    // Collect errors
    for (const r of results) {
      if (r.status === 'rejected') errors.push(r.reason?.message || 'Unknown error');
    }

    // Progress update
    if ((i + 10) % 100 === 0 || i + 10 >= allContacts.length) {
      console.log(`  Processed ${Math.min(i + 10, allContacts.length)}/${allContacts.length} (${updated} updated, ${repliesFound} replies)`);
    }

    // Rate limit: 100ms between batches
    await new Promise(r => setTimeout(r, 100));
  }

  // Log sync results
  try {
    await supabase.from('sync_log').insert({
      sync_type: 'hubspot_engagement',
      contacts_updated: updated,
      replies_found: repliesFound,
      stages_changed: 0,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    console.warn('Could not write sync_log:', e.message);
  }

  console.log(`\nSync complete: ${updated} contacts updated, ${repliesFound} replies found`);
  if (errors.length > 0) console.log(`${errors.length} errors (first 5):`, errors.slice(0, 5));
}

// Auto-stage rules
async function runAutoStageRules() {
  console.log('\nRunning auto-stage rules...');

  // Load all building_contacts once — used by both OUTREACH and ENROLLED rules
  let allBc = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('building_contacts').select('building_name, contact_email').range(from, from + 999);
    if (!data || data.length === 0) break;
    allBc = allBc.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // Buildings with replied contacts → OUTREACH (if currently NEW or ENROLLED)
  const { data: repliedContacts } = await supabase
    .from('contacts')
    .select('email')
    .eq('hs_replied', true);

  if (repliedContacts) {
    const repliedEmails = new Set(repliedContacts.map(c => c.email));

    const buildingsWithReplies = new Set();
    for (const bc of allBc) {
      if (repliedEmails.has(bc.contact_email)) {
        buildingsWithReplies.add(bc.building_name);
      }
    }

    // Update buildings that are ENROLLED or NEW → OUTREACH
    const { data: buildings } = await supabase
      .from('buildings')
      .select('building_id, building_name, stage')
      .in('stage', ['NEW', 'ENROLLED']);

    let stagesChanged = 0;
    for (const b of (buildings || [])) {
      if (buildingsWithReplies.has(b.building_name)) {
        await supabase.from('buildings').update({ stage: 'OUTREACH' }).eq('building_id', b.building_id);
        await supabase.from('stage_history').insert({
          building_id: b.building_id, old_stage: b.stage, new_stage: 'OUTREACH',
          changed_by: 'auto-sync', notes: 'Contact replied — auto-promoted to OUTREACH',
        });
        stagesChanged++;
      }
    }
    console.log(`  ${stagesChanged} buildings promoted to OUTREACH`);
  }

  // Buildings with enrolled contacts but no reply yet → ENROLLED
  const { data: enrolledContacts } = await supabase
    .from('contacts')
    .select('email')
    .eq('hs_enrolled', true)
    .eq('hs_replied', false);

  if (enrolledContacts) {
    const enrolledEmails = new Set(enrolledContacts.map(c => c.email));
    const buildingsWithEnrolled = new Set();
    for (const bc of allBc) {
      if (enrolledEmails.has(bc.contact_email)) buildingsWithEnrolled.add(bc.building_name);
    }

    const { data: newBuildings } = await supabase
      .from('buildings')
      .select('building_id, building_name, stage')
      .eq('stage', 'NEW');

    let enrolledChanged = 0;
    for (const b of (newBuildings || [])) {
      if (buildingsWithEnrolled.has(b.building_name)) {
        await supabase.from('buildings').update({ stage: 'ENROLLED' }).eq('building_id', b.building_id);
        await supabase.from('stage_history').insert({
          building_id: b.building_id, old_stage: 'NEW', new_stage: 'ENROLLED',
          changed_by: 'auto-sync', notes: 'Contact enrolled in sequence — auto-promoted to ENROLLED',
        });
        enrolledChanged++;
      }
    }
    console.log(`  ${enrolledChanged} buildings promoted to ENROLLED`);
  }

  console.log('Auto-stage rules complete.');
}

async function main() {
  await syncContacts();
  await runAutoStageRules();
}

main().catch(e => { console.error(e); process.exit(1); });
