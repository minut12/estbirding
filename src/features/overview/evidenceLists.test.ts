import { describe, expect, it } from 'vitest';
import {
  ARROW,
  MIDDOT,
  NDASH,
  TEXT,
  countLine,
  currentTallinnMonth,
  firstOccurrences,
  hkSentence,
  hooLast10Line,
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
      stay: { n_birds: 5, median_days: 2, pct_over_3d: 40 },
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
  it('n=5, median 2, pct 40 gives K=2', () => {
    const s = staySentence({ n_birds: 5, median_days: 2, pct_over_3d: 40 });
    expect(s).toContain(' 2 ');
    expect(s).toBe(TEXT.stay_many.replace('{d}', '2').split('{n}').join('5').replace('{k}', '2'));
  });

  it('median 1 uses stay_one', () => {
    const s = staySentence({ n_birds: 4, median_days: 1, pct_over_3d: 25 });
    expect(s).toBe(TEXT.stay_one.split('{n}').join('4').replace('{k}', '1'));
  });

  it('null or a single bird gives stay_none', () => {
    expect(staySentence(null)).toBe(TEXT.stay_none);
    expect(staySentence({ n_birds: 1, median_days: 1, pct_over_3d: 0 })).toBe(TEXT.stay_none);
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

describe('hooLast10Line', () => {
  it('drops the last-year part when last_year_in_window is null', () => {
    expect(hooLast10Line({ years_in_window_last10: 6, last_year_in_window: 2025 }))
      .toBe(TEXT.hoo_last10.replace('{n}', '6').replace('{year}', '2025'));
    expect(hooLast10Line({ years_in_window_last10: 0, last_year_in_window: null })).not.toContain(MIDDOT);
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
