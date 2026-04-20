import {
  selectedCompany, selectedBuilding, activeTab,
  PAIN_COLOR, getPainTier,
} from '../store/data';
import { StageBadge } from '../components/StageBadge';

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

function BuildingRow({ building }) {
  const pain = getPainTier(building.pain_point);
  const accent = STAGE_ACCENT[building.stage] || '#9ca3af';

  function handleClick() {
    selectedBuilding.value = building;
    activeTab.value = 'profile';
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', borderRadius: '10px', cursor: 'pointer',
        background: '#fff', border: '1px solid #f0f0f0', marginBottom: '8px',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Pain dot */}
      <PainDot level={pain} />

      {/* Building info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {building.building_name}
        </div>
        {building.address && (
          <div style={{ fontSize: '0.68rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {building.address}
          </div>
        )}
      </div>

      {/* Market */}
      {building.market && (
        <span style={{ fontSize: '0.63rem', fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>
          {building.market}
        </span>
      )}

      {/* Stage badge */}
      <StageBadge stage={building.stage} />

      {/* Arrow */}
      <span style={{ fontSize: '0.75rem', color: '#d1d5db', flexShrink: 0 }}>›</span>
    </div>
  );
}

export function CompanyBuildings() {
  const company = selectedCompany.value;
  if (!company) return null;

  const buildings = [...company.buildings].sort((a, b) =>
    (a.building_name || '').localeCompare(b.building_name || '')
  );

  return (
    <div class="page" style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={() => { selectedCompany.value = null; }}
          style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px',
            cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280',
            padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          ← Back
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111' }}>
            {company.displayName}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
            {buildings.length} building{buildings.length !== 1 ? 's' : ''} · {Array.from(company.markets).join(' · ')}
          </div>
        </div>
      </div>

      {/* Building list */}
      <div>
        {buildings.map(b => (
          <BuildingRow key={b.building_id} building={b} />
        ))}
      </div>
    </div>
  );
}
