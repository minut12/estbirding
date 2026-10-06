import type { BirdEvent } from './feed-parser';
import type { EventItem } from '@/data/events';

/** Generate an .ics calendar file and trigger download */
export function downloadIcs(event: BirdEvent): void {
  const formatDate = (d: string) => {
    try {
      return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    } catch {
      return '';
    }
  };

  const start = formatDate(event.date);
  const end = event.endDate ? formatDate(event.endDate) : start;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EstBirding//ET',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${event.location}`,
    `URL:${event.link}`,
    `UID:${event.id}@estbirding`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

const ICS_LINE_OCTETS = 75;
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const DESCRIPTION_MAX_CHARS = 1000;
const FILE_SLUG_MAX_CHARS = 60;
const FALLBACK_FILE_SLUG = 'uritus';

/** Escape an RFC 5545 TEXT value: backslash, semicolon, comma, newline. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function utf8Octets(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Fold a content line at 75 UTF-8 octets (CRLF + space), never splitting a code point. */
function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let currentOctets = 0;
  for (const char of line) {
    const octets = utf8Octets(char.codePointAt(0) ?? 0);
    if (currentOctets + octets > ICS_LINE_OCTETS) {
      parts.push(current);
      current = ' ';
      currentOctets = 1;
    }
    current += char;
    currentOctets += octets;
  }
  parts.push(current);
  return parts.join('\r\n');
}

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function slugifyFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FILE_SLUG_MAX_CHARS)
    .replace(/-+$/g, '');
  return slug || FALLBACK_FILE_SLUG;
}

/** Pure RFC 5545 VCALENDAR text for one event (CRLF line endings, folded lines). */
export function buildEventIcs(event: EventItem, now: Date): string {
  const start = parseDate(event.startAt);
  if (!start) throw new Error(`Invalid event start: ${event.startAt}`);
  const parsedEnd = parseDate(event.endAt);
  const end =
    parsedEnd && parsedEnd.getTime() > start.getTime()
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);
  const description = (event.description ?? '').slice(0, DESCRIPTION_MAX_CHARS);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EstBirding//ET',
    'BEGIN:VEVENT',
    `UID:${event.id}@estbirds`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    ...(event.locationName ? [`LOCATION:${escapeIcsText(event.locationName)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** Build the event's .ics file and trigger a browser download. */
export function downloadEventIcs(event: EventItem): void {
  const ics = buildEventIcs(event, new Date());
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugifyFileName(event.title)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
