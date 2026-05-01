import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Map, Newspaper, CalendarDays, Settings, Binoculars } from 'lucide-react';
import MapTab from '@/features/map/MapTab';
import NewsTab from '@/features/news/NewsTab';
import EventsTab from '@/features/events/EventsTab';
import OverviewTab from '@/features/overview/OverviewTab';

import SettingsTab from '@/features/settings/SettingsTab';
import CacheResetFab from '@/components/CacheResetFab';
import VersionBanner from '@/components/VersionBanner';
import { cn } from '@/lib/utils';
import { refreshSpeciesMetaFromCloud } from '@/lib/speciesMetaCloud';
import { getMyProfile } from '@/services/profile';
import { useAuth } from '@/features/auth/AuthContext';
import { maps } from '@/features/map/config';
import { resolveAllowedMapSelection } from '@/features/map/access';

type Tab = 'kaart' | 'ulevaade' | 'uudised' | 'üritused' | 'seaded';

const NEWS_HASHES = new Set(['#news', '#news-article']);

function resolveInitialTab(): Tab {
  if (typeof window !== 'undefined' && window.location.pathname === '/ulevaade') return 'ulevaade';
  const stateTab = window.history.state?.estbirding?.activeTab;
  if (stateTab === 'uudised') return 'uudised';
  if (NEWS_HASHES.has(window.location.hash)) return 'uudised';
  return 'kaart';
}

const tabs: { id: Tab; label: string; icon: typeof Map }[] = [
  { id: 'kaart', label: 'Kaart', icon: Map },
  { id: 'ulevaade', label: 'Ülevaade', icon: Binoculars },
  { id: 'uudised', label: 'Uudised', icon: Newspaper },
  { id: 'üritused', label: 'Üritused', icon: CalendarDays },
  { id: 'seaded', label: 'Seaded', icon: Settings },
];

export default function Index() {
  const { role, permissions } = useAuth();
  const location = useLocation();
  const [active, setActive] = useState<Tab>(() => resolveInitialTab());
  const [selectedMapId, setSelectedMapId] = useState<string>('');

  useEffect(() => {
    if (location.pathname === '/ulevaade') setActive('ulevaade');
  }, [location.pathname]);

  useEffect(() => {
    const resolved = resolveAllowedMapSelection({ role, permissions, maps, requestedId: selectedMapId });
    if (resolved && resolved.id !== selectedMapId) {
      setSelectedMapId(resolved.id);
    }
  }, [permissions, role, selectedMapId]);

  useEffect(() => {
    getMyProfile().catch(() => {});
    refreshSpeciesMetaFromCloud({ force: true }).catch(() => {});
    const id = window.setInterval(() => {
      refreshSpeciesMetaFromCloud().catch(() => {});
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const stateTab = window.history.state?.estbirding?.activeTab;
      if (stateTab === 'uudised' || NEWS_HASHES.has(window.location.hash)) {
        setActive('uudised');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (active !== 'uudised') return;
    const nextHash = NEWS_HASHES.has(window.location.hash) ? window.location.hash : '#news';
    window.history.replaceState(
      {
        ...(window.history.state || {}),
        estbirding: { ...(window.history.state?.estbirding || {}), activeTab: 'uudised' },
        estbirdingNews: window.history.state?.estbirdingNews || { view: 'list' },
      },
      '',
      nextHash,
    );
  }, [active]);

  return (
    <div className="flex flex-col h-[100dvh] min-h-[100dvh] bg-background overflow-hidden">
      <VersionBanner />

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className={active === 'kaart' ? 'absolute inset-0' : 'absolute inset-0 invisible pointer-events-none'}>
          <MapTab isActive={active === 'kaart'} onMapChange={setSelectedMapId} />
        </div>
        {active === 'ulevaade' && <OverviewTab />}
        {active === 'uudised' && <NewsTab />}
        {active === 'üritused' && <EventsTab />}
        {active === 'seaded' && <SettingsTab />}
      </div>

      <nav className="flex items-center border-t border-border bg-card pb-safe">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors',
              active === id
                ? 'text-primary font-semibold'
                : 'text-muted-foreground'
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {active === 'kaart' && selectedMapId === 'linnuliigid-ee' && <CacheResetFab />}
    </div>
  );
}
