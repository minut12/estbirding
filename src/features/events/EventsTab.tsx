import { useState, useRef, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  CalendarDays, ChevronLeft, MapPin, ExternalLink, Download,
  Search, Clock, Tag, UserCheck, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ── Types ──────────────────────────────────────── */
interface EventItem {
  id: string;
  source_slug: string;
  category: string;
  title: string;
  description: string;
  content_html: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lon: number | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  url: string | null;
  image_url: string | null;
  registration_url: string | null;
  tags: string[] | null;
  language: string;
  is_cancelled: boolean;
}

/* ── Date helpers ───────────────────────────────── */
const ET_MONTHS = ['jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
const ET_MONTHS_FULL = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];

function formatDay(iso: string): string {
  try { return new Date(iso).getDate().toString(); } catch { return ''; }
}
function formatMonth(iso: string): string {
  try { return ET_MONTHS[new Date(iso).getMonth()]; } catch { return ''; }
}
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch { return ''; }
}
function formatFullDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${ET_MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return iso; }
}
function formatTimeRange(start: string, end: string | null, allDay: boolean): string {
  if (allDay) return 'Terve päev';
  const s = formatTime(start);
  if (!end) return s;
  return `${s} – ${formatTime(end)}`;
}

/* ── ICS export ─────────────────────────────────── */
function downloadIcsEvent(event: EventItem): void {
  const fmtDate = (d: string) => {
    try { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); } catch { return ''; }
  };
  const start = fmtDate(event.start_at);
  const end = event.end_at ? fmtDate(event.end_at) : start;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EstBirding//ET',
    'BEGIN:VEVENT',
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
    event.location_name ? `LOCATION:${event.location_name}` : '',
    event.url ? `URL:${event.url}` : '',
    `UID:${event.id}@estbirding`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Constants ──────────────────────────────────── */
const PAGE_SIZE = 20;
type TimeTab = 'upcoming' | 'past';
type CatFilter = 'all' | 'estbirding' | 'other';

/* ── Main component ─────────────────────────────── */
export default function EventsTab() {
  const [timeTab, setTimeTab] = useState<TimeTab>('upcoming');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EventItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);

  const now = new Date().toISOString();

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch,
  } = useInfiniteQuery({
    queryKey: ['events', timeTab, catFilter, search],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('events')
        .select('*')
        .eq('is_cancelled', false)
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (timeTab === 'upcoming') {
        query = query.gte('start_at', now).order('start_at', { ascending: true });
      } else {
        query = query.lt('start_at', now).order('start_at', { ascending: false });
      }

      if (catFilter !== 'all') {
        query = query.eq('category', catFilter);
      }

      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,location_name.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as EventItem[];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
    staleTime: 30_000,
  });

  const allItems = data?.pages.flat() ?? [];

  // Infinite scroll observer
  const observerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!observerRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(observerRef.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openEvent = (item: EventItem) => {
    scrollPosRef.current = scrollRef.current?.scrollTop ?? 0;
    setSelected(item);
  };
  const closeEvent = () => {
    setSelected(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollPosRef.current;
    });
  };

  if (selected) {
    return <EventDetail event={selected} onBack={closeEvent} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-lg">Üritused</h2>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Värskenda">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Time tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([['upcoming', 'Tulevased'], ['past', 'Möödunud']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTimeTab(id)}
              className={cn(
                'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
                timeTab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([['all', 'Kõik'], ['estbirding', 'EstBirding'], ['other', 'Muud']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setCatFilter(id)}
              className={cn(
                'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
                catFilter === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Otsi üritusi…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <Skeleton className="w-14 h-16 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : allItems.length === 0 ? (
          <EmptyState timeTab={timeTab} catFilter={catFilter} />
        ) : (
          <div className="divide-y divide-border">
            {allItems.map((item) => (
              <EventCard key={item.id} event={item} onOpen={() => openEvent(item)} />
            ))}
          </div>
        )}
        <div ref={observerRef} className="h-10" />
        {isFetchingNextPage && (
          <div className="p-4 text-center text-sm text-muted-foreground">Laen lisaks…</div>
        )}
      </div>
    </div>
  );
}

/* ── Event Card ─────────────────────────────────── */
function EventCard({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  const sourceLabel = event.source_slug === 'estbirding' ? 'EstBirding'
    : event.source_slug === 'eoy' ? 'EOÜ'
    : event.source_slug.toUpperCase();

  return (
    <div className="px-4 py-3 active:bg-muted/50 transition-colors" onClick={onOpen}>
      <div className="flex gap-3">
        {/* Date badge */}
        <div className="w-14 h-16 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
          <span className="text-xl font-bold text-primary leading-none">{formatDay(event.start_at)}</span>
          <span className="text-xs font-medium text-primary/70 uppercase mt-0.5">{formatMonth(event.start_at)}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground line-clamp-2">{event.title}</p>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge
              variant={event.category === 'estbirding' ? 'default' : 'secondary'}
              className="text-xs px-1.5 py-0"
            >
              {sourceLabel}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeRange(event.start_at, event.end_at, event.all_day)}
            </span>
          </div>

          {event.location_name && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{event.location_name}</span>
            </p>
          )}

          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              Ava
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={(e) => { e.stopPropagation(); downloadIcsEvent(event); }}>
              <Download className="w-3.5 h-3.5 mr-1" /> Kalender
            </Button>
            {event.registration_url && (
              <a href={event.registration_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                  <UserCheck className="w-3.5 h-3.5 mr-1" /> Registreeru
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Event Detail ───────────────────────────────── */
function EventDetail({ event, onBack }: { event: EventItem; onBack: () => void }) {
  const sourceLabel = event.source_slug === 'estbirding' ? 'EstBirding'
    : event.source_slug === 'eoy' ? 'EOÜ'
    : event.source_slug.toUpperCase();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium truncate text-sm flex-1">Üritus</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {event.image_url && (
          <img
            src={event.image_url}
            alt=""
            className="w-full rounded-xl object-cover max-h-56 bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        <h1 className="text-xl font-bold text-foreground">{event.title}</h1>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={event.category === 'estbirding' ? 'default' : 'secondary'}>{sourceLabel}</Badge>
            {event.tags?.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag className="w-3 h-3 mr-1" />{tag}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span>{formatFullDate(event.start_at)}</span>
            <span>·</span>
            <span>{formatTimeRange(event.start_at, event.end_at, event.all_day)}</span>
          </div>

          {event.location_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>{event.location_name}</span>
            </div>
          )}
        </div>

        {/* Map preview if coordinates exist */}
        {event.location_lat && event.location_lon && (
          <div className="rounded-lg overflow-hidden border border-border h-40">
            <iframe
              title="Asukoht"
              className="w-full h-full border-0"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${event.location_lon - 0.01},${event.location_lat - 0.005},${event.location_lon + 0.01},${event.location_lat + 0.005}&layer=mapnik&marker=${event.location_lat},${event.location_lon}`}
              loading="lazy"
            />
          </div>
        )}

        {event.content_html ? (
          <div
            className="prose prose-sm max-w-none text-foreground [&_a]:text-primary"
            dangerouslySetInnerHTML={{ __html: event.content_html }}
          />
        ) : event.description ? (
          <p className="text-sm text-foreground leading-relaxed">{event.description}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadIcsEvent(event)}>
            <Download className="w-3.5 h-3.5" /> Lisa kalendrisse
          </Button>
          {event.url && (
            <a href={event.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Ava originaal
              </Button>
            </a>
          )}
          {event.registration_url && (
            <a href={event.registration_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> Registreeru
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Empty State ────────────────────────────────── */
function EmptyState({ timeTab, catFilter }: { timeTab: TimeTab; catFilter: CatFilter }) {
  const catLabel = catFilter === 'estbirding' ? 'EstBirding' : catFilter === 'other' ? 'muid' : '';
  const timeLabel = timeTab === 'upcoming' ? 'tulevasi' : 'möödunud';
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
      <CalendarDays className="w-14 h-14 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        {catLabel
          ? `Ei leitud ${timeLabel} ${catLabel} üritusi.`
          : `Ei leitud ${timeLabel} üritusi.`}
      </p>
    </div>
  );
}
