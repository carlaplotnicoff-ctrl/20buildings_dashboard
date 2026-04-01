const HUBSPOT_API = 'https://api.hubapi.com';

// Stage rank — higher = more advanced in pipeline
const STAGE_RANK = {
  'APOLLO-READY': 1,
  'CONTACTS-SCORED': 2,
  'SEQUENCES-WRITTEN': 3,
  'ENROLLED': 4,
  'REPLIED': 5,
  'DM-FOUND': 6,
  'GATEKEEPER': 7,
  'MUST-RESPOND': 8,
  'WAITING-ON-REFERRAL': 9,
  'PHASE-2-SENT': 10,
  'MEETING': 11,
  'SIGNED': 12,
};

// Terminal stages — never auto-override these
const TERMINAL_STAGES = new Set([
  'DNC', 'DECLINED', 'STALE-OWNERSHIP', 'DISPOSITION',
  'UNENROLLED', 'ALREADY-CONTACTED', 'FLAGGED',
]);

exports.handler = async () => {
  const token = process.env.HUBSPOT_API_KEY;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'HUBSPOT_API_KEY not set' }) };
  }

  try {
    const contacts = await getAllContacts(token);
    const buildings = groupByBuilding(contacts);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300', // cache 5 min
      },
      body: JSON.stringify({ buildings, fetchedAt: new Date().toISOString() }),
    };
  } catch (err) {
    console.error('HubSpot fetch error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

async function getAllContacts(token) {
  const properties = [
    'building_name',
    'matching_buildings', // Chicago contacts use this property instead
    'market',
    'tier',
    'hs_sequences_is_enrolled',
    'hs_sequences_actively_enrolled_count',
    'hs_latest_sequence_enrolled',
    'hs_sales_email_last_replied', // set when contact replies to any tracked sales email
  ];

  const contacts = [];
  let after = undefined;

  do {
    const body = {
      // OR across filterGroups: Dallas/Houston use building_name, Chicago uses matching_buildings
      filterGroups: [
        { filters: [{ propertyName: 'building_name', operator: 'HAS_PROPERTY' }] },
        { filters: [{ propertyName: 'matching_buildings', operator: 'HAS_PROPERTY' }] },
      ],
      properties,
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot API ${res.status}: ${text}`);
    }

    const data = await res.json();
    contacts.push(...(data.results || []));
    after = data.paging?.next?.after;
  } while (after);

  return contacts;
}

function groupByBuilding(contacts) {
  const buildings = {};

  for (const contact of contacts) {
    const p = contact.properties;
    // Dallas/Houston use building_name; Chicago uses matching_buildings
    const name = (p.building_name || p.matching_buildings || '').trim();
    if (!name) continue;

    if (!buildings[name]) {
      buildings[name] = { total: 0, p1: 0, p2: 0, p3: 0, p4: 0, enrolled: 0, replyCount: 0, hubspotStage: null };
    }

    const b = buildings[name];
    b.total++;

    const tier = (p.tier || '').toUpperCase().replace(/\s/g, '');
    if (tier === 'P1') b.p1++;
    else if (tier === 'P2') b.p2++;
    else if (tier === 'P3') b.p3++;
    else if (tier === 'P4') b.p4++;

    const isEnrolled = p.hs_sequences_is_enrolled === 'true'
      || parseInt(p.hs_sequences_actively_enrolled_count || '0', 10) > 0;
    if (isEnrolled) b.enrolled++;

    // Count contacts who have replied to a tracked sales email
    if (p.hs_sales_email_last_replied) b.replyCount++;
  }

  // Derive suggested stage from enrollment data
  for (const name of Object.keys(buildings)) {
    const b = buildings[name];
    if (b.enrolled > 0) b.hubspotStage = 'ENROLLED';
    else if (b.total > 0) b.hubspotStage = 'SEQUENCES-WRITTEN';
  }

  return buildings;
}
