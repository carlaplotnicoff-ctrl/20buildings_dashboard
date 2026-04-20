import { useState, useEffect } from 'preact/hooks';
import { contacts, buildingContactMap, stageHistory, emailReplies } from '../store/data';
import { updateBuildingNotes } from '../store/actions';
import { StageDropdown } from './StageDropdown';
import { AiModal } from './AiModal';
import { addToast } from './Toast';
import { formatDate } from '../lib/format';
import { supabase } from '../store/supabase';

const BLOCKED_PROPOSAL_STAGES = new Set(['FLAGGED — NO CONTACTS', 'FLAGGED — WRONG OWNER', 'FLAGGED — WRONG COMPANY', 'DECLINED']);

const PAIN_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' };

function SidebarField({ label, value, large }) {
  if (!value) return null;
  return (
    <div>
      <div class="bdeal-sidebar-label">{label}</div>
      <div class={`bdeal-sidebar-val${large ? ' large' : ''}`}>{value}</div>
    </div>
  );
}

export function BuildingDetailPanel({ building, onClose }) {
  const [notes, setNotes] = useState(building.notes || '');
  const [saving, setSaving] = useState(false);
  const [aiModal, setAiModal] = useState(null);
  const [activeTab, setActiveTab] = useState('notes');

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const canGenerate = !BLOCKED_PROPOSAL_STAGES.has(building.stage);
  const bcMap = buildingContactMap.value;
  const contactEmails = bcMap.get(building.building_name) || [];
  const linkedContacts = contacts.value.filter(c => contactEmails.includes(c.email));
  const history = stageHistory.value.filter(h => h.building_id === building.building_id).slice(0, 20);
  const replies = emailReplies.value.filter(r => contactEmails.includes(r.contact_email) && r.direction === 'INCOMING').slice(0, 20);

  const painColor = PAIN_COLORS[building.pain_point] || 'rgba(255,255,255,0.3)';

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

  const tabs = [
    { id: 'notes',    label: 'Notes' },
    { id: 'contacts', label: 'Contacts', count: linkedContacts.length },
    { id: 'replies',  label: 'Replies',  count: replies.length },
    { id: 'history',  label: 'History',  count: history.length },
  ];

  return (
    <div class="bdeal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="bdeal-modal">

        {/* Header */}
        <div class="bdeal-header">
          <div class="bdeal-header-left">
            <div class="bdeal-name">{building.building_name}</div>
            <div class="bdeal-sub">
              {[building.address, building.market].filter(Boolean).join(' · ')}
              {building.total_units ? ` · ${building.total_units} units` : ''}
            </div>
          </div>
          <StageDropdown building={building} />
          <button class="bdeal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Body: sidebar + main */}
        <div class="bdeal-body">

          {/* Left sidebar */}
          <div class="bdeal-sidebar">
            {building.pain_point && (
              <div>
                <div class="bdeal-sidebar-label">Pain Point</div>
                <span class="bdeal-pain-badge" style={{ background: painColor + '30', color: painColor, border: `1px solid ${painColor}60` }}>
                  {building.pain_point}
                </span>
              </div>
            )}
            <SidebarField
              label="Asking Rent"
              value={building.asking_rent_monthly
                ? `$${Number(building.asking_rent_monthly).toLocaleString()}/mo`
                : null}
            />
            {!building.asking_rent_monthly && (
              <div>
                <div class="bdeal-sidebar-label">Asking Rent</div>
                <div style={{ fontSize: '0.78rem', color: '#f59e0b' }}>Not on file</div>
              </div>
            )}
            <SidebarField label="Owner" value={building.owner_1} />
            <SidebarField label="Management" value={building.management_company} />
            <SidebarField label="Concessions" value={building.concessions} />
            <SidebarField label="Market" value={building.market} />
          </div>

          {/* Right main */}
          <div class="bdeal-main">

            {/* Action bar */}
            <div class="bdeal-actions">
              <button
                class="btn btn-p btn-sm"
                disabled={!canGenerate}
                style={{ opacity: canGenerate ? 1 : 0.45 }}
                title={canGenerate ? 'Generate Cloud9 revenue analysis one-pager' : `Not available for ${building.stage} buildings`}
                onClick={() => {
                  if (!canGenerate) return;
                  setAiModal({
                    type: 'proposal',
                    title: `${building.building_name} — Revenue Analysis`,
                    fetchFn: () =>
                      supabase.functions.invoke('generate-proposal', {
                        body: { building_id: building.building_id },
                      }).then(r => r.data),
                  });
                }}
              >
                Generate Proposal
              </button>
              {!canGenerate && (
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Not available for {building.stage}</span>
              )}
            </div>

            {/* Tabs */}
            <div class="bdeal-tabs">
              {tabs.map(t => (
                <button
                  key={t.id}
                  class={`bdeal-tab${activeTab === t.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                  {t.count != null && t.count > 0 && (
                    <span class="bdeal-tab-badge">{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div class="bdeal-content">

              {activeTab === 'notes' && (
                <div>
                  <textarea
                    class="notes-editor"
                    style={{ width: '100%', minHeight: '200px', boxSizing: 'border-box' }}
                    value={notes}
                    onInput={e => setNotes(e.target.value)}
                    placeholder="Add notes about this building..."
                  />
                  <button class="btn btn-p btn-sm" onClick={saveNotes} disabled={saving} style={{ marginTop: '10px' }}>
                    {saving ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              )}

              {activeTab === 'contacts' && (
                <div>
                  {linkedContacts.length === 0
                    ? <div class="no-data">No contacts linked to this building.</div>
                    : linkedContacts.map(c => (
                      <div key={c.contact_id} class="bdeal-contact">
                        <div class="bdeal-contact-name">{c.first_name} {c.last_name}</div>
                        <div class="bdeal-contact-meta">{c.job_title} &middot; {c.email}</div>
                        <div class="bdeal-contact-badges">
                          {c.tier && <span class={`badge bp${c.tier?.replace('P', '') || '3'}`}>{c.tier}</span>}
                          {c.hs_enrolled && <span class="hs-icon hs-enrolled" title="Enrolled in sequence">E</span>}
                          {c.hs_opened && <span class="hs-icon hs-opened" title="Opened email">O</span>}
                          {c.hs_replied && <span class="hs-icon hs-replied" title="Replied">R</span>}
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}

              {activeTab === 'replies' && (
                <div>
                  {replies.length === 0
                    ? <div class="no-data">No email replies recorded.</div>
                    : replies.map(r => (
                      <div key={r.id} class="bdeal-reply">
                        <div class="bdeal-reply-meta">{formatDate(r.received_at)} &middot; {r.contact_email}</div>
                        <div class="bdeal-reply-subject">{r.subject}</div>
                        <div class="bdeal-reply-body">{r.body_preview}</div>
                      </div>
                    ))
                  }
                </div>
              )}

              {activeTab === 'history' && (
                <div>
                  {history.length === 0
                    ? <div class="no-data">No stage changes recorded yet.</div>
                    : history.map(h => (
                      <div key={h.id} class="bdeal-field">
                        <div class="bdeal-field-label">{formatDate(h.created_at)} — {h.changed_by}</div>
                        <div class="bdeal-field-val">{h.old_stage || '—'} → <strong>{h.new_stage}</strong></div>
                      </div>
                    ))
                  }
                </div>
              )}

            </div>
          </div>
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
