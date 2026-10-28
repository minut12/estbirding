// src/lib/hk/hkParse.ts
// Parsers for Estonian Rarities Committee (HK) sources: the EOÜ species checklist,
// the EOÜ "HK-s käsitlusele tulevate liikide nimekiri", the EOÜ list of all accepted
// HK records, and the yearly HK report in Hirundo. Input is text lines extracted
// from the PDFs (pdf.js) with a coarse role per line; output is plain rows.
// Nothing is inferred: unparseable dates stay null and raw text is always kept.

export type HkLineRole = "heading" | "section" | "body" | "small";
export type HkLine = { page: number; t: string; role: HkLineRole };
export type HkDatePrecision = "day" | "month" | "season" | "year" | "unknown";
export type HkSection = "A-C" | "D" | "E";
export type HkRecordStatus = "accepted" | "rejected";

export type HkParsedDate = {
  dateText: string;
  rest: string;
  dateFrom: string | null;
  dateTo: string | null;
  precision: HkDatePrecision;
  year: number | null;
};

export type HkChecklistRow = {
  taxonSci: string;
  speciesSci: string;
  isSubspecies: boolean;
  etName: string;
  etAltName: string | null;
  enName: string | null;
  code6: string | null;
  checklistNo: number | null;
  category: string;
};

export type HkListRow = {
  taxonSci: string;
  etName: string;
  section: HkSection | "historical";
  hkStatus: "current" | "historical";
  scopeEt: string | null;
};

export type HkRecord = {
  seq: number;
  taxonSci: string;
  headingEt: string;
  category: HkSection;
  status: HkRecordStatus;
  dateText: string;
  dateFrom: string | null;
  dateTo: string | null;
  precision: HkDatePrecision;
  year: number | null;
  place: string | null;
  kihelkond: string | null;
  county: string | null;
  county2021: string | null;
  individualsText: string | null;
  countMin: number | null;
  evidence: string[];
  observers: string[];
  breeding: boolean;
  locationInherited: boolean;
  rejectionReasonEt: string | null;
  page: number;
  rawText: string;
};

export type HkReportSpecies = {
  taxonSci: string;
  headingEt: string;
  category: HkSection;
  countsText: string | null;
  recordsBefore: number | null;
  indsBefore: number | null;
  recordsYear: number | null;
  indsYear: number | null;
  scopeEt: string | null;
  originTextEt: string | null;
  nthRecordEt: string | null;
  removedFromYear: number | null;
  page: number;
};

/* ---------- dates ---------- */

const YEAR = "(?:1[6-9]\\d\\d|20\\d\\d)";
const SEASON_WORDS = /^(suvi|suve|suvel|kevad|kevadel|sügis|sügisel|talv|talvel)$/i;
const LEAD_WORD = "(?:suvi|suvel|suve|kevadel|kevad|sügisel|sügis|talvel|talv|lõpul|lõpp|alguses|algus|keskpaik|keskel|enne|umbes|u\\.|ca\\.?)";
const CENTURY_RE = /^((?:XVIII|XIX|XXI|XX)\s+saj\.?(?:\s+(?:alguses|algus|lõpul|lõpp|keskpaik|keskel))?\??)\s+([\s\S]*)$/;
const DATE_TOKEN = /^(?:[\d.,\-–/()]+|[\d.\-–]*ca\d[\d.]*|\d{4}-ndad\??|ja|või|ja\/või|vahel|jj\.?|I|II|III|IV|pool|[\d.\-–/]*(?:lõpul|lõpp|alguses|algus|keskpaik|keskel)[\d.\-–/]*|[a-zõäöü]*(?:suvi|suvel|suve|kevadel|kevad|sügisel|sügis|talvel|talv)[a-zõäöü-]*|enne|umbes|u\.|ca\.?)$/i;
const YEAR_TOKEN = new RegExp(`(?<!\\d)${YEAR}(?!\\d)`);
const TRAILING_TOKEN = /^(?:jj\.?|vahel|suvi|suvel|kevad|kevadel|sügis|sügisel|talv|talvel)$/i;
const REST_START = /^[A-ZÄÖÜÕŠŽ(♂♀>\d]/;

type DatePart = { d: number | null; m: number | null; y: number | null };

function parsePart(p: string): DatePart | null {
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(p))) return { d: +m[1], m: +m[2], y: +m[3] };
  if ((m = /^(\d{1,2})\.(\d{1,2})\.$/.exec(p))) return { d: +m[1], m: +m[2], y: null };
  if ((m = /^(\d{1,2})\.$/.exec(p))) return { d: +m[1], m: null, y: null };
  if ((m = /^(\d{1,2})\.(\d{4})$/.exec(p))) return { d: null, m: +m[1], y: +m[2] };
  if ((m = /^(\d{4})$/.exec(p))) return { d: null, m: null, y: +m[1] };
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function rangeOf(dateText: string): Omit<HkParsedDate, "dateText" | "rest"> {
  const wordMatch = new RegExp(`^(${LEAD_WORD})\\s+`, "i").exec(dateText);
  const word = wordMatch ? wordMatch[1] : null;
  const core = (word ? dateText.slice(wordMatch![0].length) : dateText).trim();
  const firstYear = new RegExp(YEAR).exec(core);
  const yearGuess = firstYear ? +firstYear[0] : null;
  const unknown = { dateFrom: null, dateTo: null, precision: "unknown" as HkDatePrecision, year: yearGuess };
  if (core.includes("/")) return unknown;

  const raw = core.split(/\s*(?:[-–,]|\bja\b)\s*/).map((s) => s.trim()).filter(Boolean);
  const parts: DatePart[] = [];
  for (const r of raw) {
    const p = parsePart(r);
    if (!p) return unknown;
    parts.push(p);
  }
  for (let i = parts.length - 2; i >= 0; i--) {
    const next = parts[i + 1];
    if (parts[i].d !== null && parts[i].m === null) parts[i].m = next.m;
    if (parts[i].y === null) parts[i].y = next.y;
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || first.y === null || last.y === null) return unknown;

  if (parts.every((p) => p.d !== null && p.m !== null)) {
    const from = iso(first.y, first.m!, first.d!);
    const to = iso(last.y, last.m!, last.d!);
    if (!from || !to) return unknown;
    return { dateFrom: from, dateTo: to, precision: "day", year: first.y };
  }
  if (parts.every((p) => p.d === null && p.m !== null)) {
    const from = iso(first.y, first.m!, 1);
    const to = iso(last.y, last.m!, lastDay(last.y, last.m!));
    if (!from || !to) return unknown;
    return { dateFrom: from, dateTo: to, precision: "month", year: first.y };
  }
  if (parts.every((p) => p.d === null && p.m === null)) {
    const precision: HkDatePrecision = word && SEASON_WORDS.test(word) ? "season" : "year";
    return { dateFrom: null, dateTo: null, precision, year: first.y };
  }
  return unknown;
}

export function parseLeadingDate(text: string): HkParsedDate | null {
  const s = text.trim();
  const c = CENTURY_RE.exec(s);
  if (c) {
    if (!REST_START.test(c[2])) return null;
    return { dateText: c[1], rest: c[2].trim(), dateFrom: null, dateTo: null, precision: "unknown", year: null };
  }
  const tokens = s.split(" ");
  if (/^(ja|või|vahel|jj\.?)$/i.test(tokens[0] ?? "")) return null;
  let lastYear = -1;
  for (let i = 0; i < tokens.length && DATE_TOKEN.test(tokens[i]); i++) {
    if (YEAR_TOKEN.test(tokens[i])) lastYear = i;
  }
  if (lastYear < 0) return null;
  let end = lastYear;
  while (TRAILING_TOKEN.test(tokens[end + 1] ?? "")) end += 1;
  const dateText = tokens.slice(0, end + 1).join(" ");
  const rest = tokens.slice(end + 1).join(" ").trim();
  if (!REST_START.test(rest)) return null;
  return { dateText, rest, ...rangeOf(dateText) };
}

/* ---------- taxa ---------- */

type TaxonIndex = { sorted: string[]; genera: Set<string> };

function indexTaxa(known: string[]): TaxonIndex {
  const sorted = [...new Set(known)].sort((a, b) => b.length - a.length);
  return { sorted, genera: new Set(sorted.map((s) => s.split(" ")[0])) };
}

function resolveTaxon(text: string, idx: TaxonIndex, loose = false): { sci: string; start: number; end: number } | null {
  for (const sci of idx.sorted) {
    let from = 0;
    while (true) {
      const i = text.indexOf(sci, from);
      if (i < 0) break;
      const before = i === 0 ? " " : text[i - 1];
      const after = text[i + sci.length] ?? " ";
      if (/[\s(,]/.test(before) && !/[a-zäöüõšž]/.test(after)) {
        const tail = text.slice(i + sci.length);
        const ext = /^ ([a-z]+\/[a-z/]+)/.exec(tail);
        const hybrid = /^ x ([A-Z][a-z]+ [a-z]+)/.exec(tail);
        const full = ext ? `${sci} ${ext[1]}` : hybrid ? `${sci} x ${hybrid[1]}` : sci;
        return { sci: full, start: i, end: i + full.length };
      }
      from = i + 1;
    }
  }
  const re = /\b([A-Z][a-z]+) (sp\.|[a-z]{3,})(?: ([a-z]{3,}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!loose && !idx.genera.has(m[1])) continue;
    const sci = m[2] === "sp." ? `${m[1]} sp.` : m[0];
    return { sci, start: m.index, end: m.index + sci.length };
  }
  return null;
}

/* ---------- record text ---------- */

const EVIDENCE_RE = /^(foto|fotod|video|videod|helisalvestis|helisalvestised|automaatsalvestis|automaatsalvestised|rõngastatud|lastud|topis|kollektsioon|muuseum|salvestis|leitud|surnud|nahk|preparaat)/i;
const COUNTY_RE = /^((?:[A-ZÄÖÜÕŠŽ][a-zäöüõšž]+-)?[A-ZÄÖÜÕŠŽ][a-zäöüõšž]*maa)(?:\s*=\s*((?:[A-ZÄÖÜÕŠŽ][a-zäöüõšž]+-)?[A-ZÄÖÜÕŠŽ][a-zäöüõšž]+)\s+mk)?(?:\s+([\s\S]*))?$/;

type PlaceMemo = { place: string; kihelkond: string | null; county: string | null; county2021: string | null };

type ParsedLocation = {
  place: string | null;
  kihelkond: string | null;
  county: string | null;
  county2021: string | null;
  individualsText: string | null;
  evidence: string[];
  observers: string[];
  locationInherited: boolean;
};

function balance(s: string): number {
  return (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length;
}

function cleanText(s: string): string {
  return s
    .replace(/‐/g, "-")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNames(g: string): string[] {
  return g
    .split(/,\s*|\s+ja\s+/)
    .map((n) => n.replace(/\s+(jt|jpt|jm)\.?$/, "").trim())
    .filter((n) => n === "anon" || /^[A-ZÄÖÜÕŠŽÅ]/.test(n));
}

function nonEmpty(s: string): string | null {
  const t = s.replace(/^[,.;\s]+|[,.;\s]+$/g, "");
  return t ? t : null;
}

function findPlace(first: string, memo: PlaceMemo[]): PlaceMemo | undefined {
  return [...memo]
    .sort((a, b) => b.place.length - a.place.length)
    .find((p) => first === p.place || first.startsWith(`${p.place} `));
}

function parseLocation(rest: string, memos: PlaceMemo[][]): ParsedLocation {
  const evidence: string[] = [];
  const observers: string[] = [];
  let main = rest.replace(/\(([^()]*)\)/g, (_all, g: string) => {
    const items = g.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
    if (items.length && EVIDENCE_RE.test(items[0])) evidence.push(...items);
    else observers.push(...splitNames(g.trim()));
    return " ";
  });
  const open = main.indexOf("(");
  if (open >= 0) {
    observers.push(...splitNames(main.slice(open + 1).trim()));
    main = main.slice(0, open);
  }
  main = main.replace(/\s+/g, " ").replace(/[\s.]+$/, "").trim();
  const segs = main.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  const base = { evidence, observers, locationInherited: false };

  const khk = segs.findIndex((s) => /\skhk\.?$/.test(s));
  if (khk >= 0) {
    const after = segs.slice(khk + 1).join(", ");
    const cm = COUNTY_RE.exec(after);
    return {
      ...base,
      place: nonEmpty(segs.slice(0, khk).join(", ")),
      kihelkond: segs[khk].replace(/\s+khk\.?$/, ""),
      county: cm ? cm[1] : null,
      county2021: cm?.[2] ?? null,
      individualsText: cm ? nonEmpty(cm[3] ?? "") : nonEmpty(after),
    };
  }
  const ci = segs.findIndex((s) => COUNTY_RE.test(s));
  if (ci >= 0) {
    const cm = COUNTY_RE.exec(segs[ci])!;
    const tail = [cm[3] ?? "", ...segs.slice(ci + 1)].filter(Boolean).join(", ");
    return {
      ...base,
      place: nonEmpty(segs.slice(0, ci).join(", ")),
      kihelkond: null,
      county: cm[1],
      county2021: cm[2] ?? null,
      individualsText: nonEmpty(tail),
    };
  }
  const first = segs[0] ?? "";
  let hit: PlaceMemo | undefined;
  for (const memo of memos) {
    hit = findPlace(first, memo);
    if (hit) break;
  }
  if (hit) {
    const tail = [first.slice(hit.place.length).trim(), ...segs.slice(1)].filter(Boolean).join(", ");
    return { ...base, place: hit.place, kihelkond: hit.kihelkond, county: hit.county, county2021: hit.county2021, individualsText: nonEmpty(tail), locationInherited: true };
  }
  return { ...base, place: nonEmpty(first), kihelkond: null, county: null, county2021: null, individualsText: nonEmpty(segs.slice(1).join(", ")) };
}

function countMinOf(ind: string | null): number | null {
  if (!ind) return null;
  const m = /^(?:>|ca\.?\s*|u\.\s*)?(\d+)(?:\s?[-–]\s?\d+)?(?=\s|$)/.exec(ind);
  return m ? +m[1] : null;
}

type RecordCtx = { seq: number; taxonSci: string; headingEt: string; category: HkSection; status: HkRecordStatus; page: number; memo: PlaceMemo[]; globalMemo: PlaceMemo[] };

function buildRecord(raw: string, ctx: RecordCtx): HkRecord | null {
  const rawText = cleanText(raw);
  const d = parseLeadingDate(rawText);
  if (!d) return null;
  const loc = parseLocation(d.rest, [ctx.memo, ctx.globalMemo]);
  if (!loc.locationInherited && loc.place && (loc.kihelkond || loc.county)) {
    const names = new Set([loc.place, loc.place.split(", ")[0]]);
    for (const place of names) {
      const entry = { place, kihelkond: loc.kihelkond, county: loc.county, county2021: loc.county2021 };
      ctx.memo.push(entry);
      ctx.globalMemo.push(entry);
    }
  }
  return {
    seq: ctx.seq,
    taxonSci: ctx.taxonSci,
    headingEt: ctx.headingEt,
    category: ctx.category,
    status: ctx.status,
    dateText: d.dateText,
    dateFrom: d.dateFrom,
    dateTo: d.dateTo,
    precision: d.precision,
    year: d.year,
    place: loc.place,
    kihelkond: loc.kihelkond,
    county: loc.county,
    county2021: loc.county2021,
    individualsText: loc.individualsText,
    countMin: countMinOf(loc.individualsText),
    evidence: loc.evidence,
    observers: loc.observers,
    breeding: /pesitse|\bpesa\b|\bpull\b|poega|pojaga|haudu/i.test(rawText),
    locationInherited: loc.locationInherited,
    rejectionReasonEt: null,
    page: ctx.page,
    rawText,
  };
}

function splitBlocker(raw: string, lines: number): boolean {
  return (balance(raw) > 0 && lines < 4) || /(\sja|[-–,])$/.test(raw.trim());
}

/* ---------- EOÜ checklist ---------- */

const SP_RE = /^(\d+)\s+(.+?)\s+([A-Z][a-z]+ [a-z]+)(?: [a-z]+)?(?: \([^)]*\))?\s+([A-Z]{6})\s+(.+?)\s+([A-E])$/;
const SSP_RE = /^(.+?)\s+([A-Z][a-z]+ [a-z]+ [a-z]+)$/;

function splitEt(et: string): { etName: string; etAltName: string | null } {
  const [a, b] = et.split(/\s+e\s+/);
  return { etName: a.trim(), etAltName: b ? b.trim() : null };
}

export function parseChecklist(lines: HkLine[]): HkChecklistRow[] {
  const out: HkChecklistRow[] = [];
  let parent: HkChecklistRow | null = null;
  for (const l of lines) {
    const t = l.t.replace(/\s+/g, " ").trim();
    const sp = SP_RE.exec(t);
    if (sp) {
      parent = {
        taxonSci: sp[3],
        speciesSci: sp[3],
        isSubspecies: false,
        ...splitEt(sp[2]),
        enName: sp[5],
        code6: sp[4],
        checklistNo: +sp[1],
        category: sp[6],
      };
      out.push(parent);
      continue;
    }
    const ssp = SSP_RE.exec(t);
    if (ssp && parent && ssp[2].startsWith(`${parent.speciesSci} `)) {
      out.push({
        taxonSci: ssp[2],
        speciesSci: parent.speciesSci,
        isSubspecies: true,
        ...splitEt(ssp[1]),
        enName: null,
        code6: null,
        checklistNo: null,
        category: parent.category,
      });
    }
  }
  return out;
}

/* ---------- EOÜ list of species reviewed by HK ---------- */

export function parseHkSpeciesList(lines: HkLine[], known: string[]): HkListRow[] {
  const idx = indexTaxa(known);
  const out: HkListRow[] = [];
  let section: HkSection | "historical" | null = null;
  let pending: string | null = null;
  for (const l of lines) {
    const t = l.t.replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (/^IV\.\s/.test(t)) { section = "historical"; pending = null; continue; }
    if (/^III\.\s/.test(t)) { section = "E"; pending = null; continue; }
    if (/^II\.\s/.test(t)) { section = "D"; pending = null; continue; }
    if (/^I\.\s/.test(t)) { section = "A-C"; pending = null; continue; }
    if (!section) continue;
    const tx = resolveTaxon(t, idx);
    if (!tx) { pending = t; continue; }
    const before = t.slice(0, tx.start).trim().replace(/,$/, "");
    const after = t.slice(tx.end).trim();
    out.push({
      taxonSci: tx.sci,
      etName: before || pending || "",
      section,
      hkStatus: section === "historical" ? "historical" : "current",
      scopeEt: after || null,
    });
    pending = null;
  }
  return out;
}

/* ---------- EOÜ list of all accepted HK records ---------- */

export function parseAcceptedList(lines: HkLine[], known: string[]): HkRecord[] {
  const idx = indexTaxa(known);
  const out: HkRecord[] = [];
  let section: HkSection = "A-C";
  let heading: { text: string; sci: string; memo: PlaceMemo[] } | null = null;
  let pendingHead: string | null = null;
  let cur: { raw: string; page: number; lines: number } | null = null;
  const globalMemo: PlaceMemo[] = [];

  const flush = () => {
    if (cur && heading) {
      const r = buildRecord(cur.raw, { seq: out.length, taxonSci: heading.sci, headingEt: heading.text, category: section, status: "accepted", page: cur.page, memo: heading.memo, globalMemo });
      if (r) out.push(r);
    }
    cur = null;
  };

  for (const l of lines) {
    const t = l.t.replace(/\s+/g, " ").trim();
    if (!t || /^\d{1,3}$/.test(t)) continue;
    if (/^II\s+Kategooria\s+D/i.test(t)) { flush(); section = "D"; continue; }
    if (/^III\s+Kategooria\s+E/i.test(t)) { flush(); section = "E"; continue; }
    if (/^I\s+Kategooriad/i.test(t) || /^asurkonna moodustanud/i.test(t)) continue;

    const blocked = cur !== null && splitBlocker(cur.raw, cur.lines);
    const dated = parseLeadingDate(t) !== null;
    if (l.role === "heading" && !dated) {
      const text: string = pendingHead ? `${pendingHead} ${t}` : t;
      const tx = resolveTaxon(text, idx);
      if (tx && (!blocked || (!text.slice(0, tx.start).includes(")") && /^[A-ZÄÖÜÕŠŽ]/.test(text)))) {
        flush();
        heading = { text, sci: tx.sci, memo: [] };
        pendingHead = null;
        continue;
      }
      if (!cur && !tx) { pendingHead = text; continue; }
    }
    if (dated && !blocked) {
      flush();
      cur = { raw: t, page: l.page, lines: 1 };
      continue;
    }
    if (cur) {
      cur.raw += ` ${t}`;
      cur.lines += 1;
    }
  }
  flush();
  return out;
}

/* ---------- Hirundo yearly HK report ---------- */

const COUNT = "(X|x|ca\\s?\\d+|>?\\d+)";
const COUNTS_RE = new RegExp(`\\(\\s*(${COUNT}\\s*\\/\\s*${COUNT}\\s*[–-]\\s*${COUNT}\\s*\\/\\s*${COUNT})\\s*\\)`);
const NTH_RE = /^(Eesti\s+\d+\.(?:\s?(?:[-–]|ja)\s?\d+\.)*\s+leid|Esmasleid)\.\s*/;
const REMOVED_RE = /(\d{4})\.\s+aastast\s+HK-s\s+käsitletavate\s+liikide\s+nimestikust\s+välja/;

function countNum(v: string): number | null {
  return v.toUpperCase() === "X" ? null : +v.replace(/\D/g, "");
}

function joinWrapped(lines: string[]): string {
  let s = "";
  for (const raw of lines) {
    const l = raw.trim();
    if (!s) { s = l; continue; }
    s = s.replace(/\s+-$/, "-");
    if (/[a-zäöüõšž]-$/.test(s) && /^[a-zäöüõšž]/.test(l) && !/^(ja|või|ning|ega)\b/.test(l)) s = s.slice(0, -1) + l;
    else if (/[a-zäöüõšž]-$/.test(s) && /^[A-ZÄÖÜÕŠŽ]/.test(l)) s = s + l;
    else s = `${s} ${l}`;
  }
  return cleanText(s);
}

type ReportBlock = {
  heading: string;
  sci: string;
  category: HkSection;
  status: HkRecordStatus;
  page: number;
  records: HkRecord[];
  text: string[];
  memo: PlaceMemo[];
};

export function parseHirundoReport(lines: HkLine[], known: string[]): { species: HkReportSpecies[]; rejected: HkRecord[] } {
  const idx = indexTaxa(known);
  const species: HkReportSpecies[] = [];
  const rejected: HkRecord[] = [];
  let started = false;
  let status: HkRecordStatus = "accepted";
  let section: HkSection = "A-C";
  let block: ReportBlock | null = null;
  let cur: { raw: string; page: number; lines: number } | null = null;
  let seq = 0;
  const globalMemo: PlaceMemo[] = [];

  const flushRecord = () => {
    if (cur && block) {
      const r = buildRecord(cur.raw, { seq, taxonSci: block.sci, headingEt: block.heading, category: block.category, status: block.status, page: cur.page, memo: block.memo, globalMemo });
      if (r) { block.records.push(r); seq += 1; }
    }
    cur = null;
  };
  const flushBlock = () => {
    flushRecord();
    const b: ReportBlock | null = block;
    if (!b) return;
    const text: string = b.text.length ? joinWrapped(b.text) : "";
    if (b.status === "rejected") {
      for (const r of b.records) rejected.push({ ...r, rejectionReasonEt: text || null });
    } else {
      const counts = COUNTS_RE.exec(b.heading);
      const scopes = [...b.heading.matchAll(/\(([^()]*)\)/g)]
        .map((m) => m[1].trim())
        .filter((g) => !COUNTS_RE.test(`(${g})`));
      const nth = NTH_RE.exec(text);
      const origin = nth ? text.slice(nth[0].length).trim() : text;
      const removed = REMOVED_RE.exec(text);
      species.push({
        taxonSci: b.sci,
        headingEt: b.heading,
        category: b.category,
        countsText: counts ? counts[1].replace(/\s+/g, " ").trim() : null,
        recordsBefore: counts ? countNum(counts[2]) : null,
        indsBefore: counts ? countNum(counts[3]) : null,
        recordsYear: counts ? countNum(counts[4]) : null,
        indsYear: counts ? countNum(counts[5]) : null,
        scopeEt: scopes.length ? scopes.join("; ") : null,
        originTextEt: origin || null,
        nthRecordEt: nth ? nth[1] : null,
        removedFromYear: removed ? +removed[1] : null,
        page: b.page,
      });
    }
    block = null;
  };

  for (const l of lines) {
    const t = l.t.replace(/\s+/g, " ").trim();
    if (!t || l.role === "small") continue;
    if (/^Linnuharuldused Eestis \d{4}:/.test(t) || /^\d+\s+\d+$/.test(t) || /^\d{1,3}$/.test(t)) continue;

    if (l.role === "section") {
      const norm = t.toLowerCase().replace(/\s+/g, "");
      if (/tänu|kirjandus|summary/.test(norm) && started) { flushBlock(); break; }
      if (!/tunnusta/.test(norm)) continue;
      flushBlock();
      started = true;
      if (norm.includes("tunnustamata")) status = "rejected";
      else {
        status = "accepted";
        section = norm.includes("ebaselge") ? "D" : norm.includes("vangistusest") ? "E" : "A-C";
      }
      continue;
    }
    if (!started) continue;

    const dated = parseLeadingDate(t) !== null;
    const blocked = cur !== null && splitBlocker(cur.raw, cur.lines);
    if (l.role === "heading" && !dated && !blocked) {
      const tx = resolveTaxon(t, idx, true);
      if (tx) {
        flushBlock();
        block = { heading: t, sci: tx.sci, category: section, status, page: l.page, records: [], text: [], memo: [] };
        continue;
      }
    }
    if (!block) continue;
    if (dated && !blocked && block.text.length === 0) {
      flushRecord();
      cur = { raw: t, page: l.page, lines: 1 };
      continue;
    }
    const open = cur !== null && !/\.["”]?\s*$/.test(cur.raw);
    if (cur && (open || /^(sama|samas|tõenäoliselt sama)\b/i.test(t))) {
      cur.raw += ` ${t}`;
      cur.lines += 1;
      continue;
    }
    flushRecord();
    block.text.push(t);
  }
  flushBlock();
  return { species, rejected };
}

/* ---------- post-processing ---------- */

// A compound name like "puna-veetallaja" split as "puna-" / "veetallajat" at a line
// end is indistinguishable from a syllable break, so joinWrapped drops the hyphen.
// Put it back for the hyphenated Estonian names we know (case kept, any case ending).
export function restoreCompoundHyphens(text: string, etNames: string[]): string {
  let out = text;
  for (const name of etNames) {
    if (!name.includes("-")) continue;
    const joined = name.replace(/-/g, "");
    const re = new RegExp(`(^|[^\\p{L}])(${joined})`, "giu");
    out = out.replace(re, (_m, pre: string, word: string) => {
      let i = 0;
      const rebuilt = name.split("").map((ch) => (ch === "-" ? "-" : word[i++])).join("");
      return pre + rebuilt;
    });
  }
  return out;
}

/* ---------- line roles for Hirundo HK reports of any year ---------- */

export type HkRawLine = { page: number; t: string };

const SECTION_START = /^(tunnustatud teated|tunnustamata teated|tänuavaldused|tänuavaldus|kasutatud kirjandus|summary)\b/i;
const RUNNING_HEADS = [
  /^\d{0,3}\s*Eesti linnuharulduste komisjoni aruanne/i,
  /^\d{0,3}\s*Linnuharuldused Eestis \d{4}/,
  /^\d{0,3}\s*[A-ZÄÖÜÕŠŽ][\p{L}-]+,\s*[A-Z]\.(?:\s*[A-Z]\.)?\s*(?:&|ja)\s*[A-ZÄÖÜÕŠŽ][\p{L}-]+,\s*[A-Z]\.\s*\d{0,3}$/u,
  /^Hirundo \d{4},\s*\d+/,
  /^ARUANNE$/,
  // P174: 2010-2013 layouts: "Hirundo 23(1), 2010 17" and "Ots ja Paal: Linnuharuldused Eestis 201246"
  /^Hirundo \d+\(\d\),\s*\d{4}\s*\d{0,3}$/,
  /^[A-ZÄÖÜÕŠŽ][\p{L}-]+ ja [A-ZÄÖÜÕŠŽ][\p{L}-]+: Linnuharuldused Eestis \d{4}/u,
];
// P174: an old-layout running head that pdf.js glued into a text line; cut out before classifying.
const INLINE_RUNNING_HEAD = /\s*Hirundo \d+\(\d\),\s*\d{4}\s?\d{1,3}(?=\s|$)/g;
const PARENS_ONLY = /^(\s*\([^()]*\))+\s*\.?$/;
const ET_WORD = /^[\p{L}-]+,?$/u;
// A heading whose genus is not in the known list (older names such as Ixobrychus) must still
// look Latin; this keeps wrapped prose like "Euroopas ning" or "Briti saartel" out.
const LOOSE_EPITHET = /(us|a|um|is|i|ae|ii|es|os|on|ax|ex|ix|ox)$/;
const LOOSE_GENUS_BAD = /(sse|st|lt|le|ga|ks|ni|el|al|il|ul|as|es|is|ad|ed|id|l)$/;

function isReportHeading(t: string, idx: TaxonIndex): boolean {
  if (!/^[A-ZÄÖÜÕŠŽ]/.test(t) || parseLeadingDate(t)) return false;
  const tx = resolveTaxon(t, idx, true);
  if (!tx) return false;
  const before = t.slice(0, tx.start).trim().split(/\s+/).filter(Boolean);
  if (before.length < 1 || before.length > 6 || !before.every((w) => ET_WORD.test(w) && !w.endsWith(","))) return false;
  const [genus, epithet] = tx.sci.split(" ");
  if (!idx.genera.has(genus) && (LOOSE_GENUS_BAD.test(genus) || !LOOSE_EPITHET.test(epithet ?? ""))) return false;
  const after = t.slice(tx.end);
  if (/^(\s*\([^()]*\))*\s*\.?$/.test(after)) return true;
  // a known taxon may be followed by a short scope in words, e.g. "Alca torda pesitsemine"
  // P174: ... or by a date range, e.g. "pesitsemine ja vaatlused 15.V – 31.VII"
  return idx.sorted.includes(tx.sci)
    && /^(\s+[a-zõäöüšž,-]+){1,5}(\s+\d{1,2}\.[IVX]+\s*[–-]\s*\d{1,2}\.[IVX]+)?(\s*\([^()]*\))*\s*\.?$/.test(after);
}

// Roles for pdf.js text lines of a Hirundo HK report when font sizes cannot be trusted
// (older two-column layouts): sections and species headings are recognised by their text,
// running heads become "small", and a counts line "(25/45 – 3/3)" wrapped below its
// heading is merged into it.
export function classifyHirundoLines(raw: HkRawLine[], known: string[]): HkLine[] {
  const idx = indexTaxa(known);
  const out: HkLine[] = [];
  for (const r of raw) {
    const t0 = r.t.normalize("NFC").replace(/\s+/g, " ").trim();
    const isHead = RUNNING_HEADS.some((re) => re.test(t0));
    const t = isHead ? t0 : t0.replace(INLINE_RUNNING_HEAD, "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const prev = out[out.length - 1];
    if (PARENS_ONLY.test(t) && prev && prev.role === "heading" && !COUNTS_RE.test(prev.t)) {
      prev.t = `${prev.t} ${t}`;
      continue;
    }
    let role: HkLineRole = "body";
    if (SECTION_START.test(t)) role = "section";
    else if (isHead) role = "small";
    else if (isReportHeading(t, idx)) role = "heading";
    out.push({ page: r.page, t, role });
  }
  return out;
}
