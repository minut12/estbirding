// prediction-outcomes / outcomes.test.ts
// Imports outcomes.ts only -- never index.ts, whose top-level Deno.serve()
// would start a server inside `deno test`.
//
// Run: deno test supabase/functions/prediction-outcomes/outcomes.test.ts

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  addDays,
  type ArrivalRecord,
  buildRowsForEntry,
  dateOnly,
  deriveWindow,
  earliestArrival,
  filterArrivalsInWindow,
  haversineKm,
  nearestToSite,
  num,
  parseDaterange,
  PHENOLOGY_GATE_MIN,
  projectPhenologyEnd,
  seasonWindowKind,
  SITE_HIT_RADIUS_KM,
  SITE_INDEX_SPECIES_LEVEL,
  WATCHLIST_BAND,
  WINDOW_MAX_DAYS,
} from "./outcomes.ts";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

Deno.test("dateOnly extracts the date from a timestamptz and a bare date", () => {
  assertEquals(dateOnly("2026-09-08 03:13:26.142602+00"), "2026-09-08");
  assertEquals(dateOnly("2026-09-08T03:13:26.142Z"), "2026-09-08");
  assertEquals(dateOnly("2026-09-08"), "2026-09-08");
});

Deno.test("dateOnly returns empty string for unparseable input", () => {
  assertEquals(dateOnly(null), "");
  assertEquals(dateOnly(42), "");
  assertEquals(dateOnly("not a date"), "");
});

Deno.test("addDays crosses month and year boundaries", () => {
  assertEquals(addDays("2026-09-08", 5), "2026-09-13");
  assertEquals(addDays("2026-09-28", 7), "2026-10-05");
  assertEquals(addDays("2026-12-30", 5), "2027-01-04");
  assertEquals(addDays("2027-01-01", -1), "2026-12-31");
});

Deno.test("num coerces only finite numbers", () => {
  assertEquals(num("58.75"), 58.75);
  assertEquals(num(0), 0);
  assertEquals(num(null), null);
  assertEquals(num(""), null);
  assertEquals(num("abc"), null);
  assertEquals(num(Infinity), null);
});

// ---------------------------------------------------------------------------
// Haversine
// ---------------------------------------------------------------------------

Deno.test("haversineKm returns zero for identical points", () => {
  assertEquals(haversineKm(58.81, 25.43, 58.81, 25.43), 0);
});

Deno.test("haversineKm matches a known Estonian leg", () => {
  // Türi anchor (58.81 N, 25.43 E) -> Põõsaspea (59.2285, 23.5072).
  // ~118 km; asserted loosely enough to survive floating point, tightly
  // enough to catch a degrees/radians or lat/lon transposition.
  const km = haversineKm(58.81, 25.43, 59.2285004165014, 23.5071553131513);
  assertAlmostEquals(km, 118, 3);
});

Deno.test("haversineKm is symmetric", () => {
  const a = haversineKm(58.93, 22.04, 59.67, 25.70);
  const b = haversineKm(59.67, 25.70, 58.93, 22.04);
  assertAlmostEquals(a, b, 1e-9);
});

// ---------------------------------------------------------------------------
// Phenology projection
// ---------------------------------------------------------------------------

Deno.test("parseDaterange reads a half-open Postgres daterange", () => {
  const r = parseDaterange("[2000-08-01,2000-10-16)");
  assertEquals(r, {
    lowerInclusive: true,
    lowerISO: "2000-08-01",
    upperISO: "2000-10-16",
    upperInclusive: false,
  });
});

Deno.test("parseDaterange rejects junk and non-strings", () => {
  assertEquals(parseDaterange(null), null);
  assertEquals(parseDaterange(""), null);
  assertEquals(parseDaterange("2000-08-01,2000-10-16"), null);
});

Deno.test("projectPhenologyEnd projects a same-year window onto the raport year", () => {
  // parjae autumn. Half-open upper 10-16 -> inclusive last day 10-15.
  assertEquals(
    projectPhenologyEnd("[2000-08-01,2000-10-16)", 2026),
    "2026-10-15",
  );
});

Deno.test("projectPhenologyEnd preserves a year-crossing window's offset", () => {
  // ambduc autumn. The stored upper bound is in 2001, i.e. one year past the
  // lower bound, so on a 2026 raport the window ends 2026-12-31 -- matching
  // toenaosus-orchestrator/score.ts:118,129, which reads a 2001 upper bound as
  // "runs to year end".
  assertEquals(
    projectPhenologyEnd("[2000-10-15,2001-01-01)", 2026),
    "2026-12-31",
  );
});

Deno.test("projectPhenologyEnd honours an inclusive upper bound", () => {
  assertEquals(
    projectPhenologyEnd("[2000-04-20,2000-06-21]", 2026),
    "2026-06-21",
  );
});

Deno.test("projectPhenologyEnd returns null when the window is absent", () => {
  assertEquals(projectPhenologyEnd(null, 2026), null);
  assertEquals(projectPhenologyEnd("[2000-04-20,2000-06-21)", Number.NaN), null);
});

// ---------------------------------------------------------------------------
// Season selection
// ---------------------------------------------------------------------------

Deno.test("seasonWindowKind prefers the entry's own season", () => {
  assertEquals(seasonWindowKind("autumn", "spring_summer"), "autumn");
  assertEquals(seasonWindowKind("spring", "fall_winter"), "spring");
});

Deno.test("seasonWindowKind falls back to the raport season when the entry has none", () => {
  // probability_factors.season is null on 2401 of the last 2539 entries.
  assertEquals(seasonWindowKind(null, "fall_winter"), "autumn");
  assertEquals(seasonWindowKind(undefined, "spring_summer"), "spring");
});

Deno.test("seasonWindowKind returns null when neither is usable", () => {
  assertEquals(seasonWindowKind(null, null), null);
  assertEquals(seasonWindowKind("winter", "unknown"), null);
});

// ---------------------------------------------------------------------------
// Window derivation
// ---------------------------------------------------------------------------

const GEN = "2026-09-08 03:13:26.142602+00";

Deno.test("deriveWindow: imminent is the raport date + 5 days, code_5d", () => {
  assertEquals(
    deriveWindow({ band: "imminent", generatedAt: GEN, phenologyEnd: null }),
    {
      windowSource: "code_5d",
      windowStart: "2026-09-08",
      windowEnd: "2026-09-13",
      notScoredReason: null,
    },
  );
});

Deno.test("deriveWindow: this_week is the raport date + 7 days, label_7d", () => {
  assertEquals(
    deriveWindow({ band: "this_week", generatedAt: GEN, phenologyEnd: null }),
    {
      windowSource: "label_7d",
      windowStart: "2026-09-08",
      windowEnd: "2026-09-15",
      notScoredReason: null,
    },
  );
});

Deno.test("deriveWindow: in_season runs to the projected phenology end", () => {
  assertEquals(
    deriveWindow({
      band: "in_season",
      generatedAt: GEN,
      phenologyEnd: "2026-10-15",
    }),
    {
      windowSource: "phenology",
      windowStart: "2026-09-08",
      windowEnd: "2026-10-15",
      notScoredReason: null,
    },
  );
});

Deno.test("deriveWindow: in_season is clamped to WINDOW_MAX_DAYS", () => {
  const w = deriveWindow({
    band: "in_season",
    generatedAt: GEN,
    phenologyEnd: "2026-12-31",
  });
  assertEquals(w?.windowSource, "phenology");
  assertEquals(w?.windowEnd, addDays("2026-09-08", WINDOW_MAX_DAYS));
});

Deno.test("deriveWindow: in_season without a phenology row is not scored", () => {
  assertEquals(
    deriveWindow({ band: "in_season", generatedAt: GEN, phenologyEnd: null }),
    {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "no_phenology_row",
    },
  );
});

Deno.test("deriveWindow: in_season whose season already closed is out_of_phenology", () => {
  assertEquals(
    deriveWindow({
      band: "in_season",
      generatedAt: GEN,
      phenologyEnd: "2026-08-31",
    }),
    {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "out_of_phenology",
    },
  );
});

Deno.test("deriveWindow: passed and out_of_window carry no window", () => {
  assertEquals(
    deriveWindow({ band: "passed", generatedAt: GEN, phenologyEnd: null }),
    {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "window_closed",
    },
  );
  assertEquals(
    deriveWindow({ band: "out_of_window", generatedAt: GEN, phenologyEnd: null }),
    {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "out_of_phenology",
    },
  );
});

// --- watch-list band -------------------------------------------------------
// corridor_watchlist items carry no timing_band of their own. All 45 live rows
// are species with no `entries` row in the same raport, so this branch is the
// only thing that scores them.

Deno.test("deriveWindow: watchlist takes the same phenology window as in_season", () => {
  const watchlist = deriveWindow({
    band: WATCHLIST_BAND,
    generatedAt: GEN,
    phenologyEnd: "2026-10-15",
    phenologyGate: 1,
  });
  assertEquals(watchlist, {
    windowSource: "phenology",
    windowStart: "2026-09-08",
    windowEnd: "2026-10-15",
    notScoredReason: null,
  });
  // Byte-identical to the in_season path -- one shared implementation.
  assertEquals(
    watchlist,
    deriveWindow({
      band: "in_season",
      generatedAt: GEN,
      phenologyEnd: "2026-10-15",
    }),
  );
});

Deno.test("deriveWindow: watchlist is clamped to WINDOW_MAX_DAYS too", () => {
  const w = deriveWindow({
    band: WATCHLIST_BAND,
    generatedAt: GEN,
    phenologyEnd: "2026-12-31",
    phenologyGate: 1,
  });
  assertEquals(w?.windowEnd, addDays("2026-09-08", WINDOW_MAX_DAYS));
});

Deno.test("deriveWindow: watchlist below the phenology gate is out_of_phenology", () => {
  // Does not fire on today's data -- every live watch-list row gates at 1 --
  // but a gate that only exists when it passes is not a gate.
  assertEquals(
    deriveWindow({
      band: WATCHLIST_BAND,
      generatedAt: GEN,
      phenologyEnd: "2026-10-15",
      phenologyGate: 0.59,
    }),
    {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "out_of_phenology",
    },
  );
  // The threshold is the orchestrator's own `gate < 0.6`, so 0.6 itself passes.
  assertEquals(
    deriveWindow({
      band: WATCHLIST_BAND,
      generatedAt: GEN,
      phenologyEnd: "2026-10-15",
      phenologyGate: PHENOLOGY_GATE_MIN,
    })?.windowSource,
    "phenology",
  );
});

Deno.test("deriveWindow: watchlist with no phenology row is no_phenology_row", () => {
  // Also does not fire today: all 5 live watch-list species have a row.
  assertEquals(
    deriveWindow({
      band: WATCHLIST_BAND,
      generatedAt: GEN,
      phenologyEnd: null,
      phenologyGate: 1,
    }),
    {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "no_phenology_row",
    },
  );
});

Deno.test("deriveWindow: a watchlist item with no gate is not blocked by one", () => {
  // Matches the orchestrator defaulting an absent gate to 1
  // (toenaosus-orchestrator/index.ts:1613-1617).
  assertEquals(
    deriveWindow({
      band: WATCHLIST_BAND,
      generatedAt: GEN,
      phenologyEnd: "2026-10-15",
      phenologyGate: null,
    })?.windowSource,
    "phenology",
  );
  assertEquals(
    deriveWindow({
      band: WATCHLIST_BAND,
      generatedAt: GEN,
      phenologyEnd: "2026-10-15",
    })?.windowSource,
    "phenology",
  );
});

Deno.test("deriveWindow returns null for an unknown band rather than guessing", () => {
  assertEquals(
    deriveWindow({ band: "someday", generatedAt: GEN, phenologyEnd: null }),
    null,
  );
  assertEquals(
    deriveWindow({ band: null, generatedAt: GEN, phenologyEnd: null }),
    null,
  );
});

Deno.test("deriveWindow returns null when generated_at is unparseable", () => {
  assertEquals(
    deriveWindow({ band: "imminent", generatedAt: "", phenologyEnd: null }),
    null,
  );
});

// ---------------------------------------------------------------------------
// Arrival matching
// ---------------------------------------------------------------------------

const rec = (
  date: string,
  lat: number | null,
  lon: number | null,
  source: ArrivalRecord["source"] = "elurikkus_observations",
): ArrivalRecord => ({ date, lat, lon, source });

Deno.test("filterArrivalsInWindow keeps both endpoints and drops outside", () => {
  const all = [
    rec("2026-09-07", 59, 23),
    rec("2026-09-08", 59, 23),
    rec("2026-09-13", 59, 23),
    rec("2026-09-14", 59, 23),
  ];
  const kept = filterArrivalsInWindow(all, "2026-09-08", "2026-09-13");
  assertEquals(kept.map((r) => r.date), ["2026-09-08", "2026-09-13"]);
});

Deno.test("filterArrivalsInWindow returns nothing when the window is null", () => {
  assertEquals(
    filterArrivalsInWindow([rec("2026-09-08", 59, 23)], null, null),
    [],
  );
});

Deno.test("earliestArrival breaks a date tie by source priority", () => {
  const first = earliestArrival([
    rec("2026-09-10", 59, 23, "elurikkus_raport"),
    rec("2026-09-10", 59, 23, "elurikkus_observations"),
    rec("2026-09-11", 59, 23, "elurikkus_observations"),
  ]);
  assertEquals(first?.date, "2026-09-10");
  assertEquals(first?.source, "elurikkus_observations");
});

Deno.test("earliestArrival returns null for an empty set", () => {
  assertEquals(earliestArrival([]), null);
});

Deno.test("nearestToSite ignores records without coordinates", () => {
  const near = nearestToSite(
    [rec("2026-09-09", null, null), rec("2026-09-10", 59.2285, 23.5072)],
    59.2285,
    23.5072,
  );
  assertEquals(near?.record.date, "2026-09-10");
  assertAlmostEquals(near?.distanceKm ?? -1, 0, 1e-6);
});

Deno.test("nearestToSite returns null when nothing has coordinates", () => {
  assertEquals(nearestToSite([rec("2026-09-09", null, null)], 59, 23), null);
});

// ---------------------------------------------------------------------------
// Row construction
// ---------------------------------------------------------------------------

const SITES = [
  { label: "Põõsaspea", lat: 59.2285004165014, lon: 23.5071553131513 },
  { label: "Ristna", lat: 58.9284108253723, lon: 22.0396177289894 },
];

const baseInput = {
  raportId: "00000000-0000-4000-8000-000000000001",
  ebirdCode: "parjae",
  speciesEt: "Söödikänn",
  band: "this_week",
  predictedPct: 37,
  sites: SITES,
};

Deno.test("buildRowsForEntry: a not_scored window emits only the species-level row", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    band: "passed",
    window: {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "window_closed",
    },
    arrivals: [],
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].site_index, SITE_INDEX_SPECIES_LEVEL);
  assertEquals(rows[0].outcome, "not_scored");
  assertEquals(rows[0].not_scored_reason, "window_closed");
  assertEquals(rows[0].window_start, null);
  assertEquals(rows[0].window_end, null);
});

const OPEN_WINDOW = {
  windowSource: "label_7d" as const,
  windowStart: "2026-09-08",
  windowEnd: "2026-09-15",
  notScoredReason: null,
};

Deno.test("buildRowsForEntry: no arrival is a miss on every row", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    window: OPEN_WINDOW,
    arrivals: [rec("2026-09-20", 59.2285, 23.5072)], // outside the window
  });
  assertEquals(rows.length, 3);
  assertEquals(rows.map((r) => r.outcome), ["miss", "miss", "miss"]);
  assertEquals(rows.every((r) => r.ee_first_date === null), true);
});

Deno.test("buildRowsForEntry: an arrival on the predicted site is a site_hit", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    window: OPEN_WINDOW,
    arrivals: [rec("2026-09-10", 59.2285004165014, 23.5071553131513)],
  });
  assertEquals(rows.length, 3);

  const species = rows[0];
  assertEquals(species.site_index, SITE_INDEX_SPECIES_LEVEL);
  assertEquals(species.outcome, "species_hit");
  assertEquals(species.ee_first_date, "2026-09-10");
  assertEquals(species.obs_source, "elurikkus_observations");
  assertEquals(species.distance_km, null);

  const poosaspea = rows[1];
  assertEquals(poosaspea.site_index, 0);
  assertEquals(poosaspea.outcome, "site_hit");
  assertEquals(poosaspea.site_label, "Põõsaspea");
  assertAlmostEquals(poosaspea.distance_km ?? -1, 0, 1e-6);
  // The site_hit CHECK constraint requires both of these to be non-null.
  assertEquals(poosaspea.ee_first_date, "2026-09-10");

  // Ristna is ~85 km from Põõsaspea, past the 50 km radius.
  const ristna = rows[2];
  assertEquals(ristna.site_index, 1);
  assertEquals(ristna.outcome, "miss");
  assertEquals((ristna.distance_km ?? 0) > SITE_HIT_RADIUS_KM, true);
});

Deno.test("buildRowsForEntry: species seen but no coordinates anywhere is not_scored", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    window: OPEN_WINDOW,
    arrivals: [rec("2026-09-10", null, null, "vaatluste_raport")],
  });
  assertEquals(rows[0].outcome, "species_hit");
  assertEquals(rows[0].obs_source, "vaatluste_raport");
  // Not `miss` -- that would read as "the bird was not there", which is false.
  assertEquals(rows[1].outcome, "not_scored");
  assertEquals(rows[1].not_scored_reason, "no_coordinates");
  assertEquals(rows[2].outcome, "not_scored");
  assertEquals(rows[2].not_scored_reason, "no_coordinates");
});

Deno.test("buildRowsForEntry: a predicted site without coordinates is not_scored", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    sites: [{ label: "Tundmatu", lat: null, lon: null }],
    window: OPEN_WINDOW,
    arrivals: [rec("2026-09-10", 59.2285, 23.5072)],
  });
  assertEquals(rows[0].outcome, "species_hit");
  assertEquals(rows[1].outcome, "not_scored");
  assertEquals(rows[1].not_scored_reason, "no_coordinates");
});

Deno.test("buildRowsForEntry: an entry with no predicted sites emits one row", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    sites: [],
    window: OPEN_WINDOW,
    arrivals: [rec("2026-09-10", 59.2285, 23.5072)],
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].site_index, SITE_INDEX_SPECIES_LEVEL);
  assertEquals(rows[0].outcome, "species_hit");
});

Deno.test("buildRowsForEntry: site rows carry the window and the prediction", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    window: OPEN_WINDOW,
    arrivals: [rec("2026-09-10", 59.2285, 23.5072)],
  });
  for (const r of rows) {
    assertEquals(r.raport_id, baseInput.raportId);
    assertEquals(r.ebird_code, "parjae");
    assertEquals(r.species_et, "Söödikänn");
    assertEquals(r.timing_band, "this_week");
    assertEquals(r.predicted_pct, 37);
    assertEquals(r.window_source, "label_7d");
    assertEquals(r.window_start, "2026-09-08");
    assertEquals(r.window_end, "2026-09-15");
  }
  assertEquals(rows[1].predicted_lat, SITES[0].lat);
  assertEquals(rows[1].predicted_lon, SITES[0].lon);
  assertEquals(rows[0].predicted_lat, null);
  assertEquals(rows[0].predicted_lon, null);
});

Deno.test("buildRowsForEntry: site_index is dense from zero", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    sites: [
      { label: "A", lat: 59, lon: 23 },
      { label: "B", lat: 59, lon: 24 },
      { label: "C", lat: 59, lon: 25 },
    ],
    window: OPEN_WINDOW,
    arrivals: [],
  });
  assertEquals(rows.map((r) => r.site_index), [-1, 0, 1, 2]);
});

// ---------------------------------------------------------------------------
// Watch-list rows
// ---------------------------------------------------------------------------

const WATCHLIST_WINDOW = {
  windowSource: "phenology" as const,
  windowStart: "2026-09-08",
  windowEnd: "2026-10-15",
  notScoredReason: null,
};

Deno.test("buildRowsForEntry: a watchlist item emits -1 plus one row per site", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    band: WATCHLIST_BAND,
    predictedPct: null, // no ee_probability_pct key exists on a watch-list item
    window: WATCHLIST_WINDOW,
    arrivals: [],
  });
  assertEquals(rows.map((r) => r.site_index), [-1, 0, 1]);
  assertEquals(rows.every((r) => r.timing_band === "watchlist"), true);
  assertEquals(rows.every((r) => r.predicted_pct === null), true);
  assertEquals(rows.every((r) => r.window_source === "phenology"), true);
  // These are rare seabirds; a miss is the expected result, not a failure.
  assertEquals(rows.map((r) => r.outcome), ["miss", "miss", "miss"]);
});

Deno.test("buildRowsForEntry: a watchlist item scores like any other prediction", () => {
  const rows = buildRowsForEntry({
    ...baseInput,
    band: WATCHLIST_BAND,
    predictedPct: null,
    window: WATCHLIST_WINDOW,
    arrivals: [rec("2026-09-20", 59.2285004165014, 23.5071553131513)],
  });
  assertEquals(rows[0].outcome, "species_hit");
  assertEquals(rows[0].ee_first_date, "2026-09-20");
  assertEquals(rows[1].outcome, "site_hit");
  assertEquals(rows[2].outcome, "miss");
});

// The collision guard itself lives in index.ts's collapse, which is not
// importable here. What outcomes.ts guarantees is the shape that guard keys on:
// a watch-list item and an entry for the same (raport, species) produce the
// SAME species-level key, which is exactly why one of them has to lose. Zero
// collisions measured across all 45 live watch-list rows.
Deno.test("buildRowsForEntry: entry and watchlist collide on the species-level key", () => {
  const key = (
    r: { raport_id: string; ebird_code: string; site_index: number },
  ) => `${r.raport_id}|${r.ebird_code}|${r.site_index}`;

  const entryRows = buildRowsForEntry({
    ...baseInput,
    band: "this_week",
    window: OPEN_WINDOW,
    arrivals: [],
  });
  const watchlistRows = buildRowsForEntry({
    ...baseInput,
    band: WATCHLIST_BAND,
    predictedPct: null,
    window: WATCHLIST_WINDOW,
    arrivals: [],
  });

  assertEquals(key(entryRows[0]), key(watchlistRows[0]));
  // ...and the entry is the one worth keeping: it carries a real band and pct.
  assertEquals(entryRows[0].timing_band, "this_week");
  assertEquals(entryRows[0].predicted_pct, 37);
  assertEquals(watchlistRows[0].predicted_pct, null);
});
