import { useState } from 'preact/hooks';
import { contacts, buildings, signedCount, marketStats, buildingContactMap, MARKETS } from '../store/data';
import { AiModal } from '../components/AiModal';
import { addToast } from '../components/Toast';
import { supabase } from '../store/supabase';

const getBuildingNames = () => buildings.value.map(b => b.building_name).sort();

const EMAIL_FORMATS = [
  'Cold Email',
  'LinkedIn Message',
  'Sequence 1 — Intro',
  'Sequence 2 — Follow-Up',
  'Sequence 3 — Break-Up',
  'Setter Script',
];

const UNIT_TYPES = ['2BR', '3BR', 'Penthouse', 'Mix'];
const getMkts = () => MARKETS.value.filter(m => m !== 'All');

// Map email format to phase for the AI
function formatToPhase(format) {
  if (format === 'Sequence 2 — Follow-Up' || format === 'Sequence 3 — Break-Up') return 'follow-up';
  return 'cold';
}

// Find the best contact linked to a building (P1 > P2 > P3 > P4), optionally filtered by first name
function findBestContact(buildingName, preferFirstName = '') {
  const tierOrder = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const emailsForBuilding = buildingContactMap.value.get(buildingName) || [];
  const linked = contacts.value.filter(c => c.email && emailsForBuilding.includes(c.email));
  if (linked.length === 0) return null;
  // Prefer matching first name if provided
  if (preferFirstName.trim()) {
    const match = linked.find(c => c.first_name?.toLowerCase() === preferFirstName.trim().toLowerCase());
    if (match) return match;
  }
  // Otherwise return highest-tier contact
  return linked.sort((a, b) => (tierOrder[a.tier] ?? 4) - (tierOrder[b.tier] ?? 4))[0];
}

function MetricCards() {
  const totalReplied = contacts.value.filter(c => c.hs_replied).length;
  const warmBuildings = buildings.value.filter(b => b.stage === 'WARM').length;
  const signed = signedCount.value;
  const stats = marketStats.value;

  return (
    <div style={{ marginBottom: '24px' }}>
      <div class="metrics-row" style={{ marginBottom: '12px' }}>
        <div class="metric-card">
          <div class="mv mv-green">{totalReplied}</div>
          <div class="ml">HubSpot Replies</div>
        </div>
        <div class="metric-card">
          <div class="mv mv-purple">{warmBuildings}</div>
          <div class="ml">Warm Buildings</div>
        </div>
        <div class="metric-card">
          <div class="mv mv-blue">
            {signed}<span style={{ fontSize: '1rem', color: '#9ca3af' }}>/20</span>
          </div>
          <div class="ml">Buildings Signed</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {getMkts().map(m => (
          <div key={m} class="gc" style={{ padding: '10px 16px', flex: '1', minWidth: '140px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#4f7cff', marginBottom: '6px' }}>{m}</div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
              <span style={{ color: '#059669', fontWeight: 700 }}>{stats[m]?.replied || 0}</span> replied ·{' '}
              {stats[m]?.warm || 0} warm ·{' '}
              {stats[m]?.signed || 0} signed
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalPanel() {
  const bldgList = getBuildingNames();
  const [form, setForm] = useState({
    building: '', contactName: '', contactTitle: '',
    market: getMkts()[0] || '', units2br: '', rent2br: '', units3br: '', rent3br: '',
    concessions: '', totalUnits: '', yearBuilt: '', occupancy: '',
  });
  const [aiModal, setAiModal] = useState(null);

  const gap2br = form.units2br && form.rent2br
    ? (parseFloat(form.units2br) * parseFloat(form.rent2br) * 12 * 0.08)
      .toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;
  const gap3br = form.units3br && form.rent3br
    ? (parseFloat(form.units3br) * parseFloat(form.rent3br) * 12 * 0.08)
      .toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;
  const totalGap = (form.units2br && form.rent2br && form.units3br && form.rent3br)
    ? ((parseFloat(form.units2br) * parseFloat(form.rent2br) + parseFloat(form.units3br) * parseFloat(form.rent3br)) * 12 * 0.08)
      .toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function handleGenerate() {
    if (!form.building) {
      addToast('Select a building first', 'err');
      return;
    }
    const building = buildings.value.find(b => b.building_name === form.building);
    if (!building) {
      addToast(`Building "${form.building}" not found in pipeline`, 'err');
      return;
    }
    setAiModal({
      type: 'proposal',
      title: `${form.building} — Revenue Analysis`,
      fetchFn: () =>
        supabase.functions.invoke('generate-proposal', {
          body: { building_id: building.building_id },
        }).then(r => r.data),
    });
  }

  const canGenerate = !!form.building;

  return (
    <div class="outreach-panel">
      <div class="sh" style={{ marginTop: 0 }}>Generate Proposal</div>
      <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '-4px', marginBottom: '16px' }}>
        AI-generated Cloud9 revenue analysis one-pager for a building. Select the building and click Generate.
      </p>
      <div class="outreach-grid">
        <div class="mf">
          <label>Building Name</label>
          <input
            list="prop-bldg-list"
            value={form.building}
            onInput={e => set('building', e.target.value)}
            onFocus={e => { if (!form.building) set('building', ''); }}
            placeholder="Click or start typing to search buildings..."
          />
          <datalist id="prop-bldg-list">{bldgList.map(n => <option key={n} value={n} />)}</datalist>
        </div>
        <div class="mf">
          <label>Market</label>
          <select value={form.market} onChange={e => set('market', e.target.value)}>
            {getMkts().map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div class="mf">
          <label>Contact Name <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
          <input value={form.contactName} onInput={e => set('contactName', e.target.value)} placeholder="e.g. John Smith" />
        </div>
        <div class="mf">
          <label>Contact Title <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
          <input value={form.contactTitle} onInput={e => set('contactTitle', e.target.value)} placeholder="e.g. Property Manager" />
        </div>
        <div class="mf">
          <label>2BR Units <span style={{ fontWeight: 400, color: '#9ca3af' }}>(for gap preview)</span></label>
          <input type="number" min="0" value={form.units2br} onInput={e => set('units2br', e.target.value)} placeholder="e.g. 40" />
        </div>
        <div class="mf">
          <label>2BR Rent/mo ($)</label>
          <input type="number" min="0" value={form.rent2br} onInput={e => set('rent2br', e.target.value)} placeholder="e.g. 2800" />
        </div>
        <div class="mf">
          <label>3BR Units</label>
          <input type="number" min="0" value={form.units3br} onInput={e => set('units3br', e.target.value)} placeholder="e.g. 20" />
        </div>
        <div class="mf">
          <label>3BR Rent/mo ($)</label>
          <input type="number" min="0" value={form.rent3br} onInput={e => set('rent3br', e.target.value)} placeholder="e.g. 3400" />
        </div>
        <div class="mf">
          <label>Total Units</label>
          <input type="number" min="0" value={form.totalUnits} onInput={e => set('totalUnits', e.target.value)} placeholder="e.g. 80" />
        </div>
        <div class="mf">
          <label>Year Built</label>
          <input type="number" value={form.yearBuilt} onInput={e => set('yearBuilt', e.target.value)} placeholder="e.g. 2018" />
        </div>
        <div class="mf">
          <label>Occupancy %</label>
          <input type="number" min="0" max="100" value={form.occupancy} onInput={e => set('occupancy', e.target.value)} placeholder="e.g. 94" />
        </div>
        <div class="mf">
          <label>Concessions</label>
          <input value={form.concessions} onInput={e => set('concessions', e.target.value)} placeholder="e.g. 1 month free" />
        </div>
      </div>

      {(gap2br || gap3br) && (
        <div class="gap-preview">
          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '8px', color: '#374151' }}>Annual Revenue Gap Preview (8%)</div>
          {gap2br && <div class="gap-row"><span>2BR gap:</span><strong>{gap2br}</strong></div>}
          {gap3br && <div class="gap-row"><span>3BR gap:</span><strong>{gap3br}</strong></div>}
          {totalGap && (
            <div class="gap-row" style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '6px', marginTop: '4px' }}>
              <span>Total annual gap:</span><strong style={{ color: '#4f7cff' }}>{totalGap}</strong>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          class="btn btn-p"
          onClick={handleGenerate}
          disabled={!canGenerate}
          style={{ opacity: canGenerate ? 1 : 0.5 }}
          title={canGenerate ? 'Generate Cloud9 revenue analysis one-pager' : 'Select a building first'}
        >
          Generate Proposal
        </button>
        {!canGenerate && (
          <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Select a building to enable</span>
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

function EmailPanel() {
  const bldgList = getBuildingNames();
  const [form, setForm] = useState({
    building: '', contactFirst: '', unitType: '2BR', market: getMkts()[0] || '',
    format: 'Cold Email', units: '', rent: '',
  });
  const [aiModal, setAiModal] = useState(null);

  const annualGap = form.units && form.rent
    ? (parseFloat(form.units) * parseFloat(form.rent) * 12 * 0.08)
      .toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function handleDraft() {
    if (!form.building) {
      addToast('Select a building first', 'err');
      return;
    }
    const contact = findBestContact(form.building, form.contactFirst);
    if (!contact) {
      addToast(`No contacts linked to "${form.building}". Add contacts in the Contacts tab first.`, 'err');
      return;
    }
    const phase = formatToPhase(form.format);
    setAiModal({
      type: 'email',
      title: `Draft ${form.format} — ${contact.first_name} ${contact.last_name}`,
      fetchFn: () =>
        supabase.functions.invoke('generate-email', {
          body: {
            contact_id: contact.contact_id,
            phase,
            context: `Email format: ${form.format}. Unit type focus: ${form.unitType}.`,
          },
        }).then(r => r.data),
    });
  }

  const canDraft = !!form.building;

  return (
    <div class="outreach-panel">
      <div class="sh" style={{ marginTop: 0 }}>Generate Outreach Email</div>
      <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '-4px', marginBottom: '16px' }}>
        AI-generated email using Cloud9's ICP copy framework. Selects the best contact linked to the building.
      </p>
      <div class="outreach-grid">
        <div class="mf">
          <label>Building Name</label>
          <input
            list="email-bldg-list"
            value={form.building}
            onInput={e => set('building', e.target.value)}
            onFocus={e => { if (!form.building) set('building', ''); }}
            placeholder="Click or start typing to search buildings..."
          />
          <datalist id="email-bldg-list">{bldgList.map(n => <option key={n} value={n} />)}</datalist>
        </div>
        <div class="mf">
          <label>Market</label>
          <select value={form.market} onChange={e => set('market', e.target.value)}>
            {getMkts().map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div class="mf">
          <label>Contact First Name <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional — helps find right contact)</span></label>
          <input value={form.contactFirst} onInput={e => set('contactFirst', e.target.value)} placeholder="e.g. Sarah" />
        </div>
        <div class="mf">
          <label>Unit Type</label>
          <select value={form.unitType} onChange={e => set('unitType', e.target.value)}>
            {UNIT_TYPES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div class="mf" style={{ gridColumn: '1 / -1' }}>
          <label>Email Format</label>
          <select value={form.format} onChange={e => set('format', e.target.value)}>
            {EMAIL_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div class="mf">
          <label>Units <span style={{ fontWeight: 400, color: '#9ca3af' }}>(for gap preview)</span></label>
          <input type="number" min="0" value={form.units} onInput={e => set('units', e.target.value)} placeholder="e.g. 40" />
        </div>
        <div class="mf">
          <label>Avg Rent/mo ($)</label>
          <input type="number" min="0" value={form.rent} onInput={e => set('rent', e.target.value)} placeholder="e.g. 2800" />
        </div>
      </div>

      {annualGap && (
        <div class="gap-preview">
          <div class="gap-row">
            <span>Estimated annual gap (8%):</span>
            <strong style={{ color: '#4f7cff' }}>{annualGap}</strong>
          </div>
        </div>
      )}

      <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          class="btn btn-p"
          onClick={handleDraft}
          disabled={!canDraft}
          style={{ opacity: canDraft ? 1 : 0.5 }}
          title={canDraft ? `Draft ${form.format}` : 'Select a building first'}
        >
          Draft Email
        </button>
        {!canDraft && (
          <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Select a building to enable</span>
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

export function Outreach() {
  return (
    <div class="page">
      <MetricCards />
      <div class="outreach-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <ProposalPanel />
        <EmailPanel />
      </div>
    </div>
  );
}
