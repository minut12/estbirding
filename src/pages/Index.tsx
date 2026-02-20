import { useState } from 'react';
import { Map, Newspaper, CalendarDays, Settings } from 'lucide-react';
import MapTab from '@/features/map/MapTab';
import NewsTab from '@/features/news/NewsTab';
import EventsTab from '@/features/events/EventsTab';

import SettingsTab from '@/features/settings/SettingsTab';
import CacheResetFab from '@/components/CacheResetFab';
import VersionBanner from '@/components/VersionBanner';
import { cn } from '@/lib/utils';

type Tab = 'kaart' | 'uudised' | 'üritused' | 'seaded';

const tabs: { id: Tab; label: string; icon: typeof Map }[] = [
  { id: 'kaart', label: 'Kaart', icon: Map },
  { id: 'uudised', label: 'Uudised', icon: Newspaper },
  { id: 'üritused', label: 'Üritused', icon: CalendarDays },
  { id: 'seaded', label: 'Seaded', icon: Settings },
];

export default function Index() {
  const [active, setActive] = useState<Tab>('kaart');

  // goToSettings kept for potential future use

  return (
    <div className="flex flex-col h-screen bg-background">
      <VersionBanner />

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {active === 'kaart' && <MapTab isActive={active === 'kaart'} />}
        {active === 'uudised' && <NewsTab />}
        {active === 'üritused' && <EventsTab />}
        {active === 'seaded' && <SettingsTab />}
      </div>

      {/* Bottom navigation */}
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

      {/* Mobile-only cache reset FAB */}
      <CacheResetFab />
    </div>
  );
}
