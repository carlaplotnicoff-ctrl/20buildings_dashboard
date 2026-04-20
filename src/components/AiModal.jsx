import { useState, useEffect } from 'preact/hooks';

/**
 * AiModal — shared modal for Generate Proposal, Draft Email, Draft Outreach
 *
 * Props:
 *   type:     "proposal" | "email" | "outreach"
 *   title:    string   — modal header (e.g. "Alta River Oaks — Revenue Analysis")
 *   fetchFn:  () => Promise<{ success, output?, subject?, body?, error? }>
 *   onClose:  () => void
 */
export function AiModal({ type, title, fetchFn, onClose }) {
  const [state, setState] = useState('loading'); // loading | success | error
  const [output, setOutput] = useState('');
  const [subject, setSubject] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  function run() {
    setState('loading');
    setErrorMsg('');
    fetchFn()
      .then(result => {
        if (!result || !result.success) {
          setErrorMsg(result?.error || 'AI generation failed. Try again.');
          setState('error');
        } else if (type === 'proposal') {
          setOutput(result.output || '');
          setState('success');
        } else {
          setSubject(result.subject || '');
          setOutput(result.body || '');
          setState('success');
        }
      })
      .catch(err => {
        setErrorMsg(err?.message || 'Something went wrong. Try again.');
        setState('error');
      });
  }

  // Run on mount
  useEffect(() => { run(); }, []);

  // Escape closes modal (when not loading)
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape' && !isLoading) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isLoading, onClose]);

  async function copyAll() {
    const text = (type === 'email' || type === 'outreach') && subject
      ? `Subject: ${subject}\n\n${output}`
      : output;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked — silently skip
    }
  }

  const isLoading = state === 'loading';

  return (
    <div
      class="modal-overlay active"
      onClick={isLoading ? undefined : (e => { if (e.target === e.currentTarget) onClose(); })}
    >
      <div class="modal ai-modal">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-1)' }}>{title}</h2>
          <button
            onClick={isLoading ? undefined : onClose}
            disabled={isLoading}
            style={{
              background: 'none', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '1.3rem', color: '#9ca3af', lineHeight: 1, padding: '0 4px',
              opacity: isLoading ? 0.4 : 1,
            }}
          >&times;</button>
        </div>

        {/* Loading state */}
        {state === 'loading' && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div class="ai-spinner" />
            <div style={{ marginTop: '16px', fontSize: '0.82rem', color: '#9ca3af', fontWeight: 500 }}>
              Generating{type === 'proposal' ? ' proposal' : ' email'}...
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#d1d5db' }}>
              This takes 10–25 seconds
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '12px' }}>⚠</div>
            <div style={{ fontSize: '0.88rem', color: '#dc2626', fontWeight: 600, marginBottom: '8px' }}>
              Generation failed
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '24px', maxWidth: '360px', margin: '0 auto 24px' }}>
              {errorMsg}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button class="btn btn-p btn-sm" onClick={run}>Retry</button>
              <button class="btn btn-s btn-sm" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* Success state */}
        {state === 'success' && (
          <div>
            {/* Subject line (email only) */}
            {(type === 'email' || type === 'outreach') && (
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onInput={e => setSubject(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: '8px', fontFamily: 'inherit', fontSize: '0.84rem',
                    color: 'var(--text-1)', background: 'rgba(255,255,255,0.9)', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Body / output textarea */}
            <div style={{ marginBottom: '14px' }}>
              {(type === 'email' || type === 'outreach') && (
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                  Body
                </label>
              )}
              <textarea
                value={output}
                onInput={e => setOutput(e.target.value)}
                style={{
                  width: '100%',
                  height: type === 'proposal' ? '420px' : '280px',
                  padding: '12px', border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: '8px', fontFamily: 'inherit', fontSize: '0.8rem',
                  lineHeight: 1.65, color: 'var(--text-1)', resize: 'vertical',
                  background: 'rgba(249,250,251,0.9)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Action row */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button class="btn btn-s btn-sm" onClick={run}>Regenerate</button>
              <button class="btn btn-s btn-sm" onClick={onClose}>Close</button>
              <button class="btn btn-p btn-sm" onClick={copyAll} style={{ minWidth: '130px' }}>
                {copied ? 'Copied!' : (type === 'email' || type === 'outreach') ? 'Copy subject + body' : 'Copy to clipboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
