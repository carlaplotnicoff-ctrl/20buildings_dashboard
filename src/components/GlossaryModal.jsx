import { useEffect } from 'preact/hooks';

const STAGES = [
  { name: 'NO_CONTACTS',          color: '#ef4444', desc: 'Building is in our pipeline — no contacts found yet. Needs Apollo research.' },
  { name: 'CONTACTS_IMPORTED',    color: '#93c5fd', desc: 'Contacts pulled from Apollo and ready to outreach.' },
  { name: 'IN_SEQUENCE',          color: '#579bfc', desc: 'Contacts are enrolled in a HubSpot email sequence.' },
  { name: 'LINKEDIN_CONTACT',     color: '#0a66c2', desc: 'Outreach happening via LinkedIn — with or without email contacts.' },
  { name: 'NO_DM_RESPONSE',       color: '#f59e0b', desc: 'Sequence or LinkedIn sent — no reply from the decision-maker yet.' },
  { name: 'SECOND_PUSH',          color: '#f97316', desc: 'Second wave of outreach underway.' },
  { name: 'GATEKEEPER',           color: '#ffcb00', desc: 'Reply came from a front desk, assistant, or non-DM. Need to get past them.' },
  { name: 'PROPOSAL_GATEKEEPER',  color: '#c084fc', desc: 'Gatekeeper is passing us to the decision-maker.' },
  { name: 'WRONG_COMPANY',        color: '#dc2626', desc: 'We contacted the wrong ownership entity. Needs corrected ownership data.' },
  { name: 'DM_IDENTIFIED',        color: '#66ccff', desc: 'Real decision-maker found and engaged. Active pitch in progress.' },
  { name: 'PROPOSAL_SENT',        color: '#a855f7', desc: 'Cloud9 proposal or one-pager delivered to the DM.' },
  { name: 'NO_PROPOSAL_RESPONSE', color: '#f59e0b', desc: 'Proposal sent — no reply yet. Follow up.' },
  { name: 'MEETING_SCHEDULED',    color: '#22c55e', desc: 'Call or in-person meeting booked with the DM.' },
  { name: 'SIGNED',               color: '#10b981', desc: 'Contract signed. Counts toward our goal of 20 buildings.' },
  { name: 'ON_HOLD',              color: '#6b7280', desc: 'Real prospect, but paused — owner said check back later.' },
  { name: 'DECLINED',             color: '#9ca3af', desc: 'They said no or asked to be removed. Do not contact again.' },
];

const TIERS = [
  { name: 'P1 — Asset Management', color: '#4f7cff', desc: 'The decision-maker. Asset manager or direct owner. Always contact this person first.' },
  { name: 'P2 — C-Suite', color: '#7c3aed', desc: 'CEO, COO, CFO. High authority but may redirect to asset manager.' },
  { name: 'P3 — Keyword Match', color: '#059669', desc: 'Title matched our search terms (e.g. "portfolio manager", "leasing director"). Potential gatekeeper or DM.' },
  { name: 'P4 — Extended Management', color: '#9ca3af', desc: 'Property manager, leasing agent. Good for intel — not the decision-maker.' },
];

const HS_ICONS = [
  { icon: 'E', color: '#60a5fa', name: 'Enrolled', desc: 'This contact is in one of our HubSpot email sequences. They\'re receiving outreach.' },
  { icon: 'O', color: '#34d399', name: 'Opened', desc: 'They opened one of our emails. They saw it but haven\'t responded yet.' },
  { icon: 'R', color: '#f97316', name: 'Replied', desc: 'They replied to our email. This is a warm signal — follow up immediately.' },
];

const PAIN_LEVELS = [
  { level: 'High', color: '#ef4444', desc: 'Large units available (2BR, 3BR) AND offering concessions (e.g. 1-2 months free). This building is actively struggling with vacancy. Best fit for Cloud9.' },
  { level: 'Medium', color: '#f59e0b', desc: 'Some vacancy in larger units or some concessions. Good candidate — not urgent.' },
  { level: 'Low', color: '#10b981', desc: 'Fully leased or no concessions. Low motivation to try something new right now.' },
];

const HOW_TO_USE = [
  { step: '1', title: 'Morning Review', desc: 'Open Overview → check the 4 action item cards → click to drill into overdue follow-ups or new replies.' },
  { step: '2', title: 'Find Warm Leads', desc: 'Go to Buildings → filter by "WARM" stage OR go to Contacts → click "Replied" filter chip. These are today\'s priority.' },
  { step: '3', title: 'Generate Outreach', desc: 'From a warm building → click "Generate Proposal". From a warm contact → click "Draft Email". Or use the Outreach tab for a fresh start.' },
  { step: '4', title: 'Log Every Touch', desc: 'After any call, email, or LinkedIn message → click "Log Touch" on the contact. This keeps the activity feed current and tracks next steps.' },
];

export function GlossaryModal({ onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div class="modal-overlay active" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" style={{ maxWidth: '680px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>SPIRE Guide — Terms & How To Use</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: '#9ca3af', padding: '0 4px' }}>&times;</button>
        </div>

        {/* How to Use */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#4f7cff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Quick Start — 4 Steps</div>
          {HOW_TO_USE.map(s => (
            <div key={s.step} style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#4f7cff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>{s.step}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{s.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline Stages */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#4f7cff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Pipeline Stages (Buildings)</div>
          {STAGES.map(s => (
            <div key={s.name} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: `${s.color}20`, color: s.color, whiteSpace: 'nowrap', flexShrink: 0, marginTop: '1px' }}>{s.name}</span>
              <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>{s.desc}</span>
            </div>
          ))}
        </div>

        {/* Contact Tiers */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#4f7cff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Contact Tiers (Who to Reach)</div>
          {TIERS.map(t => (
            <div key={t.name} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: `${t.color}20`, color: t.color, whiteSpace: 'nowrap', flexShrink: 0, marginTop: '1px' }}>{t.name.split(' — ')[0]}</span>
              <span style={{ fontSize: '0.75rem', color: '#4b5563' }}><strong>{t.name.split(' — ')[1]}:</strong> {t.desc}</span>
            </div>
          ))}
        </div>

        {/* HubSpot Icons */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#4f7cff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>HubSpot Icons (Email Engagement)</div>
          {HS_ICONS.map(h => (
            <div key={h.icon} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span class={`hs-icon hs-${h.name.toLowerCase()}`} style={{ flexShrink: 0 }}>{h.icon}</span>
              <span style={{ fontSize: '0.75rem', color: '#4b5563' }}><strong>{h.name}:</strong> {h.desc}</span>
            </div>
          ))}
        </div>

        {/* Pain Point */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#4f7cff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Pain Point (Building Urgency)</div>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '10px' }}>
            Pain Point measures how urgently a building needs what Cloud9 offers. Buildings with large vacant units AND concessions (free months) are in pain — and most likely to say yes to a RevShare pilot.
          </p>
          {PAIN_LEVELS.map(p => (
            <div key={p.level} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: `${p.color}20`, color: p.color, whiteSpace: 'nowrap', flexShrink: 0, marginTop: '1px' }}>{p.level}</span>
              <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>{p.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'right', marginTop: '20px' }}>
          <button class="btn btn-s btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
