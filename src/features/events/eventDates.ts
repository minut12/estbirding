import { et, formatEventCountdown } from "@/localization/et";

const TIME_ZONE = "Europe/Tallinn";
const EN_DASH = String.fromCharCode(0x2013);

const LONG_DATE_FORMAT = new Intl.DateTimeFormat("et-EE", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const END_DATE_FORMAT = new Intl.DateTimeFormat("et-EE", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const TIME_FORMAT = new Intl.DateTimeFormat("et-EE", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function capitalizeFirst(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

export interface DateLines {
  primary: string;
  secondary: string;
  times: string;
}

export function buildDateLines(startAt: string, endAt: string | undefined): DateLines | null {
  const start = parseDate(startAt);
  if (!start) return null;
  const end = parseDate(endAt);
  const validEnd = end && end.getTime() > start.getTime() ? end : null;
  const isSameDay = validEnd !== null && DAY_KEY_FORMAT.format(validEnd) === DAY_KEY_FORMAT.format(start);
  const startDate = capitalizeFirst(LONG_DATE_FORMAT.format(start));
  const primary = validEnd && !isSameDay ? `${startDate} ${EN_DASH} ${END_DATE_FORMAT.format(validEnd)}` : startDate;
  const times = validEnd && isSameDay
    ? `${TIME_FORMAT.format(start)}${EN_DASH}${TIME_FORMAT.format(validEnd)}`
    : TIME_FORMAT.format(start);
  return { primary, secondary: `${times}${et.metaSeparator}${formatEventCountdown(startAt)}`, times };
}
