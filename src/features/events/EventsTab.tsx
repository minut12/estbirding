import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadSettings } from '@/lib/settings';
import { fetchEventsFeed, type BirdEvent } from '@/lib/feed-parser';
import { downloadIcs } from '@/lib/ics';
import { CalendarDays, Settings, ChevronLeft, MapPin, ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { et } from 'date-fns/locale';

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
      <CalendarDays className="w-16 h-16 text-muted-foreground/40" />
      <h2 className="text-lg font-semibold text-foreground">Ürituste allikas puudub</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        Lisa ürituste allika URL seadetes, et näha tulevasi üritusi.
      </p>
      <Button onClick={onOpenSettings} variant="outline" className="gap-2">
        <Settings className="w-4 h-4" /> Ava seaded
      </Button>
    </div>
  );
}

function EventDetail({ event, onBack }: { event: BirdEvent; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="w-5 h-5" /></Button>
        <span className="font-medium truncate text-sm">Üritus</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h1 className="text-xl font-bold text-foreground">{event.title}</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>{formatDate(event.date)}</span>
        </div>
        {event.location && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            <span>{event.location}</span>
          </div>
        )}
        <p className="text-sm text-foreground leading-relaxed">{event.description}</p>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadIcs(event)}>
            <Download className="w-4 h-4" /> Lisa kalendrisse
          </Button>
          {event.link && (
            <a href={event.link} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" /> Ava link
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  try {
    return format(new Date(d), 'd. MMM yyyy, HH:mm', { locale: et });
  } catch {
    return d;
  }
}

export default function EventsTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = loadSettings();
  const [selected, setSelected] = useState<BirdEvent | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', settings.eventsSourceUrl],
    queryFn: () => fetchEventsFeed(settings.eventsSourceUrl),
    enabled: !!settings.eventsSourceUrl,
    staleTime: 5 * 60 * 1000,
  });

  if (!settings.eventsSourceUrl) return <EmptyState onOpenSettings={onOpenSettings} />;
  if (selected) return <EventDetail event={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="font-semibold text-foreground">Üritused</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Laen üritusi…</p>
        ) : events.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Üritusi ei leitud.</p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="px-4 py-3 active:bg-muted cursor-pointer"
                onClick={() => setSelected(ev)}
              >
                <p className="font-medium text-sm text-foreground">{ev.title}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span>{formatDate(ev.date)}</span>
                  {ev.location && <span>· {ev.location}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
