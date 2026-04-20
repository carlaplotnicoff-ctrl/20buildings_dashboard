import { useState, useEffect, useRef } from 'preact/hooks';
import { filteredBuildings, buildings, contacts, buildingContactMap, stageHistory, emailReplies, touchLog, STAGES, searchQuery, marketFilter } from '../store/data';
import { changeStage, updateBuildingNotes } from '../store/actions';
import { MarketChips } from '../components/MarketChips';
import { StageBadge } from '../components/StageBadge';
import { addToast } from '../components/Toast';
import { AiModal } from '../components/AiModal';
import { formatDate, timeAgo } from '../lib/format';
import { supabase } from '../store/supabase';

const BLOCKED_PROPOSAL_STAGES = new Set(['FLAGGED — NO CONTACTS', 'FLAGGED — WRONG OWNER', 'DECLINED']);

function StageDropdown({ building }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  async function handleChange(newStage) {
    setOpen(false);
    try {
      await changeStage(building.building_id, newStage);
      addToast(`${building.building_name}: ${building.stage || 'NEW'} → ${newStage}`, 'ok');
    } catch (e) {
      addToast(`Failed to change stage: ${e.message}`, 'err');
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <StageBadge stage={building.stage} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50,
          background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.10)',
          borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: '4px', minWidth: '200px', backdropFilter: 'blur(20px)',
        }}>
          {STAGES.map(s => (
            <div key={s} onClick={() => handleChange(s)} style={{
              padding: '6px 12px', cursor: 'pointer', borderRadius: '6px',
              fontSize: '0.78rem', fontWeight: building.stage === s ? 700 : 400,
              background: building.stage === s ? 'rgba(79,124,255,0.08)' : 'transparent',
            }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(79,124,255,0.06)'}
              onMouseOut={e => e.currentTarget.style.background = building.stage === s ? 'rgba(79,124,255,0.08)' : 'transparent'}
            >
              <StageBadge stage={s} /> {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildingDetailPanel({ building, onClose }) {
  const [notes, setNotes] = useState(building.notes || '');
  const [saving, setSaving] = useState(false);
  const [aiModal, setAiModal] = useState(null); // null | { type, title, fetchFn }

  // Escape closes panel
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const canGenerate = !BLOCKED_PROPOSAL_STAGES.has(building.stage);
  const bcMap = buildingContactMap.value;
  const contactEmails = bcMap.get(building.building_name) || [];
  const linkedContacts = contacts.value.filter(c => contactEmails.includes(c.email));
  const history = stageHistory.value.filter(h => h.building_id === building.building_id).slice(0, 10);
  const replies = emailReplies.value.filter(r => {
    const bContacts = contactEmails;
    return bContacts.includes(r.contact_email) && r.direction === 'INCOMING';
  }).slice(0, 10);
  const proposals = touchLog.value
    .filter(t => t.building_id === building.building_id && t.channel === 'proposal')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

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

  return (
    <div class="dpanel active">
      <button class="dp-close" onClick={onClose}>&times;</button>
      <div class="dp-name">{building.building_name}</div>
      <div class="dp-title">{building.address}</div>

      <div class="dp-section">
        <h4>Building Info</h4>
        <div class="dp-row"><span class="lbl">Market</span><span class="val">{building.market}</span></div>
        <div class="dp-row"><span class="lbl">Units</span><span class="val">{building.total_units || '—'}</span></div>
        <div class="dp-row"><span class="lbl">Owner</span><span class="val">{building.owner_1 || '—'}</span></div>
        <div class="dp-row"><span class="lbl">Management</span><span class="val">{building.management_company || '—'}</span></div>
        <div class="dp-row"><span class="lbl">Pain Point</span><span class="val">{building.pain_point || '—'}</span></div>
        <div class="dp-row"><span class="lbl">Asking Rent</span><span class="val">{building.asking_rent_monthly ? `$${Number(building.asking_rent_monthly).toLocaleString()}/mo` : <span style={{ color: '#f59e0b', fontSize: '0.72rem' }}>Not on file — proposal uses estimate</span>}</span></div>
        <div class="dp-row"><span class="lbl">Concessions</span><span class="val">{building.concessions || '—'}</span></div>
        <div class="dp-row"><span class="lbl">Stage</span><span class="val"><StageDropdown building={building} /></span></div>
      </div>

      <div class="dp-section">
        <h4>Contacts ({linkedContacts.length})</h4>
        {linkedContacts.length === 0 && <div class="no-data">No contacts linked</div>}
        {linkedContacts.map(c => (
          <div key={c.contact_id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: '0.82rem' }}>
            <div style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</div>
            <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>{c.job_title} &middot; {c.email}</div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
              {c.tier && <span class={`badge bp${c.tier?.replace('P', '') || '3'}`}>{c.tier}</span>}
              {c.hs_enrolled && <span class="hs-icon hs-enrolled" title="Enrolled">E</span>}
              {c.hs_opened && <span class="hs-icon hs-opened" title="Opened">O</span>}
              {c.hs_replied && <span class="hs-icon hs-replied" title="Replied">R</span>}
            </div>
          </div>
        ))}
      </div>

      {replies.length > 0 && (
        <div class="dp-section">
          <h4>Email Replies</h4>
          {replies.map(r => (
            <div key={r.id} style={{ background: 'rgba(249,250,251,0.9)', borderRadius: '8px', padding: '10px', marginBottom: '6px', fontSize: '0.78rem' }}>
              <div style={{ color: '#9ca3af', fontSize: '0.68rem' }}>{formatDate(r.received_at)} &middot; {r.contact_email}</div>
              <div style={{ fontWeight: 600, marginTop: '3px' }}>{r.subject}</div>
              <div style={{ color: '#4b5563', marginTop: '3px' }}>{r.body_preview}</div>
            </div>
          ))}
        </div>
      )}

      <div class="dp-section">
        <h4>Notes</h4>
        <textarea class="notes-editor" value={notes} onInput={e => setNotes(e.target.value)} placeholder="Add notes..." />
        <button class="btn btn-p btn-sm" onClick={saveNotes} disabled={saving} style={{ marginTop: '8px' }}>
          {saving ? 'Saving...' : 'Save Notes'}
        </button>
      </div>

      <div class="dp-section">
        <h4>Pilot Proposals ({proposals.length})</h4>
        {proposals.length === 0
          ? <div class="no-data">No pilot proposals sent yet</div>
          : proposals.map(p => (
            <div key={p.id} style={{ fontSize: '0.75rem', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <div>
                <span style={{ color: '#9ca3af' }}>{formatDate(p.created_at)}</span>
                {p.outcome === 'sent_superseded' && <span style={{ marginLeft: '6px', color: '#f59e0b', fontSize: '0.7rem' }}>(superseded)</span>}
              </div>
              <div style={{ color: '#4a5568', marginTop: '2px' }}>{p.notes}</div>
              {p.file_path && (
                <div style={{ marginTop: '2px', fontSize: '0.7rem', color: '#4f7cff', wordBreak: 'break-all' }}>
                  {p.file_path.split('/').pop()}
                </div>
              )}
            </div>
          ))
        }
      </div>

      <div class="dp-section">
        <h4>Stage History</h4>
        {history.length === 0
          ? <div class="no-data">No stage changes recorded yet</div>
          : history.map(h => (
            <div key={h.id} style={{ fontSize: '0.75rem', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <span style={{ color: '#9ca3af' }}>{formatDate(h.created_at)}</span>: {h.old_stage || '—'} → <strong>{h.new_stage}</strong>
              <span style={{ color: '#9ca3af' }}> — {h.changed_by}</span>
            </div>
          ))
        }
      </div>

      <div style={{ marginTop: '18px' }}>
        <button
          class="btn btn-p"
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
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: '8px' }}>
            Not available for {building.stage}
          </span>
        )}
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

const PAIN_FILTERS = ['All', 'High', 'Medium', 'Low'];

export function Buildings() {
  const [selected, setSelected] = useState(null);
  const [stageFilter, setStageFilter] = useState('All');
  const [painFilter, setPainFilter] = useState('All');
  const fb = filteredBuildings.value;
  const displayed = fb
    .filter(b => stageFilter === 'All' || (b.stage || 'NEW') === stageFilter)
    .filter(b => painFilter === 'All' || b.pain_point === painFilter);
  const bcMap = buildingContactMap.value;

  useEffect(() => {
    function handleFilter(e) {
      if (e.detail?.tab === 'buildings' && e.detail?.stage) {
        setStageFilter(e.detail.stage);
      }
    }
    window.addEventListener('spire:filter', handleFilter);
    return () => window.removeEventListener('spire:filter', handleFilter);
  }, []);

  return (
    <div class="page">
      <MarketChips />
      <div class="controls">
        <input
          type="text"
          placeholder="Search buildings, owners, addresses..."
          value={searchQuery.value}
          onInput={e => searchQuery.value = e.target.value}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="All">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div class="chip-row">
        {PAIN_FILTERS.map(p => (
          <button
            key={p}
            class={`chip ${painFilter === p ? 'active' : ''}`}
            onClick={() => setPainFilter(p)}
          >
            {p === 'All' ? 'All Pain Levels' : `${p} Pain`}
          </button>
        ))}
      </div>

      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '12px' }}>
        Showing {displayed.length} of {buildings.value.length} buildings
      </div>

      <div class="tscroll gc" style={{ maxHeight: '70vh' }}>
        <table>
          <thead>
            <tr>
              <th>Building</th>
              <th>Market</th>
              <th>Units</th>
              <th>Owner</th>
              <th>Pain</th>
              <th>Stage</th>
              <th>Contacts</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div class="empty-state">
                    <strong>No buildings match your filters</strong>
                    Try adjusting the stage, pain level, or search query.
                  </div>
                </td>
              </tr>
            ) : displayed.map(b => (
              <tr key={b.building_id} onClick={() => setSelected(b)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600 }}>{b.building_name}</td>
                <td>{b.market}</td>
                <td>{b.total_units || '—'}</td>
                <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.owner_1 || '—'}</td>
                <td>{b.pain_point || '—'}</td>
                <td><StageDropdown building={b} /></td>
                <td>{bcMap.get(b.building_name)?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <BuildingDetailPanel
          building={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
