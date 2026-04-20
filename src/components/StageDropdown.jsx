import { useState, useEffect, useRef } from 'preact/hooks';
import { STAGES, STAGE_LABELS } from '../store/data';
import { changeStage } from '../store/actions';
import { StageBadge } from './StageBadge';
import { addToast } from './Toast';

export function StageDropdown({ building }) {
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
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: '4px', minWidth: '220px',
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
              <StageBadge stage={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
