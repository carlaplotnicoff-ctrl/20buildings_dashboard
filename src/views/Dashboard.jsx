import { marketStats, buildings, contacts, emailReplies, signedCount, activeTab, marketFilter, PAIN_COLOR } from '../store/data';
import { formatDate } from '../lib/format';

const CITIES = ['Chicago', 'Houston', 'Dallas', 'Charlotte', 'Phoenix'];

const CITY_COLORS = {
  Chicago:   '#4f7cff',
  Houston:   '#f59e0b',
  Dallas:    '#a855f7',
  Charlotte: '#10b981',
  Phoenix:   '#ef4444',
};

// Stage funnel segments shown in the city card bar
const FUNNEL_STAGES = [
  { key: 'NO_CONTACTS',       color: '#e5e7eb' },
  { key: 'IN_SEQUENCE',       color: '#93c5fd' },
  { key: 'NO_DM_RESPONSE',    color: '#f59e0b' },
  { key: 'DM_IDENTIFIED',     color: '#66ccff' },
  { key: 'PROPOSAL_SENT',     color: '#a855f7' },
  { key: 'MEETING_SCHEDULED', color: '#22c55e' },
  { key: 'SIGNED',            color: '#00854d' },
];

function cityTag(stats) {
  if (stats.signed > 0) return { label: 'Signed', cls: 'cool' };
  if (stats.warm > 0)   return { label: 'Active Deals', cls: 'warm' };
  if (stats.replied > 0) return { label: 'Replies In', cls: 'warm' };
  if (stats.contacts > 0) return { label: 'In Sequence', cls: 'new' };
  return { label: 'Pre-Launch', cls: 'new' };
}

function FunnelBar({ cityBuildings }) {
  const total = cityBuildings.length;
  if (total === 0) return null;

  const stageCounts = {};
  for (const b of cityBuildings) {
    const s = b.stage || 'NO_CONTACTS';
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  }

  return (
    <div class="dash-city-funnel">
      <div class="dash-funnel-label">Stage distribution</div>
      <div class="dash-funnel-track">
        {FUNNEL_STAGES.map(({ key, color }) => {
          const count = stageCounts[key] || 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              class="dash-funnel-seg"
              style={{ width: `${pct}%`, background: color }}
              title={`${key.replace(/_/g, ' ')}: ${count}`}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
        {FUNNEL_STAGES.filter(({ key }) => stageCounts[key] > 0).map(({ key, color }) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.62rem', color: '#6b7280' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {key.replace(/_/g, ' ')} ({stageCounts[key]})
          </span>
        ))}
      </div>
    </div>
  );
}

function CityCard({ city, stats, cityBuildings, cityReplies }) {
  const tag = cityTag(stats);
  const color = CITY_COLORS[city];

  function goToCity() {
    marketFilter.value = city;
    activeTab.value = 'board';
  }

  const replyRate = stats.contacts > 0
    ? Math.round((stats.replied / stats.contacts) * 100)
    : 0;

  return (
    <div class="dash-city-card" style={{ cursor: 'pointer' }} onClick={goToCity}>
      <div class="dash-city-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span class="dash-city-name">{city}</span>
        </div>
        <span class={`dash-city-tag ${tag.cls}`}>{tag.label}</span>
      </div>

      <div class="dash-city-stats">
        <div class="dash-city-stat">
          <div class="dash-city-stat-val" style={{ color }}>{stats.buildings}</div>
          <div class="dash-city-stat-label">Buildings</div>
        </div>
        <div class="dash-city-stat">
          <div class="dash-city-stat-val">{stats.contacts}</div>
          <div class="dash-city-stat-label">Contacts</div>
        </div>
        <div class="dash-city-stat">
          <div class="dash-city-stat-val" style={{ color: stats.replied > 0 ? '#10b981' : undefined }}>{stats.replied}</div>
          <div class="dash-city-stat-label">Replies</div>
        </div>
        <div class="dash-city-stat">
          <div class="dash-city-stat-val" style={{ color: stats.warm > 0 ? '#a855f7' : undefined }}>{stats.warm}</div>
          <div class="dash-city-stat-label">Active Deals</div>
        </div>
        <div class="dash-city-stat">
          <div class="dash-city-stat-val" style={{ color: stats.signed > 0 ? '#00854d' : '#9ca3af' }}>{stats.signed}</div>
          <div class="dash-city-stat-label">Signed</div>
        </div>
        <div class="dash-city-stat">
          <div class="dash-city-stat-val" style={{ color: replyRate > 0 ? '#f59e0b' : undefined }}>{replyRate}%</div>
          <div class="dash-city-stat-label">Reply Rate</div>
        </div>
      </div>

      <FunnelBar cityBuildings={cityBuildings} />
    </div>
  );
}

function RecentReplies({ replies }) {
  const recent = replies
    .filter(r => r.direction === 'INCOMING')
    .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
    .slice(0, 8);

  if (recent.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: '0.8rem', padding: '12px 0' }}>No replies yet.</div>;
  }

  return (
    <div>
      {recent.map(r => (
        <div key={r.id} class="dash-activity-row">
          <div class="dash-activity-dot" />
          <div class="dash-activity-text">
            <strong>{r.contact_email?.split('@')[0]}</strong> — {r.subject || '(no subject)'}
            {r.body_preview && <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '2px' }}>{r.body_preview.slice(0, 80)}</div>}
          </div>
          <div class="dash-activity-time">{formatDate(r.received_at)}</div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const stats = marketStats.value;
  const allBuildings = buildings.value;
  const allContacts  = contacts.value;
  const allReplies   = emailReplies.value;
  const signed       = signedCount.value;

  const totalBuildings = allBuildings.length;
  const totalContacts  = allContacts.length;
  const totalReplied   = allContacts.filter(c => c.hs_replied).length;
  const totalWarm      = CITIES.reduce((sum, c) => sum + (stats[c]?.warm || 0), 0);
  const overallReplyRate = totalContacts > 0 ? ((totalReplied / totalContacts) * 100).toFixed(1) : '0.0';

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div class="dash-page">
      {/* Top bar */}
      <div class="dash-topbar">
        <div>
          <div class="dash-title">20 Buildings Campaign</div>
          <div class="dash-subtitle">Cloud9 RevShare — 2026 Acquisition Campaign</div>
        </div>
        <div class="dash-date">{today}</div>
      </div>

      {/* Hero KPIs */}
      <div class="dash-hero">
        <div class="dash-kpi accent">
          <div class="dash-kpi-label">Signed Deals</div>
          <div class="dash-kpi-value">{signed}<span style={{ fontSize: '1rem', fontWeight: 500, opacity: 0.6 }}>/20</span></div>
          <div class="dash-kpi-sub">Goal: 20 buildings by end of 2026</div>
        </div>
        <div class="dash-kpi">
          <div class="dash-kpi-label">Active Deals</div>
          <div class="dash-kpi-value" style={{ color: '#a855f7' }}>{totalWarm}</div>
          <div class="dash-kpi-sub">DM Identified → Meeting Scheduled</div>
        </div>
        <div class="dash-kpi">
          <div class="dash-kpi-label">Total Replies</div>
          <div class="dash-kpi-value" style={{ color: '#10b981' }}>{totalReplied}</div>
          <div class="dash-kpi-sub">{overallReplyRate}% reply rate across {totalContacts.toLocaleString()} contacts</div>
        </div>
        <div class="dash-kpi">
          <div class="dash-kpi-label">Buildings Tracked</div>
          <div class="dash-kpi-value">{totalBuildings}</div>
          <div class="dash-kpi-sub">Across {CITIES.length} markets</div>
        </div>
      </div>

      {/* City cards */}
      <div class="dash-section-title">Performance by City</div>
      <div class="dash-cities">
        {CITIES.map(city => (
          <CityCard
            key={city}
            city={city}
            stats={stats[city] || { buildings: 0, contacts: 0, warm: 0, signed: 0, replied: 0 }}
            cityBuildings={allBuildings.filter(b => b.market === city)}
            cityReplies={allReplies}
          />
        ))}
      </div>

      {/* Recent reply activity */}
      <div class="dash-section-title" style={{ marginTop: '8px' }}>Recent Reply Activity</div>
      <div class="dash-activity">
        <RecentReplies replies={allReplies} />
      </div>
    </div>
  );
}
