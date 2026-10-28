// src/lib/hk/hkSummary.ts
// P170d: per-species summary of HK-accepted records for the Ulevaade "HK taust" box.
// Pure helpers only; fetching lives in src/features/overview/HkBackground.tsx.

export type HkRecordLite = {
  readonly taxon_sci: string;
  readonly year: number | null;
  readonly date_from: string | null;
};

export type HkSummary = {
  readonly total: number;
  readonly inMonth: number;
  readonly topYear: number | null;
  readonly topYearCount: number;
  readonly topYearUnique: boolean;
  readonly lastYear: number | null;
};

export type HkYearStat = { readonly value: string; readonly label: string };

const SCI_RE = /^[A-Z][a-z]+ [a-z-]+( [a-z-]+)?$/;

export const ET_MONTH_INESSIVE: readonly string[] = [
  'jaanuaris', 'veebruaris', 'm\u00e4rtsis', 'aprillis', 'mais', 'juunis',
  'juulis', 'augustis', 'septembris', 'oktoobris', 'novembris', 'detsembris',
];

/** True for a binomial or trinomial scientific name (what hk_species.taxon_sci holds). */
export function isHkTaxon(sci: string): boolean {
  return SCI_RE.test(sci.trim());
}

/** Records of the species itself or its subspecies; hybrids ("A x B") are left out. */
export function filterSpeciesRecords<T extends { readonly taxon_sci: string }>(recs: readonly T[], sci: string): T[] {
  const k = sci.trim();
  return recs.filter((r) => {
    const t = String(r.taxon_sci || '');
    return t === k || (t.startsWith(`${k} `) && !t.includes(' x '));
  });
}

function recordMonth(r: HkRecordLite): number {
  const m = r.date_from ? Number(r.date_from.slice(5, 7)) : 0;
  return m >= 1 && m <= 12 ? m : 0;
}

/** month is 1..12. */
export function summarizeHkRecords(recs: readonly HkRecordLite[], month: number): HkSummary {
  const perYear = new Map<number, number>();
  let inMonth = 0;
  for (const r of recs) {
    if (recordMonth(r) === month) inMonth += 1;
    const y = Number(r.year) || 0;
    if (y > 0) perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }
  const years = [...perYear.keys()];
  const topYearCount = years.length ? Math.max(...perYear.values()) : 0;
  const atMax = years.filter((y) => perYear.get(y) === topYearCount);
  const topYear = atMax.length ? Math.max(...atMax) : null;
  const lastYear = years.length ? Math.max(...years) : null;
  return { total: recs.length, inMonth, topYear, topYearCount, topYearUnique: atMax.length === 1, lastYear };
}

/** "rekordaasta (N leidu)" when one year clearly leads with 2+ records, else the latest year. */
export function pickYearStat(s: HkSummary): HkYearStat | null {
  if (s.topYear !== null && s.topYearUnique && s.topYearCount >= 2) {
    return { value: String(s.topYear), label: `rekordaasta (${s.topYearCount} leidu)` };
  }
  if (s.lastYear !== null) return { value: String(s.lastYear), label: 'viimane leid' };
  return null;
}

export function hkCreditText(reportNo: number | null | undefined, asOf: string | null | undefined): string {
  const nr = reportNo ? ` nr ${Number(reportNo)}` : '';
  const yr = asOf ? ` (${String(asOf).slice(0, 4)})` : '';
  return `Tekst: Eesti linnuharulduste komisjoni aruanne${nr}${yr}, Hirundo`;
}

/** Calendar month 1..12 in Europe/Tallinn. */
export function tallinnMonth(d: Date): number {
  try {
    const m = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Tallinn', month: 'numeric' }).format(d));
    if (m >= 1 && m <= 12) return m;
  } catch {
    /* fall through */
  }
  return d.getMonth() + 1;
}
