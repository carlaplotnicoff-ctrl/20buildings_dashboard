import { useEffect, useState } from 'preact/hooks';
import { activeTab, isLoading, loadAllData, loadError, selectedCompany } from './store/data';
import { TopBar } from './components/TopBar';
import { TabNav } from './components/TabNav';
import { Toasts, addToast } from './components/Toast';
import { GlossaryModal } from './components/GlossaryModal';
import { Dashboard } from './views/Dashboard';
import { Board } from './views/Board';
import { BuildingProfile } from './views/BuildingProfile';
import { Companies } from './views/Companies';
import { CompanyBuildings } from './views/CompanyBuildings';
import { Contacts } from './views/Contacts';

export function App() {
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  useEffect(() => {
    loadAllData().then(() => {
      if (loadError.value) {
        addToast(`Database connection failed: ${loadError.value}`, 'err');
      }
    });
  }, []);

  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.querySelector('.page input[type="text"], .page input:not([type])');
        if (input) { input.focus(); input.select(); }
      }
      if (e.key === '?' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setGlossaryOpen(g => !g);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <TopBar onOpenGlossary={() => setGlossaryOpen(true)} />
      <TabNav />
      {glossaryOpen && <GlossaryModal onClose={() => setGlossaryOpen(false)} />}

      {isLoading.value ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: '1.5rem', color: '#4f7cff', marginBottom: '12px' }}>&#9672;</div>
          <div style={{ color: '#6b7280', fontSize: '0.88rem' }}>Loading pipeline data...</div>
        </div>
      ) : (
        <>
          {activeTab.value === 'dashboard' && <Dashboard />}
          {activeTab.value === 'board'     && <Board />}
          {activeTab.value === 'profile'   && <BuildingProfile />}
          {activeTab.value === 'companies' && !selectedCompany.value && <Companies />}
          {activeTab.value === 'companies' &&  selectedCompany.value && <CompanyBuildings />}
          {activeTab.value === 'contacts'  && <Contacts />}
        </>
      )}

      <Toasts />
    </>
  );
}
