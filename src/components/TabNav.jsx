import { activeTab, selectedBuilding, selectedCompany } from '../store/data';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'board',     label: 'Board'     },
  { id: 'companies', label: 'Companies' },
  { id: 'contacts',  label: 'Contacts'  },
];

export function TabNav() {
  return (
    <div class="tab-nav">
      {TABS.map(t => (
        <button
          key={t.id}
          class={`tab-btn ${activeTab.value === t.id || (t.id === 'board' && activeTab.value === 'profile') ? 'active' : ''}`}
          onClick={() => {
            selectedBuilding.value = null;
            selectedCompany.value = null;
            activeTab.value = t.id;
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
