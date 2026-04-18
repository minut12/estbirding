export type EventLevel = 'info' | 'warn' | 'error' | 'success';

export interface AppEvent {
  id: string;
  timestamp: string;
  level: EventLevel;
  category: string;
  message: string;
  details?: string;
}

const MAX_EVENTS = 200;
const LS_KEY = 'estbirding.eventLog.v1';

let _events: AppEvent[] = [];
let _listeners: Array<() => void> = [];

try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) _events = JSON.parse(raw).slice(0, MAX_EVENTS);
} catch {}

function _persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_events.slice(0, MAX_EVENTS)));
  } catch {}
}

function _notify() {
  _listeners.forEach(fn => { try { fn(); } catch {} });
}

export function logEvent(
  category: string,
  message: string,
  level: EventLevel = 'info',
  details?: string
): AppEvent {
  const ev: AppEvent = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details,
  };
  _events.unshift(ev);
  if (_events.length > MAX_EVENTS) _events.length = MAX_EVENTS;
  _persist();
  _notify();
  return ev;
}

export function getEvents(): AppEvent[] {
  return _events;
}

export function clearEvents(): void {
  _events = [];
  _persist();
  _notify();
}

export function onEventsChanged(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter(l => l !== fn);
  };
}
