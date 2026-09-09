// P5 2026-09-06: arrival ETA from 850 hPa wind along the source->site track.
// Pure logic, no I/O and no imports from index.ts — index.ts owns the fetch.

export interface EtaSourcePoint {
  lat: number;
  lon: number;
  date: string;
}

export interface EtaSitePoint {
  lat: number;
  lon: number;
  label: string;
}

export interface EtaInput {
  source: EtaSourcePoint;
  site: EtaSitePoint;
  flightClass: string | null;
  now: Date;
}

export interface WindSample {
  lat: number;
  lon: number;
  speedKmh: number;
  dirFromDeg: number;
}

export interface EtaBasis {
  distance_km: number;
  travel_bearing_deg: number;
  airspeed_kmh: number;
  tailwind_kmh: number | null;
  ground_kmh: number;
  hours_per_day: number;
  wind_label_et: string | null;
  source_date: string;
  site_label: string;
  wind_points: number;
  source: string;
}

export interface EtaResult {
  eta_days: number | null;
  eta_window_et: string;
  eta_basis: EtaBasis | null;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export const AIRSPEED_KMH: Record<string, number> = {
  seabird: 50,
  wader: 65,
  waterbird: 70,
  heron_stork: 45,
  raptor_soaring: 40,
  passerine_nocturnal: 45,
};

export const DEFAULT_AIRSPEED_KMH = 50;

export const HOURS_PER_DAY: Record<string, number> = {
  passerine_nocturnal: 8,
  raptor_soaring: 6,
};

export const DEFAULT_HOURS_PER_DAY = 10;

export const GROUND_MIN_KMH = 15;
export const GROUND_MAX_KMH = 120;

export const WIND_UNAVAILABLE_ET = "Tuuleandmed puuduvad";

const EARTH_RADIUS_KM = 6371;
const MS_PER_DAY = 86_400_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function initialBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function midpoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): GeoPoint {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const bx = Math.cos(p2) * Math.cos(dLon);
  const by = Math.cos(p2) * Math.sin(dLon);
  const lat = Math.atan2(
    Math.sin(p1) + Math.sin(p2),
    Math.sqrt((Math.cos(p1) + bx) * (Math.cos(p1) + bx) + by * by),
  );
  const lon = toRad(lon1) + Math.atan2(by, Math.cos(p1) + bx);
  return { lat: toDeg(lat), lon: ((toDeg(lon) + 540) % 360) - 180 };
}

export function airspeedFor(flightClass: string | null): number {
  if (!flightClass) return DEFAULT_AIRSPEED_KMH;
  return AIRSPEED_KMH[flightClass] ?? DEFAULT_AIRSPEED_KMH;
}

export function hoursPerDayFor(flightClass: string | null): number {
  if (!flightClass) return DEFAULT_HOURS_PER_DAY;
  return HOURS_PER_DAY[flightClass] ?? DEFAULT_HOURS_PER_DAY;
}

// Wind direction is "from" (meteorological). The wind pushes toward
// dirFromDeg + 180, so that is what is projected onto the travel bearing.
export function tailwindKmh(
  samples: readonly WindSample[],
  travelBearingDeg: number,
): number | null {
  if (!samples.length) return null;
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    if (!Number.isFinite(s.speedKmh) || !Number.isFinite(s.dirFromDeg)) continue;
    const towardDeg = s.dirFromDeg + 180;
    sum += s.speedKmh * Math.cos(toRad(travelBearingDeg - towardDeg));
    n++;
  }
  if (!n) return null;
  return sum / n;
}

export function windLabelEt(tailwind: number | null): string | null {
  if (tailwind === null || !Number.isFinite(tailwind)) return null;
  if (tailwind >= 10) return "pärituul";
  if (tailwind <= -10) return "vastutuul";
  return "külgtuul";
}

function formatDaysEt(days: number): string {
  // Decimal comma for halves ("1,5"), plain integers otherwise.
  return Number.isInteger(days) ? String(days) : String(days).replace(".", ",");
}

// Symmetric ladder: eta_days may be negative, meaning the earliest arrival
// already fell in the past. Never print a minus sign -- the past branches take
// the absolute value and carry the tense in the wording instead.
export function formatEtaEt(etaDays: number): string {
  if (etaDays > 7) return "Varaseim saabumine: hiljem kui nädal";
  if (etaDays > 1) {
    return `Varaseim saabumine: umbes ${formatDaysEt(etaDays)} päeva`;
  }
  if (etaDays > 0) return "Varaseim saabumine: täna või homme";
  if (etaDays === 0) return "Võib juba kohal olla";
  if (etaDays >= -1) return "Võis saabuda eile või täna";
  if (etaDays >= -7) {
    return `Võis saabuda umbes ${formatDaysEt(Math.abs(etaDays))} päeva tagasi`;
  }
  return "Võis saabuda üle nädala tagasi";
}

export function buildOpenMeteoUrl(points: readonly GeoPoint[]): string {
  const lats = points.map((p) => p.lat.toFixed(4)).join(",");
  const lons = points.map((p) => p.lon.toFixed(4)).join(",");
  return "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lats}&longitude=${lons}` +
    "&hourly=wind_speed_850hPa,wind_direction_850hPa" +
    "&forecast_days=2&wind_speed_unit=kmh&timezone=UTC";
}

interface OpenMeteoHourly {
  time?: unknown;
  wind_speed_850hPa?: unknown;
  wind_direction_850hPa?: unknown;
}

interface OpenMeteoLocation {
  latitude?: unknown;
  longitude?: unknown;
  hourly?: OpenMeteoHourly;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Open-Meteo echoes coordinates snapped to its grid, so locations are paired
// back to the requested points positionally — never by coordinate equality.
// A location with no usable hour yields no sample, so a caller relying on
// positional pairing must check the returned length.
export function parseOpenMeteo(
  json: unknown,
  nowUtc: Date,
  hours = 24,
): WindSample[] {
  const locations: OpenMeteoLocation[] = Array.isArray(json)
    ? json as OpenMeteoLocation[]
    : [json as OpenMeteoLocation];

  const fromMs = nowUtc.getTime();
  const toMs = fromMs + hours * 3600_000;
  const out: WindSample[] = [];

  for (const loc of locations) {
    if (!loc || typeof loc !== "object") continue;
    const hourly = loc.hourly;
    if (!hourly) continue;
    const times = Array.isArray(hourly.time) ? hourly.time : null;
    const speeds = Array.isArray(hourly.wind_speed_850hPa)
      ? hourly.wind_speed_850hPa
      : null;
    const dirs = Array.isArray(hourly.wind_direction_850hPa)
      ? hourly.wind_direction_850hPa
      : null;
    if (!times || !speeds || !dirs) continue;

    // Mean the wind as a vector, not as separate speed and direction means:
    // averaging 350 deg and 10 deg as scalars gives 180, the exact opposite.
    let sumU = 0;
    let sumV = 0;
    let n = 0;
    for (let i = 0; i < times.length; i++) {
      const raw = times[i];
      if (typeof raw !== "string") continue;
      // Open-Meteo emits naive UTC stamps ("2026-09-06T10:00") with timezone=UTC.
      const t = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`);
      if (!Number.isFinite(t) || t < fromMs || t >= toMs) continue;
      const speed = asNumber(speeds[i]);
      const dir = asNumber(dirs[i]);
      if (speed === null || dir === null) continue;
      sumU += speed * Math.sin(toRad(dir));
      sumV += speed * Math.cos(toRad(dir));
      n++;
    }
    if (!n) continue;

    const meanU = sumU / n;
    const meanV = sumV / n;
    out.push({
      lat: asNumber(loc.latitude) ?? 0,
      lon: asNumber(loc.longitude) ?? 0,
      speedKmh: Math.hypot(meanU, meanV),
      dirFromDeg: (toDeg(Math.atan2(meanU, meanV)) + 360) % 360,
    });
  }

  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function etaFor(
  input: EtaInput,
  samples: readonly WindSample[] | null,
): EtaResult {
  try {
    const { source, site, flightClass, now } = input;
    const sourceMs = Date.parse(source.date);
    if (!Number.isFinite(sourceMs)) {
      return {
        eta_days: null,
        eta_window_et: WIND_UNAVAILABLE_ET,
        eta_basis: null,
      };
    }

    const distanceKm = haversineKm(source.lat, source.lon, site.lat, site.lon);
    const travelBearing = initialBearingDeg(
      source.lat,
      source.lon,
      site.lat,
      site.lon,
    );
    const airspeed = airspeedFor(flightClass);
    const hoursPerDay = hoursPerDayFor(flightClass);
    const tailwind = samples ? tailwindKmh(samples, travelBearing) : null;
    const groundKmh = clamp(
      airspeed + (tailwind ?? 0),
      GROUND_MIN_KMH,
      GROUND_MAX_KMH,
    );
    const travelDays = distanceKm / (groundKmh * hoursPerDay);
    const arrivalMs = sourceMs + travelDays * MS_PER_DAY;
    // Not clamped at 0: an old source observation legitimately puts the
    // earliest arrival in the past, and flattening those to 0 made every such
    // site read "Võib juba kohal olla" regardless of how stale it was.
    const etaDays = roundToHalf((arrivalMs - now.getTime()) / MS_PER_DAY);

    return {
      eta_days: etaDays,
      eta_window_et: tailwind === null
        ? WIND_UNAVAILABLE_ET
        : formatEtaEt(etaDays),
      eta_basis: {
        distance_km: Math.round(distanceKm),
        travel_bearing_deg: Math.round(travelBearing),
        airspeed_kmh: airspeed,
        tailwind_kmh: tailwind === null ? null : Math.round(tailwind * 10) / 10,
        ground_kmh: Math.round(groundKmh * 10) / 10,
        hours_per_day: hoursPerDay,
        wind_label_et: windLabelEt(tailwind),
        source_date: source.date,
        site_label: site.label,
        wind_points: samples ? samples.length : 0,
        source: "open-meteo",
      },
    };
  } catch {
    return {
      eta_days: null,
      eta_window_et: WIND_UNAVAILABLE_ET,
      eta_basis: null,
    };
  }
}
