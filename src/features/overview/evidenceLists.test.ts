import { describe, expect, it } from 'vitest';
import {
  ARROW,
  MIDDOT,
  NDASH,
  TEXT,
  chanceChip,
  chancePeriodLine,
  countLine,
  currentTallinnMonth,
  firstOccurrences,
  hkSentence,
  HOOAEG_HALFWIDTH_DAYS,
  hooSinceLine,
  hooWindowLine,
  hooWindowRange,
  jubaLine,
  monthBars,
  monthChartLabel,
  moveLine,
  parseEvidenceLists,
  staySentence,
  trackLine,
  type SightingEvent,
} from './evidenceLists';

// Trimmed real payload shape (toenaosus_raport.evidence_lists, 15 Nov 2026).
// Estonian names are ASCII-folded here (this file must stay ASCII).
const MANNI_EVENTS: SightingEvent[] = [
  { date: '2026-11-12', country_code: 'FI', location: 'Kristiinankaupunki, Pohjanmaa, FI', lat: 62.27, lon: 21.38, km_to_turi: 431, count: 3 },
  { date: '2026-11-15', country_code: 'FI', location: 'Pomarkku, Satakunta, FI', lat: 61.69, lon: 22.01, km_to_turi: 376, count: 2 },
];

const PAYLOAD = {
  version: 'v5-evidence',
  as_of: '2026-11-15',
  juba_eestis: [
    {
      species_et: 'Kaelus-kiirlind', species_lat: 'Phoenicurus ochruros', ebird_code: 'blkred',
      rarity_level: 'rare', avatar_url: null, first_date: '2026-11-07', last_date: '2026-11-09',
      n_obs: 15, max_count: 1, counties: ['Tartu maakond'],
      stay: { n_birds: 5, n_multi_day: 2, n_over_3d: 1 },
      hk: { accepted_records: 12, months: [10, 11] },
    },
    { species_et: 'broken' }, // malformed: dropped
  ],
  lahenemas: [
    {
      species_et: 'Manni-kabilind', species_lat: 'Loxia pytyopsittacus', ebird_code: 'parcro2',
      rarity_level: 'super', avatar_url: null, kind: 'track', events: MANNI_EVENTS,
      latest_km: 376, hooaeg_years: 4,
    },
    { species_et: 'X', species_lat: 'Y', ebird_code: 'xx', rarity_level: 'rare', kind: 'near', events: [], latest_km: 1, hooaeg_years: null },
  ],
  hooaeg: [
    {
      species_et: 'Kaelus-kiirlind', species_lat: 'Phoenicurus ochruros', ebird_code: 'blkred',
      rarity_level: 'rare', avatar_url: null, years_in_window_since_1990: 9, years_in_window_last10: 6,
      last_year_in_window: 2025, years_by_month: [0, 0, 1, 4, 3, 1, 0, 0, 2, 8, 6, 1],
      sites: [{ lat: 58.38, lon: 26.72, label: 'Tartu', county: 'Tartu maakond', n_days: 3 }],
    },
  ],
  diag: { rarity_species: 120, errors: [], elapsed_ms: 812 },
};

describe('parseEvidenceLists', () => {
  it('accepts a trimmed real payload and drops malformed items', () => {
    const lists = parseEvidenceLists(PAYLOAD);
    expect(lists).not.toBeNull();
    expect(lists!.as_of).toBe('2026-11-15');
    expect(lists!.juba_eestis).toHaveLength(1);
    expect(lists!.lahenemas).toHaveLength(1); // the item with no events is dropped
    expect(lists!.lahenemas[0].events).toHaveLength(2);
    expect(lists!.hooaeg[0].years_by_month).toHaveLength(12);
  });

  it('rejects null, non-objects and the wrong version', () => {
    expect(parseEvidenceLists(null)).toBeNull();
    expect(parseEvidenceLists('x')).toBeNull();
    expect(parseEvidenceLists({ ...PAYLOAD, version: 'v4' })).toBeNull();
    expect(parseEvidenceLists({ ...PAYLOAD, hooaeg: undefined })).toBeNull();
  });
});

describe('staySentence', () => {
  it('n=30, m=1, k=0 fills stay_counts', () => {
    const s = staySentence({ n_birds: 30, n_multi_day: 1, n_over_3d: 0 });
    expect(s).toBe(TEXT.stay_counts.replace('{n}', '30').replace('{m}', '1').replace('{k}', '0'));
    expect(s).not.toContain('{');
  });

  it('null or a single bird gives stay_none', () => {
    expect(staySentence(null)).toBe(TEXT.stay_none);
    expect(staySentence({ n_birds: 1, n_multi_day: 0, n_over_3d: 0 })).toBe(TEXT.stay_none);
  });

  it('old raport shape (median_days / pct_over_3d) parses to null -> stay_none', () => {
    const old = {
      ...PAYLOAD,
      juba_eestis: [{ ...PAYLOAD.juba_eestis[0], stay: { n_birds: 5, median_days: 2, pct_over_3d: 40 } }],
    };
    const parsed = parseEvidenceLists(old);
    expect(parsed).not.toBeNull();
    const item = parsed?.juba_eestis[0];
    expect(item?.stay).toBeNull();
    expect(staySentence(item?.stay ?? null)).toBe(TEXT.stay_none);
  });
});

describe('hkSentence', () => {
  it('null stays null; otherwise counts accepted records', () => {
    expect(hkSentence(null)).toBeNull();
    expect(hkSentence({ accepted_records: 12, months: [10] })).toBe(TEXT.hk.replace('{n}', '12'));
  });
});

describe('jubaLine', () => {
  const base = { n_obs: 15, first_date: '2026-11-07', last_date: '2026-11-09', counties: ['Tartu maakond'] };

  it('formats count, date range and county', () => {
    expect(jubaLine(base)).toBe(`15 vaatlust ${MIDDOT} 7.${NDASH}9. nov ${MIDDOT} Tartu maakond`);
  });

  it('joins two counties with ja and uses vaatlus for one', () => {
    expect(jubaLine({ ...base, counties: ['Tartu maakond', 'Harju maakond'] }))
      .toBe(`15 vaatlust ${MIDDOT} 7.${NDASH}9. nov ${MIDDOT} Tartu maakond ja Harju maakond`);
    expect(jubaLine({ ...base, n_obs: 1, first_date: '2026-11-09', counties: [] }))
      .toBe(`1 vaatlus ${MIDDOT} 9. nov`);
  });
});

describe('trackLine / moveLine', () => {
  it('Manni-kabilind: 12 Nov 431 km Kristiinankaupunki -> 15 Nov 376 km Pomarkku', () => {
    expect(trackLine(MANNI_EVENTS)).toBe(`Kristiinankaupunki 12. nov ${ARROW} Pomarkku 15. nov`);
    expect(moveLine(MANNI_EVENTS)).toBe(TEXT.move.replace('{a}', '431').replace('{b}', '376'));
    expect(countLine(MANNI_EVENTS)).toBe(`2 ${TEXT.ind_many}`);
  });

  it('single event', () => {
    const one = [MANNI_EVENTS[1]];
    expect(trackLine(one)).toBe(`Pomarkku ${MIDDOT} 15. nov`);
    expect(moveLine(one)).toBe(TEXT.distance.replace('{km}', '376'));
  });
});

describe('chancePeriodLine', () => {
  it('as_of .. as_of + 14 days across months', () => {
    expect(chancePeriodLine('2026-11-19')).toBe('V\u00f5imalus n\u00e4ha Eestis 19. nov\u20133. dets');
  });

  it('as_of .. as_of + 14 days within one month', () => {
    expect(chancePeriodLine('2026-11-10')).toBe('V\u00f5imalus n\u00e4ha Eestis 10.\u201324. nov');
  });

  it('falls back to chance_two_weeks when as_of does not parse', () => {
    expect(chancePeriodLine('not-a-date')).toBe(TEXT.chance_two_weeks);
  });
});

describe('hooWindowLine / hooSinceLine', () => {
  const AUML = String.fromCharCode(0x00e4);
  const range = `5. nov${NDASH}3. dets`;

  it('window is as_of +/- 14 days', () => {
    expect(HOOAEG_HALFWIDTH_DAYS).toBe(14);
    expect(hooWindowRange('2026-11-19')).toBe(range);
    expect(hooWindowRange('2026-11-30')).toBe(`16. nov${NDASH}14. dets`);
    expect(hooWindowRange('2026-12-25')).toBe(`11. dets${NDASH}8. jaan`);
  });

  it('last10 = 10: range + count of the last 10 years', () => {
    expect(hooWindowLine({ years_in_window_last10: 10 }, '2026-11-19'))
      .toBe(`${range} on liiki Eestis n${AUML}htud 10 aastal viimasest 10-st`);
  });

  it('last10 = 0: none string', () => {
    expect(hooWindowLine({ years_in_window_last10: 0 }, '2026-11-19'))
      .toBe(`${range} pole liiki viimase 10 aasta jooksul Eestis n${AUML}htud`);
  });

  it('null when as_of does not parse', () => {
    expect(hooWindowLine({ years_in_window_last10: 3 }, '')).toBeNull();
  });

  it('since line: no viimati when last_year is null, viimati 2024 otherwise', () => {
    const none = hooSinceLine({ years_in_window_since_1990: 9, last_year_in_window: null });
    expect(none).toBe('Alates 1990: 9 eri aastal');
    expect(none).not.toContain('viimati');
    expect(hooSinceLine({ years_in_window_since_1990: 9, last_year_in_window: 2024 }))
      .toBe(`Alates 1990: 9 eri aastal ${MIDDOT} viimati 2024`);
  });
});

describe('monthBars', () => {
  it('scales to max 30, min 2, and flags the current month', () => {
    const bars = monthBars([0, 0, 1, 4, 3, 1, 0, 0, 2, 8, 6, 1], 11);
    expect(bars).toHaveLength(12);
    expect(Math.max(...bars.map((b) => b.heightPx))).toBe(30);
    expect(bars[9].heightPx).toBe(30);
    expect(bars[0].heightPx).toBe(2);
    expect(bars.filter((b) => b.current).map((b) => b.label)).toEqual(['N']);
  });

  it('all zeros stay at min height', () => {
    expect(monthBars([], 1).every((b) => b.heightPx === 2)).toBe(true);
  });

  it('chart label lists all 12 months', () => {
    expect(monthChartLabel([1, 2]).split(', ')).toHaveLength(12);
  });
});

describe('currentTallinnMonth', () => {
  it('uses Europe/Tallinn (UTC 22:30 on 31 Oct is already November)', () => {
    expect(currentTallinnMonth(new Date('2026-10-31T22:30:00Z'))).toBe(11);
  });
});

describe('firstOccurrences', () => {
  it('assigns each ebird_code to its first list in Juba -> Lahenemas -> Hooaeg order', () => {
    const t = firstOccurrences(parseEvidenceLists(PAYLOAD)!);
    expect(t.get('blkred')).toEqual({ segment: 'juba', index: 0 });
    expect(t.get('parcro2')).toEqual({ segment: 'lah', index: 0 });
  });
});

describe('chance_pct', () => {
  const withChance = (v: unknown) => ({
    ...PAYLOAD,
    juba_eestis: [{ ...PAYLOAD.juba_eestis[0], chance_pct: v }],
    lahenemas: [{ ...PAYLOAD.lahenemas[0], chance_pct: v }],
    hooaeg: [{ ...PAYLOAD.hooaeg[0], chance_pct: v }],
  });

  it('keeps a numeric chance_pct on juba, lahenemas and hooaeg items', () => {
    const lists = parseEvidenceLists(withChance(38));
    expect(lists?.juba_eestis[0].chance_pct).toBe(38);
    expect(lists?.lahenemas[0].chance_pct).toBe(38);
    expect(lists?.hooaeg[0].chance_pct).toBe(38);
  });

  it('is null when the field is missing (older raport)', () => {
    const lists = parseEvidenceLists(PAYLOAD);
    expect(lists?.juba_eestis[0].chance_pct).toBeNull();
    expect(lists?.lahenemas[0].chance_pct).toBeNull();
    expect(lists?.hooaeg[0].chance_pct).toBeNull();
  });

  it('is null when the field is the string "38"', () => {
    const lists = parseEvidenceLists(withChance('38'));
    expect(lists?.juba_eestis[0].chance_pct).toBeNull();
    expect(lists?.lahenemas[0].chance_pct).toBeNull();
    expect(lists?.hooaeg[0].chance_pct).toBeNull();
  });

  it('chanceChip formats ~N% and returns null without a number', () => {
    expect(chanceChip(38)).toBe('~38%');
    expect(chanceChip(null)).toBeNull();
  });
});
