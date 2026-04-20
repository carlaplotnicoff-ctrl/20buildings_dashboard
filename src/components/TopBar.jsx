import { isConnected, isLoading, syncLog } from '../store/data';

export function TopBar({ onOpenGlossary }) {
  const lastSync = syncLog.value[0];
  const syncLabel = lastSync
    ? `HubSpot: ${new Date(lastSync.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'HubSpot: not synced';

  return (
    <div class="top-bar">
      <div class="brand">
        <span class="brand-mark">&#9672;</span>
        <div>
          <h1><span>SPIRE</span></h1>
          <div class="brand-sub">20 Buildings &middot; 2026</div>
        </div>
      </div>
      <div class="top-bar-right">
        {!isLoading.value && (
          <span style={{ fontSize: '0.68rem', color: lastSync ? 'rgba(255,255,255,0.85)' : 'rgba(255,200,0,0.9)', marginRight: '12px', fontWeight: 500 }}>
            {syncLabel}
          </span>
        )}
        <button
          onClick={onOpenGlossary}
          title="SPIRE Guide — terms, stages, and how to use (press ?)"
          style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 700, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginRight: '10px', flexShrink: 0,
          }}
        >?</button>
        <span class={`conn-dot ${isConnected.value ? 'on' : 'off'}`} />
        <span class="conn-lbl" title="Press Ctrl+K to focus search">
          {isLoading.value ? 'Loading...' : isConnected.value ? 'Live' : 'Offline'}
        </span>
      </div>
    </div>
  );
}
