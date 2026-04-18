import { useState, useEffect } from 'react';
import { getEvents, clearEvents, onEventsChanged, type AppEvent, type EventLevel } from '@/lib/eventLog';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const LEVEL_DOT: Record<EventLevel, string> = {
  info: 'bg-blue-400',
  warn: 'bg-amber-400',
  error: 'bg-red-500',
  success: 'bg-green-500',
};

const LEVEL_BG: Record<EventLevel, string> = {
  info: '',
  warn: 'bg-amber-50',
  error: 'bg-red-50',
  success: 'bg-green-50',
};

const CATEGORY_LABELS: Record<string, string> = {
  push: '🔔 Teavitus',
  sync: '☁️ Sünkroon',
  snapshot: '📸 Snapshot',
  elurikkus: '🌿 Elurikkus',
  ebird: '🐦 eBird',
  notify: '🔕 Bell',
  system: '⚙️ Süsteem',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  } catch { return iso; }
}

function EventRow({ event }: { event: AppEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border-b border-gray-100 last:border-0 px-3 py-2 ${LEVEL_BG[event.level] || ''}`}>
      <div className="flex items-start gap-2 cursor-pointer" onClick={() => event.details && setExpanded(!expanded)}>
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${LEVEL_DOT[event.level]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500">{formatTime(event.timestamp)}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">
              {CATEGORY_LABELS[event.category] || event.category}
            </span>
          </div>
          <p className="text-sm mt-0.5 break-words">{event.message}</p>
        </div>
        {event.details && (
          <span className="text-gray-400 mt-1 flex-shrink-0">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
      {expanded && event.details && (
        <pre className="mt-1 ml-4 text-xs text-gray-600 bg-white/60 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
          {event.details}
        </pre>
      )}
    </div>
  );
}

export default function EventLog() {
  const [events, setEvents] = useState<AppEvent[]>(getEvents());
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => onEventsChanged(() => setEvents([...getEvents()])), []);

  const filtered = filter === 'all' ? events : events.filter(e => e.category === filter);
  const categories = ['all', ...Array.from(new Set(events.map(e => e.category)))];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">📋 Sündmuste logi</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEvents([...getEvents()])}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { if(confirm('Kustuta kõik sündmused?')) clearEvents(); }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              filter === cat ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            {cat === 'all' ? 'Kõik' : (CATEGORY_LABELS[cat] || cat)}
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} sündmust
      </div>

      <div className="border rounded-lg bg-white max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">Sündmusi pole veel</div>
        ) : (
          filtered.map(ev => <EventRow key={ev.id} event={ev} />)
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Salvestab kuni 200 sündmust localStorage'sse.
      </p>
    </div>
  );
}
