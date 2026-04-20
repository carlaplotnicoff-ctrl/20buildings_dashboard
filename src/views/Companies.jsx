import { useState } from 'preact/hooks';
import {
  buildings, contacts, buildingContactMap, marketFilter,
  PAIN_COLOR, getPainTier, selectedBuilding, activeTab, selectedCompany,
} from '../store/data';
import { buildCompanyIndex, deriveCompanyStage } from '../lib/derive';
import { MarketChips } from '../components/MarketChips';
import { StageBadge } from '../components/StageBadge';

// ── same constants as Board.jsx ───────────────────────────────────────────────
const BOARD_STAGES = [
  'NO_CONTACTS', 'CONTACTS_IMPORTED', 'IN_SEQUENCE', 'LINKEDIN_CONTACT',
  'NO_DM_RESPONSE', 'SECOND_PUSH', 'GATEKEEPER', 'PROPOSAL_GATEKEEPER',
  'WRONG_COMPANY', 'DM_IDENTIFIED', 'PROPOSAL_SENT', 'NO_PROPOSAL_RESPONSE',
  'MEETING_SCHEDULED', 'SIGNED',
];
const ISSUE_STAGES = ['DECLINED', 'ON_HOLD'];
const STAGE_ACCENT = {
  'NO_CONTACTS':          '#ef4444',
  'CONTACTS_IMPORTED':    '#93c5fd',
  'IN_SEQUENCE':          '#579bfc',
  'LINKEDIN_CONTACT':     '#0a66c2',
  'NO_DM_RESPONSE':       '#f59e0b',
  'SECOND_PUSH':          '#f97316',
  'GATEKEEPER':           '#ffcb00',
  'PROPOSAL_GATEKEEPER':  '#c084fc',
  'WRONG_COMPANY':        '#dc2626',
  'DM_IDENTIFIED':        '#66ccff',
  'PROPOSAL_SENT':        '#a855f7',
  'NO_PROPOSAL_RESPONSE': '#f59e0b',
  'MEETING_SCHEDULED':    '#22c55e',
  'SIGNED':               '#00854d',
  'DECLINED':             '#9ca3af',
  'ON_HOLD':              '#6b7280',
};
const PHASE_SPANS = [
  { label: 'Pre-Outreach', stages: ['NO_CONTACTS', 'CONTACTS_IMPORTED'],                                          color: '#ef4444' },
  { label: 'Outreach',     stages: ['IN_SEQUENCE', 'LINKEDIN_CONTACT', 'NO_DM_RESPONSE', 'SECOND_PUSH'],          color: '#579bfc' },
  { label: 'Triage',       stages: ['GATEKEEPER', 'PROPOSAL_GATEKEEPER', 'WRONG_COMPANY', 'DM_IDENTIFIED'],       color: '#ffcb00' },
  { label: 'Deal',         stages: ['PROPOSAL_SENT', 'NO_PROPOSAL_RESPONSE', 'MEETING_SCHEDULED', 'SIGNED'],      color: '#a855f7' },
];
const TIER_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3 };
// ─────────────────────────────────────────────────────────────────────────────

function PainDot({ level }) {
  const color = PAIN_COLOR[level];
  if (!color) return null;
  return (
    <span
      title={`${level} pain`}
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }}
    />
  );
}

function FilterChip({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600,
      cursor: 'pointer', border: active ? 'none' : '1px solid #e5e7eb',
      background: active ? (color || '#111') : '#fff',
      color: active ? '#fff' : '#777', whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  );
}

// Pick the highest pain level across all buildings in a company
function companyPainLevel(company) {
  const ORDER = { High: 0, Medium: 1, Low: 2 };
  let best = null;
  for (const b of company.buildings) {
    const p = getPainTier(b.pain_point);
    if (p === 'None') continue;
    if (best === null || (ORDER[p] ?? 99) < (ORDER[best] ?? 99)) best = p;
  }
  return best;
}

function CompanyCard({ company, onSelect }) {
  const bcMap = buildingContactMap.value;
  const allContacts = contacts.value;
  const contactsByEmail = new Map(allContacts.map(c => [c.email, c]));

  const allEmails = new Set(
    company.buildings.flatMap(b => bcMap.get(b.building_name) || [])
  );
  const linkedContacts = [...allEmails].map(e => contactsByEmail.get(e)).filter(Boolean);
  const totalContacts = linkedContacts.length;
  const hasReplied = linkedContacts.some(c => c.hs_replied);

  const bestContact = [...linkedContacts]
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 4) - (TIER_ORDER[b.tier] ?? 4))[0];

  const stage = deriveCompanyStage(company.buildings);
  const accent = STAGE_ACCENT[stage] || '#9ca3af';
  const markets = Array.from(company.markets);
  const pain = companyPainLevel(company);

  return (
    <div
      class="board-card"
      style={{ position: 'relative', cursor: 'pointer' }}
      onClick={() => onSelect(company)}
    >
      {/* Company name + pain dot */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#111', lineHeight: 1.3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {company.displayName}
        </div>
        {pain && <PainDot level={pain} />}
      </div>

      {/* Markets + building count */}
      <div style={{ fontSize: '0.63rem', color: '#9ca3af', marginBottom: '4px' }}>
        {markets.join(' · ')}{company.buildings.length > 1 ? ` · ${company.buildings.length} buildings` : ' · 1 building'}
      </div>

      {/* Best contact */}
      {bestContact && (
        <div style={{ fontSize: '0.68rem', color: '#374151', fontWeight: 500, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bestContact.first_name} {bestContact.last_name}
          {bestContact.job_title && <span style={{ color: '#c0c0c0', fontWeight: 400 }}> · {bestContact.job_title}</span>}
        </div>
      )}

      {/* Bottom row: tier badge + reply indicator + contact count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        {bestContact?.tier && (
          <span class={`badge bp${bestContact.tier.replace('P', '')}`}>{bestContact.tier}</span>
        )}
        {hasReplied && (
          <span class="hs-icon hs-replied" title="Has replied contact">R</span>
        )}
        {totalContacts > 0 && (
          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: accent + '18', color: accent, marginLeft: 'auto' }}>
            {totalContacts}
          </span>
        )}
      </div>
    </div>
  );
}

function CompanyColumn({ stage, companies, onSelect }) {
  const accent = STAGE_ACCENT[stage] || '#9ca3af';
  return (
    <div class="board-col">
      <div class="board-col-header" style={{ borderTop: `3px solid ${accent}` }}>
        <StageBadge stage={stage} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 8px', borderRadius: '20px', background: accent + '18', color: accent }}>
          {companies.length}
        </span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        {companies.length === 0 ? (
          <div style={{ fontSize: '0.68rem', color: '#e5e7eb', textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>—</div>
        ) : (
          companies.map(co => (
            <CompanyCard key={co.name} company={co} onSelect={onSelect} />
          ))
        )}
      </div>
    </div>
  );
}

function openCompanyBuildings(company) {
  selectedCompany.value = company;
}

export function Companies() {
  const [repliedFilter, setRepliedFilter] = useState(false);
  const [issuesOpen, setIssuesOpen]       = useState(false);

  const m = marketFilter.value;
  const allBuildings = buildings.value;

  const allIndex = buildCompanyIndex(allBuildings);
  const marketFiltered = m === 'All'
    ? allIndex
    : allIndex.filter(co => co.buildings.some(b => b.market === m));

  const base = repliedFilter
    ? marketFiltered.filter(co => {
        const bcMap = buildingContactMap.value;
        const allContacts = contacts.value;
        const contactsByEmail = new Map(allContacts.map(c => [c.email, c]));
        const allEmails = co.buildings.flatMap(b => bcMap.get(b.building_name) || []);
        return allEmails.some(e => contactsByEmail.get(e)?.hs_replied);
      })
    : marketFiltered;

  // Bucket companies by their derived stage
  const byStage = {};
  for (const s of BOARD_STAGES) byStage[s] = [];
  const issues = [];

  for (const co of base) {
    const stage = deriveCompanyStage(co.buildings);
    if (byStage[stage] !== undefined) {
      byStage[stage].push(co);
    } else if (ISSUE_STAGES.includes(stage)) {
      issues.push(co);
    } else {
      byStage['NO_CONTACTS'].push(co);
    }
  }

  const totalShown = base.length;

  return (
    <div class="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ flexShrink: 0, paddingBottom: '8px' }}>
        <MarketChips />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
          <FilterChip
            label="Has Replies"
            active={repliedFilter}
            color="#16a34a"
            onClick={() => setRepliedFilter(f => !f)}
          />
          <span style={{ fontSize: '0.68rem', color: repliedFilter ? '#4f7cff' : '#d1d5db', marginLeft: '4px' }}>
            {totalShown} compan{totalShown !== 1 ? 'ies' : 'y'}
            {repliedFilter ? ' · filter active' : ''}
          </span>
        </div>
      </div>

      {/* Phase labels + columns in one scroll container */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Phase labels row */}
        <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #f0f0f0', paddingBottom: '4px', minWidth: `${BOARD_STAGES.length * 200}px` }}>
          {PHASE_SPANS.map(ph => (
            <div key={ph.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: `${ph.stages.length * 200}px`, flexShrink: 0,
              fontSize: '0.6rem', fontWeight: 800, color: ph.color,
              textTransform: 'uppercase', letterSpacing: '0.8px',
              borderLeft: `2px solid ${ph.color}25`, padding: '3px 8px',
            }}>
              {ph.label}
            </div>
          ))}
        </div>

        {/* Kanban columns */}
        <div class="board-wrap" style={{ minWidth: `${BOARD_STAGES.length * 200}px`, flex: 1, overflowY: 'hidden' }}>
          {BOARD_STAGES.map(s => (
            <CompanyColumn
              key={s}
              stage={s}
              companies={byStage[s]}
              onSelect={openCompanyBuildings}
            />
          ))}
        </div>
      </div>

      {/* Declined / On Hold strip */}
      {issues.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
          <button
            onClick={() => setIssuesOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', padding: '4px 0' }}
          >
            {issuesOpen ? '▼' : '▶'} {issues.length} declined / on hold
          </button>
          {issuesOpen && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '6px' }}>
              {issues.map(co => (
                <CompanyCard key={co.name} company={co} onSelect={openCompanyBuildings} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
