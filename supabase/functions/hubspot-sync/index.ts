import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── HubSpot API helper ──────────────────────────────────────────
async function hubspotGet(path: string, token: string) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${path}`);
  return res.json();
}

async function searchContactByEmail(email: string, token: string) {
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

async function getContactEmails(contactId: string, token: string) {
  try {
    const data = await hubspotGet(`/crm/v3/objects/contacts/${contactId}/associations/emails`, token);
    const emailIds: string[] = (data.results || []).map((r: any) => r.id);

    const emails: any[] = [];
    for (const id of emailIds.slice(0, 20)) {
      try {
        const email = await hubspotGet(
          `/crm/v3/objects/emails/${id}?properties=hs_email_subject,hs_email_text,hs_email_direction,hs_timestamp`,
          token
        );
        emails.push(email);
      } catch (_) { /* skip individual failures */ }
    }
    return emails;
  } catch (_) {
    return [];
  }
}

// ── Main sync logic ─────────────────────────────────────────────
async function runFullSync(supabase: any, token: string) {
  console.log('hubspot-sync: starting...');

  // 1. Load all contacts from Supabase (paginated)
  let allContacts: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select('contact_id, email')
      .range(from, from + 999);
    if (error || !data) break;
    allContacts = allContacts.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`hubspot-sync: loaded ${allContacts.length} contacts`);

  let updated = 0;
  let repliesFound = 0;
  const errors: string[] = [];

  // 2. Process in batches of 10 with rate limiting
  for (let i = 0; i < allContacts.length; i += 10) {
    const batch = allContacts.slice(i, i + 10);

    const results = await Promise.allSettled(
      batch.map(async (contact: any) => {
        if (!contact.email) return;

        const hsContact = await searchContactByEmail(contact.email, token);
        if (!hsContact) return;

        const props = hsContact.properties || {};
        const updates = {
          hs_enrolled: (props.hs_sequences_enrolled_count || 0) > 0,
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

        // 3. Fetch email engagements (inbound + outbound) for replied contacts
        if (updates.hs_replied) {
          const emails = await getContactEmails(hsContact.id, token);
          for (const em of emails) {
            const p = em.properties || {};
            const dir = p.hs_email_direction;

            // Inbound: contact replied to us
            if (dir === 'INCOMING_EMAIL') {
              const { error: e } = await supabase
                .from('email_replies')
                .upsert({
                  contact_email: contact.email,
                  subject: p.hs_email_subject,
                  body_preview: (p.hs_email_text || '').slice(0, 500),
                  direction: 'INCOMING',
                  hs_engagement_id: em.id,
                  received_at: p.hs_timestamp,
                }, { onConflict: 'hs_engagement_id' });
              if (!e) repliesFound++;
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
      })
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        errors.push((r as PromiseRejectedResult).reason?.message || 'unknown');
      }
    }

    // Rate limit: 100ms between batches
    await new Promise(r => setTimeout(r, 100));
  }

  // 4. Auto-stage rules: promote buildings based on contact engagement
  await runAutoStageRules(supabase);

  // 5. Write completion to sync_log so the frontend knows we're done
  await supabase.from('sync_log').insert({
    sync_type: 'hubspot_engagement',
    contacts_updated: updated,
    replies_found: repliesFound,
    stages_changed: 0,
    errors: errors.slice(0, 20),
  });

  console.log(`hubspot-sync: done. ${updated} updated, ${repliesFound} replies, ${errors.length} errors`);
}

async function runAutoStageRules(supabase: any) {
  let allBc: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('building_contacts')
      .select('building_name, contact_email')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allBc = allBc.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // Buildings with replied contacts → OUTREACH
  const { data: repliedContacts } = await supabase
    .from('contacts').select('email').eq('hs_replied', true);

  if (repliedContacts) {
    const repliedEmails = new Set(repliedContacts.map((c: any) => c.email));
    const buildingsWithReplies = new Set<string>();
    for (const bc of allBc) {
      if (repliedEmails.has(bc.contact_email)) buildingsWithReplies.add(bc.building_name);
    }

    const { data: bldgs } = await supabase
      .from('buildings').select('building_id, building_name, stage')
      .in('stage', ['NEW', 'ENROLLED']);

    for (const b of (bldgs || [])) {
      if (buildingsWithReplies.has(b.building_name)) {
        await supabase.from('buildings').update({ stage: 'OUTREACH' }).eq('building_id', b.building_id);
        await supabase.from('stage_history').insert({
          building_id: b.building_id, old_stage: b.stage, new_stage: 'OUTREACH',
          changed_by: 'auto-sync', notes: 'Contact replied — auto-promoted to OUTREACH',
        });
      }
    }
  }

  // NEW buildings with enrolled contacts → ENROLLED
  const { data: enrolledContacts } = await supabase
    .from('contacts').select('email').eq('hs_enrolled', true).eq('hs_replied', false);

  if (enrolledContacts) {
    const enrolledEmails = new Set(enrolledContacts.map((c: any) => c.email));
    const buildingsWithEnrolled = new Set<string>();
    for (const bc of allBc) {
      if (enrolledEmails.has(bc.contact_email)) buildingsWithEnrolled.add(bc.building_name);
    }

    const { data: newBldgs } = await supabase
      .from('buildings').select('building_id, building_name').eq('stage', 'NEW');

    for (const b of (newBldgs || [])) {
      if (buildingsWithEnrolled.has(b.building_name)) {
        await supabase.from('buildings').update({ stage: 'ENROLLED' }).eq('building_id', b.building_id);
        await supabase.from('stage_history').insert({
          building_id: b.building_id, old_stage: 'NEW', new_stage: 'ENROLLED',
          changed_by: 'auto-sync', notes: 'Contact enrolled in sequence — auto-promoted to ENROLLED',
        });
      }
    }
  }
}

// ── Entry point ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const hubspotToken = Deno.env.get('HUBSPOT_TOKEN');

    if (!hubspotToken) {
      return Response.json(
        { success: false, error: 'HUBSPOT_TOKEN secret not set', code: 'MISSING_SECRET' },
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Return immediately — run the full sync in the background
    // The frontend polls sync_log to detect completion
    EdgeRuntime.waitUntil(runFullSync(supabase, hubspotToken));

    return Response.json(
      { success: true, message: 'Sync started — polling sync_log for completion' },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('hubspot-sync error:', err);
    return Response.json(
      { success: false, error: String(err), code: 'INTERNAL_ERROR' },
      { status: 500, headers: corsHeaders }
    );
  }
});
