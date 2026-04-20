import { signal, computed } from '@preact/signals';
import { fetchAll, supabase } from './supabase';

// ===== RAW DATA SIGNALS =====
export const buildings = signal([]);
export const contacts = signal([]);
export const buildingContacts = signal([]);
export const touchLog = signal([]);
export const stageHistory = signal([]);
export const syncLog = signal([]);
export const emailReplies = signal([]);
export const importLog = signal([]);

// ===== UI STATE =====
export const activeTab = signal('dashboard');
export const marketFilter = signal('All');
export const searchQuery = signal('');
export const isLoading = signal(true);
export const isConnected = signal(false);
export const lastSync = signal(null);
export const loadError = signal(null); // surfaces primary load failure to UI
export const selectedBuilding = signal(null); // building object when viewing profile page
export const selectedCompany = signal(null);  // company object when viewing company buildings list

// ===== PIPELINE STAGES =====
export const STAGES = [
  'NO_CONTACTS',
  'CONTACTS_IMPORTED',
  'IN_SEQUENCE',
  'LINKEDIN_CONTACT',
  'NO_DM_RESPONSE',
  'SECOND_PUSH',
  'GATEKEEPER',
  'PROPOSAL_GATEKEEPER',
  'WRONG_COMPANY',
  'DM_IDENTIFIED',
  'PROPOSAL_SENT',
  'NO_PROPOSAL_RESPONSE',
  'MEETING_SCHEDULED',
  'SIGNED',
  'DECLINED',
  'ON_HOLD',
];

export const STAGE_COLORS = {
  'NO_CONTACTS':          'stg-no-contacts',
  'CONTACTS_IMPORTED':    'stg-contacts-imported',
  'IN_SEQUENCE':          'stg-in-sequence',
  'LINKEDIN_CONTACT':     'stg-linkedin',
  'NO_DM_RESPONSE':       'stg-no-dm-response',
  'SECOND_PUSH':          'stg-second-push',
  'GATEKEEPER':           'stg-gatekeeper',
  'PROPOSAL_GATEKEEPER':  'stg-proposal-gatekeeper',
  'WRONG_COMPANY':        'stg-wrong-company',
  'DM_IDENTIFIED':        'stg-dm-identified',
  'PROPOSAL_SENT':        'stg-proposal-sent',
  'NO_PROPOSAL_RESPONSE': 'stg-no-proposal-response',
  'MEETING_SCHEDULED':    'stg-meeting-scheduled',
  'SIGNED':               'stg-signed',
  'DECLINED':             'stg-declined',
  'ON_HOLD':              'stg-on-hold',
};

export const AUTO_STAGES = new Set(['NO_CONTACTS', 'CONTACTS_IMPORTED', 'IN_SEQUENCE', 'LINKEDIN_CONTACT']);

export const PAIN_COLOR = {
  'High':   '#ef4444',
  'Medium': '#f59e0b',
  'Low':    '#10b981',
  'None':   '#9ca3af',
};

export function getPainTier(pain) {
  if (!pain) return 'None';
  const p = pain.toString().trim();
  if (p === 'High' || p === 'Medium' || p === 'Low') return p;
  return 'None';
}

export const STAGE_LABELS = {
  'NO_CONTACTS':          'No Contacts',
  'CONTACTS_IMPORTED':    'Contacts Imported',
  'IN_SEQUENCE':          'In Sequence',
  'LINKEDIN_CONTACT':     'LinkedIn Contact',
  'NO_DM_RESPONSE':       'No DM Response',
  'SECOND_PUSH':          'Second Push',
  'GATEKEEPER':           'Gatekeeper',
  'PROPOSAL_GATEKEEPER':  'Proposal Gatekeeper',
  'WRONG_COMPANY':        'Wrong Company',
  'DM_IDENTIFIED':        'DM Identified',
  'PROPOSAL_SENT':        'Proposal Sent',
  'NO_PROPOSAL_RESPONSE': 'No Proposal Response',
  'MEETING_SCHEDULED':    'Meeting Scheduled',
  'SIGNED':               'Signed',
  'DECLINED':             'Declined',
  'ON_HOLD':              'On Hold',
};

export const MARKETS = signal(['All', 'Chicago', 'Houston', 'Dallas', 'Charlotte', 'Phoenix']);

// ===== REPLY CATEGORIES (7-bucket taxonomy) =====
// Mirrors the CHECK constraint in 20260416_reply_taxonomy_and_proposals.sql.
export const REPLY_CATEGORIES = [
  'HOT_ACTIVE_PITCH',
  'WARM_SELF_IDD_DM',
  'WARM_NEEDS_PITCH',
  'WARM_REDIRECT',
  'RESEARCH_WRONG_DATA',
  'DECLINE_STRUCTURAL',
  'DECLINE_DNC',
];

export const REPLY_CATEGORY_LABELS = {
  'HOT_ACTIVE_PITCH':    '🔥 HOT — Active Pitch',
  'WARM_SELF_IDD_DM':    '🟢 WARM — Self-ID\'d DM',
  'WARM_NEEDS_PITCH':    '🟡 WARM — Needs Pitch',
  'WARM_REDIRECT':       '🟡 WARM — Redirect',
  'RESEARCH_WRONG_DATA': '🔵 RESEARCH — Wrong Data',
  'DECLINE_STRUCTURAL':  '🔴 DECLINE — Structural',
  'DECLINE_DNC':         '⚫ DECLINE — DNC',
};

export const REPLY_CATEGORY_COLORS = {
  'HOT_ACTIVE_PITCH':    'cat-hot',
  'WARM_SELF_IDD_DM':    'cat-warm-self',
  'WARM_NEEDS_PITCH':    'cat-warm-pitch',
  'WARM_REDIRECT':       'cat-warm-redirect',
  'RESEARCH_WRONG_DATA': 'cat-research',
  'DECLINE_STRUCTURAL':  'cat-decline-struct',
  'DECLINE_DNC':         'cat-decline-dnc',
};

export const replyCategoryFilter = signal('All');

// ===== COMPUTED =====
export const filteredBuildings = computed(() => {
  const m = marketFilter.value;
  const q = searchQuery.value.toLowerCase();
  return buildings.value.filter(b => {
    if (m !== 'All' && b.market !== m) return false;
    if (q && !b.building_name?.toLowerCase().includes(q) && !b.owner_1?.toLowerCase().includes(q) && !b.address?.toLowerCase().includes(q)) return false;
    return true;
  });
});

export const filteredContacts = computed(() => {
  const m = marketFilter.value;
  const q = searchQuery.value.toLowerCase();
  return contacts.value.filter(c => {
    if (m !== 'All' && c.market !== m) return false;
    if (q && !c.first_name?.toLowerCase().includes(q) && !c.last_name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.company?.toLowerCase().includes(q)) return false;
    return true;
  });
});

// Building → contact lookup
export const buildingContactMap = computed(() => {
  const map = new Map();
  for (const bc of buildingContacts.value) {
    if (!map.has(bc.building_name)) map.set(bc.building_name, []);
    map.get(bc.building_name).push(bc.contact_email);
  }
  return map;
});

// Contact email → buildings lookup
export const contactBuildingMap = computed(() => {
  const map = new Map();
  for (const bc of buildingContacts.value) {
    if (!map.has(bc.contact_email)) map.set(bc.contact_email, []);
    map.get(bc.contact_email).push(bc.building_name);
  }
  return map;
});

// Derives market for a contact: uses contact.market if set,
// falls back to the market of the first linked building (fixes Chicago contacts imported without market tag).
export const contactMarketMap = computed(() => {
  const map = new Map();
  const bldgByName = new Map(buildings.value.map(b => [b.building_name, b]));
  for (const c of contacts.value) {
    if (c.market) {
      map.set(c.email, c.market);
    } else {
      const linkedNames = contactBuildingMap.value.get(c.email) || [];
      for (const name of linkedNames) {
        const bldg = bldgByName.get(name);
        if (bldg?.market) { map.set(c.email, bldg.market); break; }
      }
    }
  }
  return map;
});

// Stage counts for funnel
export const stageCounts = computed(() => {
  const fb = marketFilter.value === 'All' ? buildings.value : buildings.value.filter(b => b.market === marketFilter.value);
  const counts = {};
  for (const s of STAGES) counts[s] = 0;
  for (const b of fb) {
    const stage = b.stage || 'NO_CONTACTS';
    if (counts[stage] !== undefined) counts[stage]++;
    else counts['NO_CONTACTS']++;
  }
  return counts;
});

// Signed count
export const signedCount = computed(() => {
  return buildings.value.filter(b => b.stage === 'SIGNED').length;
});

// Market stats
export const marketStats = computed(() => {
  const stats = {};
  const cmMap = contactMarketMap.value;
  const ACTIVE_DEAL_STAGES = new Set(['DM_IDENTIFIED', 'PROPOSAL_SENT', 'NO_PROPOSAL_RESPONSE', 'MEETING_SCHEDULED']);
  for (const m of ['Chicago', 'Houston', 'Dallas', 'Charlotte', 'Phoenix']) {
    const mb = buildings.value.filter(b => b.market === m);
    stats[m] = {
      buildings: mb.length,
      contacts: contacts.value.filter(c => (c.market || cmMap.get(c.email)) === m).length,
      warm: mb.filter(b => ACTIVE_DEAL_STAGES.has(b.stage)).length,
      signed: mb.filter(b => b.stage === 'SIGNED').length,
      replied: contacts.value.filter(c => c.hs_replied && (c.market || cmMap.get(c.email)) === m).length,
    };
  }
  return stats;
});

// ===== AUTO-PROMOTION =====
// After data loads, auto-advance building stages based on contact engagement.
// Only promotes — never demotes a manually-set stage.
const AUTO_PROMOTE_FROM = new Set(['NO_CONTACTS', 'CONTACTS_IMPORTED', 'IN_SEQUENCE', 'LINKEDIN_CONTACT']);

async function runAutoPromotion(buildingsData, contactsData, buildingContactsData) {
  const repliedEmails = new Set(contactsData.filter(c => c.hs_replied && c.email).map(c => c.email.toLowerCase()));
  const engagedEmails = new Set(contactsData.filter(c => (c.hs_opened || c.hs_enrolled) && c.email).map(c => c.email.toLowerCase()));

  // Build building → contact emails map
  const bcMap = new Map();
  for (const bc of buildingContactsData) {
    if (!bcMap.has(bc.building_name)) bcMap.set(bc.building_name, []);
    if (bc.contact_email) bcMap.get(bc.building_name).push(bc.contact_email.toLowerCase());
  }

  const toWarm = [];
  const toOutreach = [];

  for (const b of buildingsData) {
    const currentStage = b.stage || 'NEW';
    if (!AUTO_PROMOTE_FROM.has(currentStage)) continue;
    const emails = bcMap.get(b.building_name) || [];
    if (emails.some(e => repliedEmails.has(e))) {
      toWarm.push(b.building_id);
    } else if (currentStage === 'NO_CONTACTS' && emails.some(e => engagedEmails.has(e))) {
      toOutreach.push(b.building_id);
    }
  }

  const promoted = [];
  if (toWarm.length > 0) {
    const { error } = await supabase.from('buildings').update({ stage: 'DM_IDENTIFIED' }).in('building_id', toWarm);
    if (!error) {
      buildings.value = buildings.value.map(b => toWarm.includes(b.building_id) ? { ...b, stage: 'DM_IDENTIFIED' } : b);
      promoted.push(`${toWarm.length} → WARM`);
    }
  }
  if (toOutreach.length > 0) {
    const { error } = await supabase.from('buildings').update({ stage: 'IN_SEQUENCE' }).in('building_id', toOutreach);
    if (!error) {
      buildings.value = buildings.value.map(b => toOutreach.includes(b.building_id) ? { ...b, stage: 'IN_SEQUENCE' } : b);
      promoted.push(`${toOutreach.length} → OUTREACH`);
    }
  }
  if (promoted.length > 0) console.info('Auto-promotion:', promoted.join(', '));
}

// ===== DATA LOADING =====
export async function loadAllData() {
  isLoading.value = true;
  loadError.value = null;
  try {
    const [b, c, bc] = await Promise.all([
      fetchAll('buildings'),
      fetchAll('contacts'),
      fetchAll('building_contacts'),
    ]);
    buildings.value = b;
    contacts.value = c;
    buildingContacts.value = bc;
    isConnected.value = true;

    // Run auto-promotion after primary data is available
    try {
      await runAutoPromotion(b, c, bc);
    } catch (e) {
      console.warn('Auto-promotion skipped:', e.message);
    }

    // Load secondary tables individually so one failure doesn't block others
    const loadSecondary = async (table, target, opts = {}) => {
      try {
        target.value = await fetchAll(table, opts);
      } catch {
        // Table may not exist yet — leave as empty array
      }
    };
    await Promise.all([
      loadSecondary('touch_log', touchLog, { order: { column: 'created_at', ascending: false } }),
      loadSecondary('stage_history', stageHistory, { order: { column: 'created_at', ascending: false } }),
      loadSecondary('sync_log', syncLog, { order: { column: 'created_at', ascending: false } }),
      loadSecondary('email_replies', emailReplies, { order: { column: 'received_at', ascending: false } }),
      loadSecondary('import_log', importLog, { order: { column: 'created_at', ascending: false } }),
    ]);
  } catch (e) {
    console.error('Failed to load data:', e);
    isConnected.value = false;
    loadError.value = e.message || 'Failed to connect to database';
  } finally {
    isLoading.value = false;
  }
}
