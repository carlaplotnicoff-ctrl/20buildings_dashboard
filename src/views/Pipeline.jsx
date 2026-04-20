import { useState, useEffect } from 'preact/hooks';
import {
  buildings, contacts, buildingContactMap, searchQuery, marketFilter,
  STAGES, STAGE_LABELS, PAIN_COLOR, getPainTier,
} from '../store/data';
import { buildCompanyIndex, deriveCompanyStage } from '../lib/derive';
import { normalizeCompany } from '../lib/format';
import { MarketChips } from '../components/MarketChips';
import { StageBadge } from '../components/StageBadge';
import { StageDropdown } from '../components/StageDropdown';
import { BuildingDetailPanel } from '../components/BuildingDetailPanel';

// Stages that are "active deals" — auto-expand these companies
const DEAL_STAGES = new Set(['DM_IDENTIFIED', 'PROPOSAL_SENT', 'PROPOSAL_GATEKEEPER', 'NO_PROPOSAL_RESPONSE', 'MEETING_SCHEDULED']);
// Stages that are blockers — always show prominently
const BLOCKER_STAGES = new Set(['NO_CONTACTS', 'NO_DM_RESPONSE', 'SECOND_PUSH', 'WRONG_COMPANY']);

const TIER_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3 };

// Stage filter groups shown in the dropdown
const STAGE_GROUPS = [
  { label: 'All', value: 'All' },
  { label: '— Blockers —', value: null, disabled: true },
  { label: STAGE_LABELS['NO_CONTACTS'],    value: 'NO_CONTACTS'    },
  { label: STAGE_LABELS['NO_DM_RESPONSE'], value: 'NO_DM_RESPONSE' },
  { label: STAGE_LABELS['SECOND_PUSH'],    value: 'SECOND_PUSH'    },
  { label: STAGE_LABELS['WRONG_COMPANY'],  value: 'WRONG_COMPANY'  },
  { label: '— Active Outreach —', value: null, disabled: true },
  { label: STAGE_LABELS['CONTACTS_IMPORTED'],  value: 'CONTACTS_IMPORTED'  },
  { label: STAGE_LABELS['IN_SEQUENCE'],        value: 'IN_SEQUENCE'        },
  { label: STAGE_LABELS['LINKEDIN_CONTACT'],   value: 'LINKEDIN_CONTACT'   },
  { label: STAGE_LABELS['GATEKEEPER'],         value: 'GATEKEEPER'         },
  { label: STAGE_LABELS['PROPOSAL_GATEKEEPER'],value: 'PROPOSAL_GATEKEEPER'},
  { label: '— Deals —', value: null, disabled: true },
  { label: STAGE_LABELS['DM_IDENTIFIED'],        value: 'DM_IDENTIFIED'        },
  { label: STAGE_LABELS['PROPOSAL_SENT'],        value: 'PROPOSAL_SENT'        },
  { label: STAGE_LABELS['NO_PROPOSAL_RESPONSE'], value: 'NO_PROPOSAL_RESPONSE' },
  { label: STAGE_LABELS['MEETING_SCHEDULED'],    value: 'MEETING_SCHEDULED'    },
  { label: STAGE_LABELS['SIGNED'],               value: 'SIGNED'               },
  { label: '— Off-pipeline —', value: null, disabled: true },
  { label: STAGE_LABELS['DECLINED'], value: 'DECLINED' },
  { label: STAGE_LABELS['ON_HOLD'],  value: 'ON_HOLD'  },
];

function PainDot({ level }) {
  const color = PAIN_COLOR[level];
  if (!color) return null;
  return <span title={`${level} pain`} style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />;
}

function DmLabel({ contact }) {
  if (!contact) return <span style={{ fontSize: '0.68rem', color: '#d1d5db', fontStyle: 'italic' }}>No DM yet</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ fontSize: '0.72rem', color: '#111', fontWeight: 600 }}>
        {contact.first_name} {contact.last_name}
      </span>
      <span style={{ fontSize: '0.6rem', background: '#eff6ff', color: '#3b82f6', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
        {contact.tier}
      </span>
      {contact.hs_replied && (
        <span style={{ fontSize: '0.6rem', background: '#f0fdf4', color: '#16a34a', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
          replied
        </span>
      )}
    </span>
  );
}

function CompanyRow({ company, stageFilter, onSelect }) {
  const bcMap = buildingContactMap.value;
  const allContacts = contacts.value;
  const contactsByEmail = new Map(allContacts.map(c => [c.email, c]));
  const bestStage = deriveCompanyStage(company.buildings);
  const hasActiveDeal = company.buildings.some(b => DEAL_STAGES.has(b.stage));
  const hasBlocker = company.buildings.some(b => BLOCKER_STAGES.has(b.stage));

  // Filter buildings to those matching the stage filter
  const filteredBuildings = stageFilter === 'All'
    ? company.buildings
    : company.buildings.filter(b => (b.stage || 'NO_CONTACTS') === stageFilter);

  // Auto-expand if: has active deal, has blocker, or stage filter applies
  const [open, setOpen] = useState(hasActiveDeal || hasBlocker || stageFilter !== 'All');

  // Update open state when stageFilter changes
  useEffect(() => {
    if (stageFilter !== 'All') setOpen(true);
  }, [stageFilter]);

  const markets = Array.from(company.markets);
  const totalContacts = company.buildings.reduce((sum, b) => sum + (bcMap.get(b.building_name)?.length || 0), 0);

  const borderColor = hasBlocker ? '#ef4444' : hasActiveDeal ? '#a855f7' : '#e5e7eb';

  return (
    <div style={{
      background: '#fff', border: `1px solid ${borderColor}`,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '12px', marginBottom: '8px',
      overflow: 'hidden',
    }}>
      {/* Company header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' }}
      >
        <span style={{ color: '#9ca3af', fontSize: '0.7rem', flexShrink: 0 }}>{open ? '▼' : '▶'}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {company.displayName}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '1px' }}>
            {totalContacts} contacts · {company.buildings.length} building{company.buildings.length !== 1 ? 's' : ''}
            {markets.length > 0 && ` · ${markets.join(' · ')}`}
          </div>
        </div>

        <StageBadge stage={bestStage} />
      </div>

      {/* Building rows */}
      {open && (
        <div style={{ borderTop: '1px solid #f5f5f5' }}>
          {filteredBuildings.map((b, i) => {
            const emails = bcMap.get(b.building_name) || [];
            const bContacts = emails.map(e => contactsByEmail.get(e)).filter(Boolean);
            // Best P1/P2 contact for DM display
            const bestContact = bContacts.sort((a, c) => (TIER_ORDER[a.tier] ?? 4) - (TIER_ORDER[c.tier] ?? 4))[0] || null;
            const isBlocker = BLOCKER_STAGES.has(b.stage || 'NO_CONTACTS');
            const isDeal = DEAL_STAGES.has(b.stage || 'NO_CONTACTS');

            return (
              <div
                key={b.building_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '9px 16px 9px 32px',
                  borderBottom: i < filteredBuildings.length - 1 ? '1px solid #f5f5f5' : 'none',
                  background: isBlocker ? '#fef9f9' : isDeal ? '#faf5ff' : 'transparent',
                }}
              >
                {/* Tree connector */}
                <span style={{ color: '#d1d5db', fontSize: '0.7rem', flexShrink: 0 }}>
                  {i < filteredBuildings.length - 1 ? '├─' : '└─'}
                </span>

                {/* Building name — clickable */}
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => onSelect(b)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                      {b.building_name}
                    </span>
                    <PainDot level={getPainTier(b.pain_point)} />
                    {b.market && <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{b.market}</span>}
                    {b.total_units && <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{b.total_units} units</span>}
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    <DmLabel contact={bestContact} />
                  </div>
                </div>

                {/* Stage dropdown */}
                <div onClick={e => e.stopPropagation()}>
                  <StageDropdown building={b} />
                </div>
              </div>
            );
          })}

          {filteredBuildings.length === 0 && (
            <div style={{ padding: '10px 32px', fontSize: '0.72rem', color: '#bbb', fontStyle: 'italic' }}>
              No buildings match this filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Pipeline() {
  const [stageFilter, setStageFilter] = useState('All');
  const [selected, setSelected] = useState(null);

  // Listen for navigation events from Pulse city scorecards
  useEffect(() => {
    function handleFilter(e) {
      if (e.detail?.tab === 'pipeline') {
        if (e.detail.city) marketFilter.value = e.detail.city;
        if (e.detail.stage) setStageFilter(e.detail.stage);
      }
    }
    window.addEventListener('spire:filter', handleFilter);
    return () => window.removeEventListener('spire:filter', handleFilter);
  }, []);

  const m = marketFilter.value;
  const q = searchQuery.value.toLowerCase();

  const allIndex = buildCompanyIndex(buildings.value);

  // Market filter: show companies with at least one building in the selected market
  const marketFiltered = m === 'All'
    ? allIndex
    : allIndex.filter(co => co.buildings.some(b => b.market === m));

  // Search filter
  const searched = q
    ? marketFiltered.filter(co =>
        co.name.toLowerCase().includes(q) ||
        co.displayName.toLowerCase().includes(q) ||
        co.buildings.some(b => b.building_name?.toLowerCase().includes(q))
      )
    : marketFiltered;

  // Stage filter: show companies with at least one matching building
  const displayed = stageFilter === 'All'
    ? searched
    : searched.filter(co => co.buildings.some(b => (b.stage || 'NO_CONTACTS') === stageFilter));

  // Sort: companies with blockers first, then by deal stage, then alphabetically
  const sorted = [...displayed].sort((a, b) => {
    const aHasBlocker = a.buildings.some(b => BLOCKER_STAGES.has(b.stage));
    const bHasBlocker = b.buildings.some(b => BLOCKER_STAGES.has(b.stage));
    const aHasDeal = a.buildings.some(b => DEAL_STAGES.has(b.stage));
    const bHasDeal = b.buildings.some(b => DEAL_STAGES.has(b.stage));
    if (aHasBlocker !== bHasBlocker) return aHasBlocker ? -1 : 1;
    if (aHasDeal !== bHasDeal) return aHasDeal ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const totalBuildings = displayed.reduce((n, co) => n + co.buildings.length, 0);

  return (
    <div class="page">
      <MarketChips />

      <div class="controls">
        <input
          type="text"
          placeholder="Search companies or buildings…"
          value={searchQuery.value}
          onInput={e => searchQuery.value = e.target.value}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          {STAGE_GROUPS.map((g, i) =>
            g.disabled
              ? <option key={i} disabled>{g.label}</option>
              : <option key={g.value} value={g.value}>{g.label}</option>
          )}
        </select>
      </div>

      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '14px' }}>
        {sorted.length} compan{sorted.length !== 1 ? 'ies' : 'y'} · {totalBuildings} building{totalBuildings !== 1 ? 's' : ''}
        {stageFilter !== 'All' && <span style={{ marginLeft: '6px', color: '#4f7cff', fontWeight: 600 }}>· filtered: {STAGE_LABELS[stageFilter] || stageFilter}</span>}
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#bbb', fontSize: '0.85rem' }}>
          No companies match your filters.
        </div>
      ) : (
        sorted.map(co => (
          <CompanyRow
            key={co.name}
            company={co}
            stageFilter={stageFilter}
            onSelect={setSelected}
          />
        ))
      )}

      {selected && (
        <BuildingDetailPanel building={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
