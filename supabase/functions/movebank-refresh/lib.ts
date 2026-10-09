// movebank-refresh pure helpers (P105c). No I/O here: everything is unit-testable.

// ---------------------------------------------------------------------------
// CSV (RFC 4180): quoted fields, "" escapes, CRLF/LF line ends, commas and
// newlines inside quotes. A trailing line break does not produce an empty row.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && !fieldStarted && field === "") {
      inQuotes = true;
      fieldStarted = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    fieldStarted = true;
    i++;
  }
  // Flush the last row unless the text ended exactly on a line break.
  if (field !== "" || fieldStarted || row.length > 0) endRow();
  return rows;
}

// First row is the header; every later row becomes {header: value}. Missing
// trailing cells become "". Fully empty lines are skipped.
export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === "") continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = cells[c] ?? "";
    out.push(obj);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Taxonomy

// First two whitespace-separated words ("Aquila chrysaetos chrysaetos" ->
// "Aquila chrysaetos"). Empty string for empty input.
export function binomial(name: string): string {
  return name.trim().split(/\s+/).filter((w) => w !== "").slice(0, 2).join(" ");
}

const SENSITIVE_GENERA: ReadonlySet<string> = new Set([
  "aquila",
  "clanga",
  "hieraaetus",
  "haliaeetus",
  "pandion",
  "circaetus",
  "gyps",
  "aegypius",
  "neophron",
  "gypaetus",
  "bubo",
  "strix",
]);

const SENSITIVE_SPECIES: ReadonlySet<string> = new Set([
  "falco peregrinus",
  "falco cherrug",
  "falco rusticolus",
  "ciconia nigra",
  "tetrao urogallus",
  "otis tarda",
]);

// Case-insensitive. Accepts a longer name too: only the binomial is compared.
export function isSensitive(name: string): boolean {
  const b = binomial(name).toLowerCase();
  if (b === "") return false;
  const genus = b.split(" ")[0];
  return SENSITIVE_GENERA.has(genus) || SENSITIVE_SPECIES.has(b);
}

// ---------------------------------------------------------------------------
// Geo

export function roundTo01(n: number): number {
  return Math.round(n * 10) / 10;
}

// Discover-time study filter: main_location within lat 25..75, lon -35..65.
export function inEuropeStudyBox(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= 25 && lat <= 75 && lon >= -35 && lon <= 65;
}

// ---------------------------------------------------------------------------
// Time

// Movebank CSV timestamps look like "2026-10-08 10:00:00.000" (UTC, no zone);
// JSON timestamps are epoch milliseconds. Returns epoch ms or null.
export function parseMovebankTime(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = value.trim();
  if (s === "") return null;
  if (/^\d+$/.test(s)) return Number(s);
  let iso = s.replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) iso += "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

// ---------------------------------------------------------------------------
// Movebank public/json payload -> newest fix per individual

export interface NewestFix {
  individualLocalIdentifier: string;
  taxonCanonicalName: string;
  timestamp: number;
  lat: number;
  lon: number;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null;
}

// Shape: { individuals: [{ individual_local_identifier, individual_taxon_canonical_name,
//   locations: [{ timestamp, location_lat, location_long }] }] }
// Individuals without a usable location are dropped.
export function extractNewestFixes(payload: unknown): NewestFix[] {
  const root = asRecord(payload);
  const inds = root && Array.isArray(root.individuals) ? root.individuals : [];
  const out: NewestFix[] = [];
  for (const raw of inds) {
    const ind = asRecord(raw);
    if (!ind) continue;
    const id = ind.individual_local_identifier;
    if (id === undefined || id === null) continue;
    const locs = Array.isArray(ind.locations) ? ind.locations : [];
    let best: { timestamp: number; lat: number; lon: number } | null = null;
    for (const l of locs) {
      const loc = asRecord(l);
      if (!loc) continue;
      const ts = parseMovebankTime(
        typeof loc.timestamp === "number" || typeof loc.timestamp === "string"
          ? loc.timestamp
          : null,
      );
      const lat = Number(loc.location_lat);
      const lon = Number(loc.location_long);
      if (ts === null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (best === null || ts > best.timestamp) best = { timestamp: ts, lat, lon };
    }
    if (best === null) continue;
    const taxon = ind.individual_taxon_canonical_name;
    out.push({
      individualLocalIdentifier: String(id),
      taxonCanonicalName: typeof taxon === "string" ? taxon : "",
      ...best,
    });
  }
  return out;
}

// Splits an array into chunks of `size`.
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
