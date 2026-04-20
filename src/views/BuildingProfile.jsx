import { useState } from 'preact/hooks';
import {
  contacts, buildingContactMap, stageHistory, emailReplies, touchLog,
  selectedBuilding, activeTab, PAIN_COLOR, STAGE_LABELS,
} from '../store/data';
import { updateBuildingNotes } from '../store/actions';
import { StageDropdown } from '../components/StageDropdown';
import { AiModal } from '../components/AiModal';
import { addToast } from '../components/Toast';
import { formatDate } from '../lib/format';
import { supabase } from '../store/supabase';

const BLOCKED_PROPOSAL_STAGES = new Set(['FLAGGED — NO CONTACTS', 'FLAGGED — WRONG OWNER', 'FLAGGED — WRONG COMPANY', 'DECLINED']);

function initials(firstName, lastName) {
  return `${(firstName || '')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase() || '?';
}

function phaseOf(contact) {
  if (contact.hs_replied) return 'hot';
  if (contact.hs_opened || contact.hs_enrolled) return 'warm';
  return 'cold';
}

function phaseLabel(p) {
  if (p === 'hot')  return { label: 'Replied', bg: '#fef2f2', color: '#ef4444' };
  if (p === 'warm') return { label: 'Opened',  bg: '#fffbeb', color: '#d97706' };
  return                    { label: 'Cold',    bg: '#f9fafb', color: '#9ca3af' };
}

// Merge stage history + email replies + touches into unified timeline
function buildTimeline(history, replies, touches) {
  const items = [];
  for (const h of history) {
    items.push({ type: 'stage', date: h.created_at, title: `Stage → ${STAGE_LABELS[h.new_stage] || h.new_stage}`, sub: h.old_stage ? `From: ${STAGE_LABELS[h.old_stage] || h.old_stage}` : 'Initial stage', by: h.changed_by });
  }
  for (const r of replies) {
    items.push({ type: 'reply', date: r.received_at, title: r.subject || 'Email reply', sub: `${r.contact_email} — ${r.body_preview?.slice(0, 80) || ''}`, by: '' });
  }
  for (const t of touches) {
    items.push({ type: 'touch', date: t.created_at, title: `${t.channel} — ${t.outcome}`, sub: t.notes || t.next_step || '', by: t.logged_by });
  }
  return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);
}

export function BuildingProfile() {
  const building = selectedBuilding.value;
  if (!building) return null;

  const [notes, setNotes] = useState(building.notes || '');
  const [saving, setSaving] = useState(false);
  const [aiModal, setAiModal] = useState(null);

  const bcMap = buildingContactMap.value;
  const contactEmails = bcMap.get(building.building_name) || [];
  const linkedContacts = contacts.value.filter(c => contactEmails.includes(c.email));
  const history  = stageHistory.value.filter(h => h.building_id === building.building_id);
  const replies  = emailReplies.value.filter(r => contactEmails.includes(r.contact_email) && r.direction === 'INCOMING').slice(0, 20);
  const touches  = touchLog.value.filter(t => contactEmails.some(e => {
    const c = contacts.value.find(c => c.email === e);
    return c && c.contact_id === t.contact_id;
  })).slice(0, 20);

  const timeline = buildTimeline(history, replies, touches);
  const painColor = PAIN_COLOR[building.pain_point] || '#9ca3af';
  const canGenerate = !BLOCKED_PROPOSAL_STAGES.has(building.stage);

  // Last reply date from replies
  const lastReply = replies[0]?.received_at;
  const lastTouch = touches[0]?.created_at;
  const lastStageChange = history[0]?.created_at;

  async function saveNotes() {
    setSaving(true);
    try {
      await updateBuildingNotes(building.building_id, notes);
      addToast('Notes saved', 'ok');
    } catch (e) {
      addToast(`Failed: ${e.message}`, 'err');
    }
    setSaving(false);
  }

  function goBack() {
    selectedBuilding.value = null;
    activeTab.value = 'board';
  }

  return (
    <div class="profile-page">
      {/* Top bar */}
      <div class="profile-topbar">
        <button class="profile-back" onClick={goBack}>
          ← Board
        </button>
        <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
        <div class="profile-topbar-title">{building.building_name}</div>
        <div class="profile-topbar-sub">{building.market} · {building.address}</div>
        <StageDropdown building={building} />
        {canGenerate && (
          <button
            class="btn btn-p btn-sm"
            onClick={() => setAiModal({
              type: 'proposal',
              title: `${building.building_name} — Revenue Analysis`,
              fetchFn: () => supabase.functions.invoke('generate-proposal', { body: { building_id: building.building_id } }).then(r => r.data),
            })}
          >
            Generate Proposal
          </button>
        )}
      </div>

      {/* 3-column body */}
      <div class="profile-body">

        {/* LEFT — sidebar */}
        <div class="profile-sidebar">
          {/* Photo / identity block */}
          <div class="profile-card">
            <div class="profile-photo-block">
              <div class="profile-photo-icon">🏢</div>
              <div class="profile-building-name">{building.building_name}</div>
              {building.address && <div class="profile-building-addr">{building.address}</div>}
            </div>
          </div>

          {/* Key facts */}
          <div class="profile-card">
            <div class="profile-card-header">Building Facts</div>
            <div class="profile-card-body">
              {building.total_units && (
                <div class="profile-fact">
                  <div class="profile-fact-label">Units</div>
                  <div class="profile-fact-val">{building.total_units}</div>
                </div>
              )}
              {building.owner_1 && (
                <div class="profile-fact">
                  <div class="profile-fact-label">Owner</div>
                  <div class="profile-fact-val">{building.owner_1}</div>
                </div>
              )}
              {building.management_company && (
                <div class="profile-fact">
                  <div class="profile-fact-label">Management</div>
                  <div class="profile-fact-val">{building.management_company}</div>
                </div>
              )}
              {building.asking_rent_monthly && (
                <div class="profile-fact">
                  <div class="profile-fact-label">Asking Rent</div>
                  <div class="profile-fact-val">${Number(building.asking_rent_monthly).toLocaleString()}/mo</div>
                </div>
              )}
              {building.pain_point && (
                <div class="profile-fact">
                  <div class="profile-fact-label">Pain Point</div>
                  <div class="profile-fact-val">
                    <span style={{ color: painColor, fontWeight: 700 }}>{building.pain_point}</span>
                  </div>
                </div>
              )}
              {building.concessions && (
                <div class="profile-fact">
                  <div class="profile-fact-label">Concessions</div>
                  <div class="profile-fact-val">{building.concessions}</div>
                </div>
              )}
            </div>
          </div>

          {/* Activity dates */}
          <div class="profile-card">
            <div class="profile-card-header">Activity</div>
            <div class="profile-card-body">
              <div class="profile-date-row">
                <div class="profile-date-label">Last Reply</div>
                <div class={`profile-date-val${lastReply ? '' : ' empty'}`}>
                  {lastReply ? formatDate(lastReply) : 'No replies yet'}
                </div>
              </div>
              <div class="profile-date-row">
                <div class="profile-date-label">Last Touch</div>
                <div class={`profile-date-val${lastTouch ? '' : ' empty'}`}>
                  {lastTouch ? formatDate(lastTouch) : 'No touches logged'}
                </div>
              </div>
              <div class="profile-date-row">
                <div class="profile-date-label">Stage Changed</div>
                <div class={`profile-date-val${lastStageChange ? '' : ' empty'}`}>
                  {lastStageChange ? formatDate(lastStageChange) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div class="profile-card">
            <div class="profile-card-header">Notes</div>
            <div class="profile-card-body">
              <textarea
                class="notes-editor"
                style={{ width: '100%', minHeight: '100px', boxSizing: 'border-box' }}
                value={notes}
                onInput={e => setNotes(e.target.value)}
                placeholder="Add notes..."
              />
              <button class="btn btn-p btn-sm" onClick={saveNotes} disabled={saving} style={{ marginTop: '8px' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {/* CENTER — lead status + timeline */}
        <div class="profile-main">
          {/* Lead status */}
          <div class="profile-card">
            <div class="profile-card-header" style={{ padding: '14px 16px 10px' }}>
              Lead Status Overview
              <span style={{ float: 'right', fontWeight: 400, textTransform: 'none', color: '#9ca3af' }}>
                {linkedContacts.length} contact{linkedContacts.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {linkedContacts.length === 0 ? (
                <div class="no-data">No contacts linked to this building.</div>
              ) : (
                <div class="profile-lead-grid">
                  {linkedContacts.map(c => {
                    const phase = phaseOf(c);
                    const { label, bg, color } = phaseLabel(phase);
                    return (
                      <div key={c.contact_id} class={`profile-lead-card ${phase}`}>
                        <div class="profile-lead-badge">
                          {c.tier && <span class={`badge bp${c.tier.replace('P','')}`}>{c.tier}</span>}
                        </div>
                        <div class="profile-lead-avatar" style={{ background: bg, color }}>
                          {initials(c.first_name, c.last_name)}
                        </div>
                        <div class="profile-lead-name">{c.first_name} {c.last_name}</div>
                        <div class="profile-lead-title">{c.job_title || c.company}</div>
                        <span class="profile-lead-status" style={{ background: bg, color }}>{label}</span>
                        {c.hs_last_replied && (
                          <div class="profile-lead-updated">Reply: {formatDate(c.hs_last_replied)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div class="profile-card" style={{ flex: 1 }}>
            <div class="profile-card-header">Activity Timeline</div>
            <div style={{ padding: '14px 16px' }}>
              {timeline.length === 0 ? (
                <div class="no-data">No activity recorded yet.</div>
              ) : (
                <div class="profile-timeline">
                  {timeline.map((item, i) => (
                    <div key={i} class="profile-tl-item">
                      <div class="profile-tl-dot-col">
                        <div class={`profile-tl-dot ${item.type}`} />
                        {i < timeline.length - 1 && <div class="profile-tl-line" />}
                      </div>
                      <div class="profile-tl-content">
                        <div class="profile-tl-title">{item.title}</div>
                        {item.sub && <div class="profile-tl-sub">{item.sub}</div>}
                        <div class="profile-tl-time">
                          {formatDate(item.date)}{item.by ? ` · ${item.by}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — quick connects */}
        <div class="profile-right">
          <div class="profile-card" style={{ flex: 1 }}>
            <div class="profile-card-header">
              Quick Connects
              <span style={{ float: 'right', fontWeight: 400, textTransform: 'none', color: '#9ca3af' }}>
                {linkedContacts.length}
              </span>
            </div>
            <div>
              {linkedContacts.length === 0 ? (
                <div style={{ padding: '14px 16px' }} class="no-data">No contacts linked.</div>
              ) : (
                linkedContacts.map(c => (
                  <div key={c.contact_id} class="profile-qc-item">
                    <div class="profile-qc-avatar">
                      {initials(c.first_name, c.last_name)}
                    </div>
                    <div class="profile-qc-info">
                      <div class="profile-qc-name">{c.first_name} {c.last_name}</div>
                      <div class="profile-qc-title">{c.job_title}</div>
                      <div class="profile-qc-badges">
                        {c.tier && <span class={`badge bp${c.tier.replace('P','')}`} style={{ fontSize: '0.58rem' }}>{c.tier}</span>}
                        {c.hs_replied  && <span class="hs-icon hs-replied"  title="Replied">R</span>}
                        {c.hs_opened   && !c.hs_replied && <span class="hs-icon hs-opened" title="Opened">O</span>}
                        {c.hs_enrolled && !c.hs_opened  && <span class="hs-icon hs-enrolled" title="Enrolled">E</span>}
                      </div>
                    </div>
                    <div class="profile-qc-actions">
                      {c.email && (
                        <a href={`mailto:${c.email}`} class="profile-qc-btn" title={c.email}>✉</a>
                      )}
                      {c.linkedin && (
                        <a href={c.linkedin} target="_blank" rel="noreferrer" class="profile-qc-btn" title="LinkedIn">in</a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Latest reply preview */}
          {replies.length > 0 && (
            <div class="profile-card">
              <div class="profile-card-header">Latest Reply</div>
              <div class="profile-card-body">
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '4px' }}>
                  {formatDate(replies[0].received_at)} · {replies[0].contact_email}
                </div>
                {replies[0].subject && (
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px' }}>{replies[0].subject}</div>
                )}
                <div style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.5 }}>
                  {replies[0].body_preview || '(no preview)'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {aiModal && (
        <AiModal
          type={aiModal.type}
          title={aiModal.title}
          fetchFn={aiModal.fetchFn}
          onClose={() => setAiModal(null)}
        />
      )}
    </div>
  );
}
