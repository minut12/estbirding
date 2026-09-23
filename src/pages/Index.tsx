import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { KaartIcon, UlevaadeIcon, UudisedIcon, UritusedIcon, SeadedIcon, type NavIcon } from '@/components/icons/NavIcons';
import MapTab from '@/features/map/MapTab';
import NewsTab from '@/features/news/NewsTab';
import EventsTab from '@/features/events/EventsTab';
import OverviewTab from '@/features/overview/OverviewTab';

import SettingsTab from '@/features/settings/SettingsTab';
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

const tabs: { id: Tab; label: string; icon: NavIcon }[] = [
  { id: 'kaart', label: 'Kaart', icon: KaartIcon },
  { id: 'ulevaade', label: 'Ülevaade', icon: UlevaadeIcon },
  { id: 'uudised', label: 'Uudised', icon: UudisedIcon },
  { id: 'üritused', label: 'Üritused', icon: UritusedIcon },
  { id: 'seaded', label: 'Seaded', icon: SeadedIcon },
];

export default function Index() {
  const { role, permissions } = useAuth();
  const location = useLocation();
  const [active, setActive] = useState<Tab>(() => resolveInitialTab());
  const [selectedMapId, setSelectedMapId] = useState<string>('');

  // location.key is in the deps because the tab bar is pure state (setActive) and never navigates:
  // after Ülevaade -> Kaart the pathname is still /ulevaade while active is 'kaart', so the iframe's
  // OPEN_ULEVAADE push to the same path would not re-run this effect and the tab would never switch.
  useEffect(() => {
    if (location.pathname === '/ulevaade') setActive('ulevaade');
  }, [location.pathname, location.key]);

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

      <nav className="flex justify-center border-t border-border bg-card px-1.5 pt-1.5 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-[600px]">
          {tabs.map(({ id, label, icon: Icon }) => {
            const on = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex-1 min-w-0 flex flex-col items-center gap-1 pt-1.5 pb-0.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  on ? 'text-primary' : 'text-foreground/75 hover:text-foreground'
                )}
              >
                <span className="relative flex h-8 w-14 items-center justify-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-0 rounded-full bg-primary/15 transition-[transform,opacity] duration-300 [transition-timing-function:cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none',
                      on ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0'
                    )}
                  />
                  <Icon active={on} className="relative h-[22px] w-[22px]" />
                </span>
                <span className={cn('text-[11.5px] leading-[14px] tracking-[-0.005em]', on ? 'font-bold text-foreground' : 'font-medium')}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
