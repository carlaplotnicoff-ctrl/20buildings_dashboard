import { useState, useEffect, useRef } from 'preact/hooks';
import { filteredContacts, contacts, contactBuildingMap, emailReplies, touchLog, searchQuery, activeTab, marketFilter, REPLY_CATEGORIES, REPLY_CATEGORY_LABELS, REPLY_CATEGORY_COLORS, replyCategoryFilter } from '../store/data';
import { logTouch } from '../store/actions';
import { MarketChips } from '../components/MarketChips';
import { addToast } from '../components/Toast';
import { AiModal } from '../components/AiModal';
import { formatDate, isOverdue, isToday } from '../lib/format';
import { supabase } from '../store/supabase';

const BLOCKED_EMAIL_STATUSES = new Set(['Hard No', 'Unsubscribed', 'Wrong Contact']);

function getPhase(contact) {
  if (contact.hs_replied) return 'warm';
  if (contact.hs_opened || contact.hs_enrolled) return 'follow-up';
  return 'cold';
}

// ===== TOUCH MODAL =====
function TouchModal({ contact, onClose }) {
  const [channel, setChannel] = useState('Email');
  const [outcome, setOutcome] = useState('Attempting');
  const [notes, setNotes] = useState('');
  const [objections, setObjections] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [nextStepDate, setNextStepDate] = useState('');
  const [loggedBy, setLoggedBy] = useState('Carla');
  const [saving, setSaving] = useState(false);

  // Escape closes modal
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await logTouch({ contactId: contact.contact_id, buildingId: null, channel, outcome, notes, objections, nextStep, nextStepDate: nextStepDate || null, loggedBy });
      addToast(`Touch logged for ${contact.first_name} ${contact.last_name}`, 'ok');
      onClose();
    } catch (e) {
      addToast(`Failed: ${e.message}`, 'err');
    }
    setSaving(false);
  }

  return (
    <div class="modal-overlay active" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal">
        <h2>Log Touch — {contact.first_name} {contact.last_name}</h2>
        <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '14px' }}>
          {contact.job_title} · {contact.company}
        </div>
        <div class="mf">
          <label>Logged By</label>
          <select value={loggedBy} onChange={e => setLoggedBy(e.target.value)}>
            <option>Carla</option><option>Marcus</option><option>Maria</option>
          </select>
        </div>
        <div class="mf">
          <label>Channel</label>
          <select value={channel} onChange={e => setChannel(e.target.value)}>
            <option>Email</option><option>Phone</option><option>LinkedIn</option><option>In Person</option><option>Other</option>
          </select>
        </div>
        <div class="mf">
          <label>Outcome</label>
          <select value={outcome} onChange={e => setOutcome(e.target.value)}>
            <option>Attempting</option><option>Reached – Warm</option><option>Reached – Cold</option>
            <option>Proposal Sent</option><option>Gatekeeper Only</option><option>Wrong Contact</option>
            <option>Hard No</option><option>Unsubscribed</option>
          </select>
        </div>
        <div class="mf"><label>Objections</label><input type="text" value={objections} onInput={e => setObjections(e.target.value)} placeholder="Any objections raised..." /></div>
        <div class="mf"><label>Notes</label><textarea value={notes} onInput={e => setNotes(e.target.value)} placeholder="What happened..." /></div>
        <div class="mf"><label>Next Step</label><input type="text" value={nextStep} onInput={e => setNextStep(e.target.value)} placeholder="Follow up, send proposal..." /></div>
        <div class="mf"><label>Next Step Date</label><input type="date" value={nextStepDate} onInput={e => setNextStepDate(e.target.value)} /></div>
        <div class="mactions">
          <button class="btn btn-s" onClick={onClose}>Cancel</button>
          <button class="btn btn-p" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Log Touch'}</button>
        </div>
      </div>
    </div>
  );
}

// ===== CONTACT DETAIL PANEL =====
function ContactDetailPanel({ contact, onClose, onLogTouch }) {
  const cbMap = contactBuildingMap.value;
  const buildingNames = cbMap.get(contact.email) || [];
  const replies = emailReplies.value.filter(r => r.contact_email === contact.email && r.direction === 'INCOMING');
  const history = touchLog.value.filter(t => t.contact_id === contact.contact_id).slice(0, 10);
  const [aiModal, setAiModal] = useState(null);

  const canDraft = !BLOCKED_EMAIL_STATUSES.has(contact.contact_status);

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <div class="panel-overlay active" onClick={onClose} />
      <div class="dpanel active">
        <button class="dp-close" onClick={onClose}>&times;</button>

        <div class="dp-name">{contact.first_name} {contact.last_name}</div>
        <div class="dp-title">{contact.job_title} · {contact.company}</div>

        <div class="dp-section">
          <h4>Contact Info</h4>
          <div class="dp-row"><span class="lbl">Email</span><span class="val" style={{ fontSize: '0.78rem' }}>{contact.email || '—'}</span></div>
          <div class="dp-row"><span class="lbl">Phone</span><span class="val">{contact.phone || '—'}</span></div>
          <div class="dp-row"><span class="lbl">Market</span><span class="val">{contact.market}</span></div>
          <div class="dp-row"><span class="lbl">Tier</span><span class="val">{contact.tier ? <span class={`badge bp${contact.tier.replace('P','')}`}>{contact.tier}</span> : '—'}</span></div>
          {contact.linkedin && (
            <div class="dp-row"><span class="lbl">LinkedIn</span><span class="val"><a href={contact.linkedin} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>View Profile</a></span></div>
          )}
        </div>

        <div class="dp-section">
          <h4>HubSpot Engagement</h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span class={`hs-icon ${contact.hs_enrolled ? 'hs-enrolled' : ''}`} style={{ opacity: contact.hs_enrolled ? 1 : 0.3 }} title="Enrolled in sequence">E</span>
            <span class={`hs-icon ${contact.hs_opened ? 'hs-opened' : ''}`} style={{ opacity: contact.hs_opened ? 1 : 0.3 }} title="Opened email">O</span>
            <span class={`hs-icon ${contact.hs_replied ? 'hs-replied' : ''}`} style={{ opacity: contact.hs_replied ? 1 : 0.3 }} title="Replied to email">R</span>
            {contact.hs_opted_out && <span style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 600 }}>Opted Out</span>}
          </div>
          {contact.hs_last_replied && (
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '6px' }}>
              Last reply: {formatDate(contact.hs_last_replied)}
            </div>
          )}
        </div>

        <div class="dp-section">
          <h4>Linked Buildings ({buildingNames.length})</h4>
          {buildingNames.length === 0
            ? <div class="no-data">No buildings linked to this contact</div>
            : buildingNames.map(n => (
              <div
                key={n}
                onClick={() => { activeTab.value = 'buildings'; searchQuery.value = n; onClose(); }}
                style={{ fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', color: 'var(--accent)', fontWeight: 500, cursor: 'pointer' }}
                title="Click to open in Buildings tab"
              >{n} →</div>
            ))
          }
        </div>

        {replies.length > 0 ? (
          <div class="dp-section">
            <h4>Email Replies ({replies.length})</h4>
            {replies.map(r => (
              <div key={r.id || r.hs_engagement_id} style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px', padding: '10px', marginBottom: '8px', fontSize: '0.78rem' }}>
                <div style={{ color: '#9ca3af', fontSize: '0.68rem', marginBottom: '3px' }}>
                  {formatDate(r.received_at)} · {r.contact_email}
                </div>
                {r.subject && <div style={{ fontWeight: 600, marginBottom: '4px' }}>{r.subject}</div>}
                <div style={{ color: '#374151', lineHeight: 1.5 }}>{r.body_preview || '(no preview available)'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div class="dp-section">
            <h4>Email Replies</h4>
            <div class="empty-state" style={{ padding: '12px 0', textAlign: 'left' }}>
              {contact.hs_replied
                ? <span>Reply data is available — run <strong>HubSpot sync</strong> (scripts/hubspot-sync.mjs) to load it.</span>
                : <span>No replies on record for this contact.</span>
              }
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div class="dp-section">
            <h4>Touch History ({history.length})</h4>
            {history.map(t => (
              <div key={t.id} style={{ fontSize: '0.75rem', padding: '5px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <span style={{ color: '#9ca3af' }}>{formatDate(t.created_at)}</span>
                {' '}<strong>{t.channel}</strong> — {t.outcome}
                {t.notes && <div style={{ color: '#6b7280', marginTop: '2px' }}>{t.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {contact.next_step && (
          <div class="dp-section">
            <h4>Next Step</h4>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-1)' }}>{contact.next_step}</div>
            {contact.next_step_date && (
              <div class={`fu-date ${isOverdue(contact.next_step_date) ? 'fu-overdue' : isToday(contact.next_step_date) ? 'fu-today' : ''}`} style={{ marginTop: '6px', display: 'inline-block' }}>
                {formatDate(contact.next_step_date)}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
          <button class="btn btn-p btn-sm" onClick={() => onLogTouch(contact)}>Log Touch</button>
          <button
            class="btn btn-s btn-sm"
            disabled={!canDraft}
            style={{ opacity: canDraft ? 1 : 0.45 }}
            title={canDraft ? `Draft ${getPhase(contact)} email` : `Not available for ${contact.contact_status} contacts`}
            onClick={() => {
              if (!canDraft) return;
              setAiModal({
                type: 'email',
                title: `Draft Email — ${contact.first_name} ${contact.last_name}`,
                fetchFn: () =>
                  supabase.functions.invoke('generate-email', {
                    body: { contact_id: contact.contact_id, phase: getPhase(contact) },
                  }).then(r => r.data),
              });
            }}
          >
            Draft Email
          </button>
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
    </>
  );
}

// ===== MAIN CONTACTS VIEW =====
const ENGAGEMENT_FILTERS = ['All', 'Replied', 'Opened', 'Enrolled', 'Overdue'];

export function Contacts() {
  const [touchContact, setTouchContact] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [tierFilter, setTierFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [engFilter, setEngFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(200);

  // Listen for navigation events from Overview action cards
  useEffect(() => {
    const handler = e => {
      if (e.detail?.tab === 'contacts' && e.detail?.filter) {
        setEngFilter(e.detail.filter);
        setVisibleCount(200);
      }
    };
    window.addEventListener('spire:filter', handler);
    return () => window.removeEventListener('spire:filter', handler);
  }, []);

  // Reset visible count when any filter changes
  useEffect(() => { setVisibleCount(200); }, [tierFilter, statusFilter, engFilter, searchQuery.value, replyCategoryFilter.value]);

  let fc = filteredContacts.value;

  if (tierFilter !== 'All') fc = fc.filter(c => c.tier === tierFilter);
  if (statusFilter !== 'All') fc = fc.filter(c => c.contact_status === statusFilter);
  if (engFilter === 'Replied')  fc = fc.filter(c => c.hs_replied);
  if (engFilter === 'Opened')   fc = fc.filter(c => c.hs_opened);
  if (engFilter === 'Enrolled') fc = fc.filter(c => c.hs_enrolled);
  if (engFilter === 'Overdue')  fc = fc.filter(c => c.next_step_date && isOverdue(c.next_step_date));
  if (replyCategoryFilter.value !== 'All') fc = fc.filter(c => c.latest_reply_category === replyCategoryFilter.value);

  // Sort by latest_reply_date DESC within each category for the reply-category view
  if (replyCategoryFilter.value !== 'All') {
    fc = [...fc].sort((a, b) => (b.latest_reply_date || '').localeCompare(a.latest_reply_date || ''));
  }

  const shown = fc.slice(0, visibleCount);

  return (
    <div class="page">
      <MarketChips />

      {/* Engagement quick-filter chips */}
      <div class="market-chips" style={{ marginBottom: '8px' }}>
        <span class="chip-label">Engagement</span>
        {ENGAGEMENT_FILTERS.map(f => (
          <button key={f} class={`chip ${engFilter === f ? 'active' : ''}`} onClick={() => setEngFilter(f)}>{f}</button>
        ))}
      </div>

      {/* Reply-category filter chips */}
      <div class="market-chips" style={{ marginBottom: '8px' }}>
        <span class="chip-label">Reply</span>
        <button class={`chip ${replyCategoryFilter.value === 'All' ? 'active' : ''}`} onClick={() => replyCategoryFilter.value = 'All'}>All</button>
        {REPLY_CATEGORIES.map(cat => (
          <button
            key={cat}
            class={`chip ${replyCategoryFilter.value === cat ? 'active' : ''}`}
            onClick={() => replyCategoryFilter.value = cat}
            title={REPLY_CATEGORY_LABELS[cat]}
          >{REPLY_CATEGORY_LABELS[cat]}</button>
        ))}
      </div>

      {/* Tier + Status dropdowns */}
      <div class="controls">
        <input
          type="text"
          placeholder="Search name, email, company..."
          value={searchQuery.value}
          onInput={e => searchQuery.value = e.target.value}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="All">All Tiers</option>
          <option value="P1">P1 — Asset Manager (Decision-Maker)</option>
          <option value="P2">P2 — C-Suite (CEO/COO/CFO)</option>
          <option value="P3">P3 — Keyword Match</option>
          <option value="P4">P4 — Extended Management</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          <option>Not Contacted</option>
          <option>Attempting</option>
          <option>Reached – Warm</option>
          <option>Reached – Cold</option>
          <option>Proposal Sent</option>
          <option>Gatekeeper Only</option>
          <option>Wrong Contact</option>
          <option>Hard No</option>
        </select>
      </div>

      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '12px' }}>
        Showing {shown.length} of {fc.length} contacts ({contacts.value.length.toLocaleString()} total)
        {engFilter !== 'All' && <span style={{ marginLeft: '8px', color: '#4f7cff', fontWeight: 600 }}>· {engFilter} filter active</span>}
      </div>

      {fc.length === 0 ? (
        <div class="empty-state">
          <strong>No contacts match this filter</strong>
          {engFilter === 'Replied' && 'Run the HubSpot sync (scripts/hubspot-sync.mjs) to load reply data, or check that contacts.hs_replied is populated.'}
          {engFilter === 'Overdue' && 'No overdue follow-ups — you\'re all caught up!'}
          {engFilter !== 'Replied' && engFilter !== 'Overdue' && 'Try adjusting your search or filter settings.'}
        </div>
      ) : (
        <div class="tscroll gc" style={{ maxHeight: '70vh' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Title</th>
                <th>Tier</th>
                <th>Market</th>
                <th>HubSpot</th>
                <th>Reply</th>
                <th>Follow-up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(c => {
                const overdue = isOverdue(c.next_step_date);
                const today = isToday(c.next_step_date);
                return (
                  <tr
                    key={c.contact_id}
                    onClick={() => setSelectedContact(c)}
                    style={{ cursor: 'pointer' }}
                    title="Click to view details and replies"
                  >
                    <td style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                    <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || '—'}</td>
                    <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.72rem', color: '#6b7280' }}>{c.job_title || '—'}</td>
                    <td>{c.tier && <span class={`badge bp${c.tier?.replace('P','') || '3'}`}>{c.tier}</span>}</td>
                    <td style={{ fontSize: '0.72rem' }}>{c.market}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {c.hs_enrolled && <span class="hs-icon hs-enrolled" title="Enrolled">E</span>}
                        {c.hs_opened && <span class="hs-icon hs-opened" title="Opened">O</span>}
                        {c.hs_replied && <span class="hs-icon hs-replied" title="Replied">R</span>}
                      </div>
                    </td>
                    <td>
                      {c.latest_reply_category && (
                        <span
                          class={`badge ${REPLY_CATEGORY_COLORS[c.latest_reply_category] || ''}`}
                          title={c.next_action || REPLY_CATEGORY_LABELS[c.latest_reply_category]}
                        >
                          {REPLY_CATEGORY_LABELS[c.latest_reply_category]?.split(' ')[0] || '•'}
                        </span>
                      )}
                      {c.proposal_count > 0 && (
                        <span class="badge" title={`${c.proposal_count} pilot proposal(s) sent`} style={{ marginLeft: '4px' }}>📄{c.proposal_count}</span>
                      )}
                    </td>
                    <td>
                      {c.next_step_date && (
                        <span class={`fu-date ${overdue ? 'fu-overdue' : today ? 'fu-today' : ''}`}>
                          {formatDate(c.next_step_date)}
                        </span>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button class="btn btn-s btn-sm" onClick={() => setTouchContact(c)}>Log Touch</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibleCount < fc.length && (
        <div style={{ textAlign: 'center', padding: '12px' }}>
          <button class="btn btn-s" onClick={() => setVisibleCount(v => v + 200)}>
            Load more ({fc.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {touchContact && <TouchModal contact={touchContact} onClose={() => setTouchContact(null)} />}
      {selectedContact && (
        <ContactDetailPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onLogTouch={c => { setSelectedContact(null); setTouchContact(c); }}
        />
      )}
    </div>
  );
}
