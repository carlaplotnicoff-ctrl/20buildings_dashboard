import { useState } from 'preact/hooks';
import {
  filteredBuildings, contacts, buildingContactMap, emailReplies,
  STAGE_LABELS, PAIN_COLOR, getPainTier, AUTO_STAGES,
  selectedBuilding, activeTab,
} from '../store/data';
import { changeStage } from '../store/actions';
import { MarketChips } from '../components/MarketChips';
import { StageBadge } from '../components/StageBadge';
import { StageDropdown } from '../components/StageDropdown';
import { normalizeCompany } from '../lib/format';
import { addToast } from '../components/Toast';

// All pipeline stages in progression order (matches data.js STAGES)
const BOARD_STAGES = [
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

// Phase labels spanning columns
const PHASE_SPANS = [
  { label: 'Pre-Outreach', stages: ['NO_CONTACTS', 'CONTACTS_IMPORTED'],                                                                    color: '#ef4444' },
  { label: 'Outreach',     stages: ['IN_SEQUENCE', 'LINKEDIN_CONTACT', 'NO_DM_RESPONSE', 'SECOND_PUSH'],                                    color: '#579bfc' },
  { label: 'Triage',       stages: ['GATEKEEPER', 'PROPOSAL_GATEKEEPER', 'WRONG_COMPANY', 'DM_IDENTIFIED'],                                 color: '#ffcb00' },
  { label: 'Deal',         stages: ['PROPOSAL_SENT', 'NO_PROPOSAL_RESPONSE', 'MEETING_SCHEDULED', 'SIGNED'],                               color: '#a855f7' },
];

const TIER_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3 };
const PAIN_ORDER = { High: 0, Medium: 1, Low: 2 };

// Auto stages where a reply means we should classify it
const CLASSIFY_PROMPT_STAGES = new Set(['NO_CONTACTS', 'CONTACTS_IMPORTED', 'IN_SEQUENCE', 'LINKEDIN_CONTACT', 'NO_DM_RESPONSE']);

// Auto-reply patterns — these replies don't need classification
const AUTO_REPLY_PATTERNS = [
  'out of office', 'automatic reply', 'auto-reply', 'auto reply',
  'on vacation', 'on leave', 'away from the office', 'no longer with',
  'left the company', 'unmonitored mailbox', 'mailer-daemon',
];
function isAutoReply(reply) {
  const subject = (reply?.subject || '').toLowerCase();
  const body = (reply?.body_preview || '').toLowerCase();
  return AUTO_REPLY_PATTERNS.some(p => subject.includes(p) || body.slice(0, 100).includes(p));
}

function PainDot({ level }) {
  const color = PAIN_COLOR[level];
  if (!color) return null;
  return <span title={`${level} pain`} style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />;
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

// Inline triage popover for classifying a reply
function ClassifyPopover({ building, reply, onClose }) {
  const [saving, setSaving] = useState(null);

  async function classify(stage) {
    setSaving(stage);
    try {
      await changeStage(building.building_id, stage);
      addToast(`${building.building_name} → ${STAGE_LABELS[stage]}`, 'ok');
      onClose();
    } catch {
      addToast('Failed to update stage', 'err');
    } finally {
      setSaving(null);
    }
  }

  const preview = (reply?.body_preview || '').slice(0, 220);

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '12px', marginTop: '4px',
      }}
    >
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px' }}>
        Reply received — classify:
      </div>
      {preview && (
        <div style={{ fontSize: '0.67rem', color: '#374151', background: '#f9fafb', borderRadius: '6px', padding: '6px 8px', marginBottom: '10px', maxHeight: '60px', overflow: 'hidden', lineHeight: 1.4 }}>
          {preview}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { stage: 'DM_IDENTIFIED',  label: 'DM Identified',  color: '#66ccff', bg: '#f0f9ff' },
          { stage: 'GATEKEEPER',     label: 'Gatekeeper',     color: '#b45309', bg: '#fffbeb' },
          { stage: 'WRONG_COMPANY',  label: 'Wrong Company',  color: '#dc2626', bg: '#fef2f2' },
          { stage: 'ON_HOLD',        label: 'On Hold',        color: '#6b7280', bg: '#f3f4f6' },
          { stage: 'DECLINED',       label: 'Declined',       color: '#9ca3af', bg: '#f9fafb' },
        ].map(({ stage, label, color, bg }) => (
          <button
            key={stage}
            onClick={() => classify(stage)}
            disabled={!!saving}
            style={{
              background: saving === stage ? '#e5e7eb' : bg, color,
              border: `1px solid ${color}40`, borderRadius: '6px',
              padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving === stage ? '...' : label}
          </button>
        ))}
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.7rem' }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function BoardCard({ building, onSelect }) {
  const [classifyOpen, setClassifyOpen] = useState(false);

  const bcMap = buildingContactMap.value;
  const contactsByEmail = new Map(contacts.value.map(c => [c.email, c]));
  const emails = bcMap.get(building.building_name) || [];
  const linkedContacts = emails.map(e => contactsByEmail.get(e)).filter(Boolean);
  const contactCount = linkedContacts.length;
  const accent = STAGE_ACCENT[building.stage || 'NO_CONTACTS'] || '#9ca3af';

  const bestContact = [...linkedContacts]
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 4) - (TIER_ORDER[b.tier] ?? 4))[0];

  const hasReplied = linkedContacts.some(c => c.hs_replied);

  // Find non-auto-reply incoming replies for this building's contacts
  const buildingReplies = emailReplies.value.filter(r =>
    r.direction === 'INCOMING' && emails.includes(r.contact_email) && !isAutoReply(r)
  );
  const latestReply = buildingReplies.sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0))[0];

  // Show "classify" badge if: building is in an auto stage AND has a real reply
  const needsClassify = hasReplied && CLASSIFY_PROMPT_STAGES.has(building.stage || 'NO_CONTACTS') && latestReply;

  return (
    <div class="board-card" style={{ position: 'relative' }} onClick={() => onSelect(building)}>
      {/* Building name + pain dot */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#111', lineHeight: 1.3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {building.building_name}
        </div>
        <PainDot level={getPainTier(building.pain_point)} />
      </div>

      {/* Market + units */}
      <div style={{ fontSize: '0.63rem', color: '#9ca3af', marginBottom: '2px' }}>
        {building.market}{building.total_units ? ` · ${building.total_units} units` : ''}
      </div>

      {/* Best contact + company */}
      {bestContact ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', flexWrap: 'nowrap' }}>
          <span style={{ fontSize: '0.68rem', color: '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bestContact.first_name} {bestContact.last_name}
            {building.owner_1 && <span style={{ fontWeight: 400, color: '#c0c0c0' }}> · {normalizeCompany(building.owner_1)}</span>}
          </span>
          {bestContact.tier && (
            <span style={{ fontSize: '0.58rem', background: '#eff6ff', color: '#3b82f6', borderRadius: '4px', padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
              {bestContact.tier}
            </span>
          )}
          {hasReplied && (
            <span style={{ fontSize: '0.58rem', background: '#f0fdf4', color: '#16a34a', borderRadius: '4px', padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
              replied
            </span>
          )}
        </div>
      ) : building.owner_1 ? (
        <div style={{ fontSize: '0.62rem', color: '#c0c0c0', marginBottom: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {normalizeCompany(building.owner_1)}
        </div>
      ) : null}

      {/* Classify reply badge */}
      {needsClassify && (
        <div onClick={e => { e.stopPropagation(); setClassifyOpen(o => !o); }} style={{ marginBottom: '6px' }}>
          <span style={{
            display: 'inline-block', background: '#fffbeb', color: '#b45309',
            border: '1px solid #fde68a', borderRadius: '6px',
            fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', cursor: 'pointer',
          }}>
            ⚡ Classify reply
          </span>
          {classifyOpen && (
            <ClassifyPopover
              building={building}
              reply={latestReply}
              onClose={() => setClassifyOpen(false)}
            />
          )}
        </div>
      )}

      {/* Stage dropdown + contact count */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
        <div onClick={e => e.stopPropagation()}>
          <StageDropdown building={building} />
        </div>
        {contactCount > 0 && (
          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: accent + '18', color: accent }}>
            {contactCount}
          </span>
        )}
      </div>
    </div>
  );
}

function BoardColumn({ stage, buildings, onSelect }) {
  const accent = STAGE_ACCENT[stage] || '#9ca3af';
  return (
    <div class="board-col">
      <div class="board-col-header" style={{ borderTop: `3px solid ${accent}` }}>
        <StageBadge stage={stage} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 8px', borderRadius: '20px', background: accent + '18', color: accent }}>
          {buildings.length}
        </span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        {buildings.length === 0 ? (
          <div style={{ fontSize: '0.68rem', color: '#e5e7eb', textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>—</div>
        ) : (
          buildings.map(b => <BoardCard key={b.building_id} building={b} onSelect={onSelect} />)
        )}
      </div>
    </div>
  );
}

function openProfile(building) {
  selectedBuilding.value = building;
  activeTab.value = 'profile';
}

export function Board() {
  const [painFilter, setPainFilter] = useState('All');
  const [dmFilter, setDmFilter] = useState(false);
  const [repliedFilter, setRepliedFilter] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);

  const bcMap = buildingContactMap.value;
  const contactsByEmail = new Map(contacts.value.map(c => [c.email, c]));

  function getLinkedContacts(building) {
    return (bcMap.get(building.building_name) || []).map(e => contactsByEmail.get(e)).filter(Boolean);
  }

  const base = filteredBuildings.value.filter(b => {
    const linked = getLinkedContacts(b);
    if (painFilter !== 'All' && getPainTier(b.pain_point) !== painFilter) return false;
    if (dmFilter && !linked.some(c => c.tier === 'P1')) return false;
    if (repliedFilter && !linked.some(c => c.hs_replied)) return false;
    return true;
  });

  const byStage = {};
  for (const s of BOARD_STAGES) byStage[s] = [];
  const issues = [];
  for (const b of base) {
    const s = b.stage || 'NO_CONTACTS';
    if (byStage[s] !== undefined) byStage[s].push(b);
    else if (ISSUE_STAGES.includes(s)) issues.push(b);
    else byStage['NO_CONTACTS'].push(b);
  }

  // Sort deal-stage columns by pain (High first)
  ['DM_IDENTIFIED', 'PROPOSAL_SENT', 'NO_PROPOSAL_RESPONSE', 'MEETING_SCHEDULED', 'SIGNED'].forEach(s => {
    byStage[s]?.sort((a, b) => (PAIN_ORDER[getPainTier(a.pain_point)] ?? 3) - (PAIN_ORDER[getPainTier(b.pain_point)] ?? 3));
  });

  const totalShown = base.length;
  const activeFilters = (painFilter !== 'All' ? 1 : 0) + (dmFilter ? 1 : 0) + (repliedFilter ? 1 : 0);

  return (
    <div class="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ flexShrink: 0, paddingBottom: '8px' }}>
        <MarketChips />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: '#bbb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pain</span>
          <FilterChip label="All"    active={painFilter === 'All'}    color="#6b7280" onClick={() => setPainFilter('All')} />
          <FilterChip label="High"   active={painFilter === 'High'}   color="#ef4444" onClick={() => setPainFilter(painFilter === 'High'   ? 'All' : 'High')} />
          <FilterChip label="Medium" active={painFilter === 'Medium'} color="#f59e0b" onClick={() => setPainFilter(painFilter === 'Medium' ? 'All' : 'Medium')} />
          <FilterChip label="Low"    active={painFilter === 'Low'}    color="#10b981" onClick={() => setPainFilter(painFilter === 'Low'    ? 'All' : 'Low')} />
          <div style={{ width: '1px', height: '18px', background: '#e5e7eb', margin: '0 4px' }} />
          <FilterChip label="Has DM (P1)"  active={dmFilter}      color="#3b82f6" onClick={() => setDmFilter(f => !f)} />
          <FilterChip label="Has Replies"  active={repliedFilter}  color="#16a34a" onClick={() => setRepliedFilter(f => !f)} />
          <span style={{ fontSize: '0.68rem', color: activeFilters > 0 ? '#4f7cff' : '#d1d5db', marginLeft: '4px' }}>
            {totalShown} building{totalShown !== 1 ? 's' : ''}
            {activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters > 1 ? 's' : ''} active` : ''}
          </span>
        </div>
      </div>

      {/* Phase labels + Kanban in one scrollable container so they stay in sync */}
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
            <BoardColumn key={s} stage={s} buildings={byStage[s]} onSelect={openProfile} />
          ))}
        </div>
      </div>

      {/* Declined / On Hold — collapsed */}
      {issues.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
          <button onClick={() => setIssuesOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', padding: '4px 0' }}>
            {issuesOpen ? '▼' : '▶'} {issues.length} declined / on hold
          </button>
          {issuesOpen && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '6px' }}>
              {issues.map(b => <BoardCard key={b.building_id} building={b} onSelect={openProfile} />)}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
