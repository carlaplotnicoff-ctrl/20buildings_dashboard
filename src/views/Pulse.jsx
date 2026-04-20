import { useState } from 'preact/hooks';
import {
  Button, Dropdown, TextField, Badge, Heading, Text, Flex, Divider, Label,
} from '@vibe/core';
import {
  buildings, contacts, buildingContactMap, contactBuildingMap,
  emailReplies, touchLog, MARKETS, STAGE_LABELS, activeTab,
} from '../store/data';
import { logTouch } from '../store/actions';
import { addToast } from '../components/Toast';
import { BuildingDetailPanel } from '../components/BuildingDetailPanel';
import { timeAgo } from '../lib/format';

// ── Auto-reply detection ───────────────────────────────────────
const AUTO_REPLY_PATTERNS = [
  'out of office', 'automatic reply', 'auto-reply', 'auto reply',
  'on vacation', 'on leave', 'away from the office', 'no longer with',
  'left the company', 'unmonitored mailbox', 'mailer-daemon', 'do not reply to this',
];
function isAutoReply(reply) {
  return AUTO_REPLY_PATTERNS.some(p => (reply.subject || '').toLowerCase().includes(p));
}
function getAutoRepliedOnlyEmails() {
  const byEmail = {};
  for (const r of emailReplies.value) {
    if (!r.contact_email || r.direction !== 'INCOMING') continue;
    (byEmail[r.contact_email] = byEmail[r.contact_email] || []).push(r);
  }
  const set = new Set();
  for (const [email, replies] of Object.entries(byEmail)) {
    if (replies.length > 0 && replies.every(r => isAutoReply(r))) set.add(email);
  }
  return set;
}

function getRespondedIds() {
  const set = new Set();
  const latestTouch = new Map();
  for (const t of touchLog.value) {
    if (!t.contact_id || !t.created_at) continue;
    const existing = latestTouch.get(t.contact_id);
    if (!existing || new Date(t.created_at) > new Date(existing)) latestTouch.set(t.contact_id, t.created_at);
  }
  const outboundByEmail = new Map();
  for (const r of emailReplies.value) {
    if (!r.contact_email || r.direction === 'INCOMING') continue;
    const d = r.received_at || r.synced_at;
    if (!d) continue;
    const existing = outboundByEmail.get(r.contact_email);
    if (!existing || new Date(d) > new Date(existing)) outboundByEmail.set(r.contact_email, d);
  }
  for (const c of contacts.value) {
    if (!c.hs_replied || !c.hs_last_replied) continue;
    const replyDate = new Date(c.hs_last_replied);
    const touch = latestTouch.get(c.contact_id);
    if (touch && new Date(touch) > replyDate) { set.add(c.contact_id); continue; }
    const outbound = outboundByEmail.get(c.email);
    if (outbound && new Date(outbound) > replyDate) set.add(c.contact_id);
  }
  return set;
}

// ── Dropdown option lists ─────────────────────────────────────
const CHANNEL_OPTIONS = ['Email', 'Phone', 'LinkedIn', 'In Person', 'Text'].map(v => ({ value: v, label: v }));
const OUTCOME_OPTIONS = ['Positive', 'Neutral', 'Objection', 'No Answer', 'Left Voicemail', 'Scheduled Call'].map(v => ({ value: v, label: v }));

// ── City scorecard config ─────────────────────────────────────
const SCORECARD_ROWS = [
  { key: 'noContacts',    emoji: '🔴', label: 'No Contacts Found',  color: '#ef4444', urgent: true,  stage: 'NO_CONTACTS'    },
  { key: 'inSequence',    emoji: '🔵', label: 'In Sequence',        color: '#3b82f6', urgent: false, stage: 'IN_SEQUENCE'    },
  { key: 'noDmResponse',  emoji: '🟡', label: 'No DM Response',     color: '#f59e0b', urgent: true,  stage: 'NO_DM_RESPONSE' },
  { key: 'dmIdentified',  emoji: '🟢', label: 'DM Identified',      color: '#10b981', urgent: false, stage: 'DM_IDENTIFIED'  },
  { key: 'dealsInMotion', emoji: '🔥', label: 'Deals in Motion',    color: '#f97316', urgent: false, stage: 'PROPOSAL_SENT'  },
  { key: 'signed',        emoji: '✅', label: 'Signed',             color: '#00854d', urgent: false, stage: 'SIGNED'         },
];

// ── Section A: Replies waiting ────────────────────────────────
function RepliesSection() {
  const [openForm, setOpenForm] = useState(null);
  const [formState, setFormState] = useState({});
  const [submitting, setSubmitting] = useState(null);

  const respondedIds = getRespondedIds();
  const autoOnly = getAutoRepliedOnlyEmails();
  const cbMap = contactBuildingMap.value;

  const waiting = contacts.value
    .filter(c => c.hs_replied && !respondedIds.has(c.contact_id) && !autoOnly.has(c.email))
    .sort((a, b) => new Date(b.hs_last_replied || 0) - new Date(a.hs_last_replied || 0));

  function setField(id, field, val) {
    setFormState(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: val } }));
  }

  async function submitTouch(c) {
    const form = formState[c.contact_id] || {};
    if (!form.channel || !form.outcome) { addToast('Select channel and outcome', 'err'); return; }
    setSubmitting(c.contact_id);
    try {
      const buildingId = (cbMap.get(c.email) || [])[0] || null;
      await logTouch({ contactId: c.contact_id, buildingId, channel: form.channel, outcome: form.outcome, notes: form.notes || '' });
      addToast(`Logged: ${c.first_name} ${c.last_name}`, 'ok');
      setOpenForm(null);
    } catch { addToast('Failed to log', 'err'); }
    finally { setSubmitting(null); }
  }

  if (waiting.length === 0) {
    return (
      <div class="vibe-card vibe-card--success">
        <Flex align="center" justify="space-between" style={{ width: '100%' }}>
          <Heading type="h3" weight="bold">Replies waiting</Heading>
          <Label kind="line" color="positive" text="All caught up ✓" />
        </Flex>
      </div>
    );
  }

  return (
    <div class="vibe-card vibe-card--danger">
      <Flex align="center" justify="space-between" style={{ width: '100%', marginBottom: 14 }}>
        <Flex align="center" gap={12}>
          <Heading type="h3" weight="bold">Replies waiting</Heading>
          <Text type="text2" color="secondary">Log your follow-up to clear each one</Text>
        </Flex>
        <Badge count={waiting.length} type="indicator" color="negative" />
      </Flex>

      {waiting.map(c => {
        const bldgName = (cbMap.get(c.email) || [])[0] || c.company || '—';
        const isOpen = openForm === c.contact_id;
        const form = formState[c.contact_id] || {};
        return (
          <div key={c.contact_id}>
            <Flex align="center" gap={12} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Flex align="center" gap={8} wrap>
                  <Text type="text1" weight="bold">{c.first_name} {c.last_name}</Text>
                  {c.tier && <Label kind="line" color="primary" text={c.tier} />}
                  <Text type="text2" color="secondary" ellipsis style={{ maxWidth: 220 }}>{bldgName}</Text>
                  {c.market && <Text type="text2" color="secondary">{c.market}</Text>}
                </Flex>
                {c.hs_last_replied && (
                  <Text type="text2" color="secondary" style={{ marginTop: 2 }}>
                    Replied {timeAgo(c.hs_last_replied)}
                  </Text>
                )}
              </div>
              <Button
                kind={isOpen ? 'secondary' : 'primary'}
                size="small"
                onClick={() => setOpenForm(isOpen ? null : c.contact_id)}
              >
                {isOpen ? 'Cancel' : 'Log follow-up'}
              </Button>
            </Flex>

            {isOpen && (
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, margin: '6px 0 10px' }}>
                <Flex gap={12} wrap align="end">
                  <div style={{ minWidth: 140 }}>
                    <Dropdown
                      placeholder="Channel"
                      size="small"
                      options={CHANNEL_OPTIONS}
                      value={CHANNEL_OPTIONS.find(o => o.value === form.channel) || null}
                      onChange={opt => setField(c.contact_id, 'channel', opt?.value || '')}
                    />
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <Dropdown
                      placeholder="Outcome"
                      size="small"
                      options={OUTCOME_OPTIONS}
                      value={OUTCOME_OPTIONS.find(o => o.value === form.outcome) || null}
                      onChange={opt => setField(c.contact_id, 'outcome', opt?.value || '')}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <TextField
                      size="small"
                      placeholder="Notes (optional)"
                      value={form.notes || ''}
                      onChange={val => setField(c.contact_id, 'notes', val)}
                    />
                  </div>
                  <Button
                    kind="primary"
                    color="positive"
                    size="small"
                    loading={submitting === c.contact_id}
                    onClick={() => submitTouch(c)}
                  >
                    Save
                  </Button>
                </Flex>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Section B: City scorecards ────────────────────────────────
function CityScorecards() {
  const cities = MARKETS.value.filter(m => m !== 'All');
  const allBuildings = buildings.value;

  function navigateTo(city, stage) {
    window.dispatchEvent(new CustomEvent('spire:filter', { detail: { tab: 'pipeline', city, stage } }));
    activeTab.value = 'pipeline';
  }

  return (
    <div>
      <Heading type="h3" weight="bold" style={{ marginBottom: 14 }}>Pipeline by city</Heading>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {cities.map(city => {
          const mb = allBuildings.filter(b => b.market === city);
          if (mb.length === 0) return null;

          const stats = {
            noContacts:    mb.filter(b => b.stage === 'NO_CONTACTS').length,
            inSequence:    mb.filter(b => b.stage === 'IN_SEQUENCE' || b.stage === 'LINKEDIN_CONTACT').length,
            noDmResponse:  mb.filter(b => b.stage === 'NO_DM_RESPONSE').length,
            dmIdentified:  mb.filter(b => b.stage === 'DM_IDENTIFIED').length,
            dealsInMotion: mb.filter(b => ['PROPOSAL_SENT', 'NO_PROPOSAL_RESPONSE', 'MEETING_SCHEDULED'].includes(b.stage)).length,
            signed:        mb.filter(b => b.stage === 'SIGNED').length,
          };

          const companies = new Set(mb.map(b => b.owner_1).filter(Boolean)).size;
          const hasUrgent = stats.noContacts > 0 || stats.noDmResponse > 0;

          return (
            <div
              key={city}
              class={`vibe-card vibe-card--scorecard ${hasUrgent ? 'vibe-card--danger' : ''}`}
            >
              <div style={{ marginBottom: 12 }}>
                <Heading type="h3" weight="bold">{city}</Heading>
                <Text type="text2" color="secondary">
                  {mb.length} buildings · {companies} compan{companies !== 1 ? 'ies' : 'y'}
                </Text>
              </div>

              {SCORECARD_ROWS.map(row => {
                const count = stats[row.key];
                if (count === 0 && !row.urgent) return null;
                return (
                  <div
                    key={row.key}
                    class="vibe-scorecard-row"
                    onClick={() => navigateTo(city, row.stage)}
                  >
                    <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{row.emoji}</span>
                    <span style={{
                      flex: 1,
                      fontSize: '0.82rem',
                      color: count > 0 && row.urgent ? row.color : 'var(--primary-text-color, #323338)',
                      fontWeight: count > 0 && row.urgent ? 700 : 400,
                    }}>
                      {row.label}
                    </span>
                    <span style={{
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      minWidth: 28,
                      textAlign: 'right',
                      color: count === 0 ? '#d1d5db' : (row.urgent ? row.color : 'var(--primary-text-color, #323338)'),
                    }}>
                      {count}
                    </span>
                    <span style={{ color: '#d1d5db', fontSize: '0.7rem', flexShrink: 0 }}>›</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export function Pulse() {
  const [detailBuilding, setDetailBuilding] = useState(null);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div class="page">
      <div style={{ marginBottom: 20 }}>
        <Heading type="h1" weight="bold">Pulse</Heading>
        <Text type="text2" color="secondary">{today}</Text>
      </div>

      <RepliesSection />
      <div style={{ height: 16 }} />
      <CityScorecards />

      {detailBuilding && (
        <BuildingDetailPanel building={detailBuilding} onClose={() => setDetailBuilding(null)} />
      )}
    </div>
  );
}
