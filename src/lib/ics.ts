import type { BirdEvent } from './feed-parser';

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
