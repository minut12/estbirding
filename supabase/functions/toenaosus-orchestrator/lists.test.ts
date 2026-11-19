// toenaosus-orchestrator / lists.test.ts
// Imports lists.ts only -- never index.ts, whose top-level Deno.serve() would
// start a server inside `deno test`.

import { assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  cleanSites,
  dedupeEvents,
  findTrack,
  groupJubaEestis,
  isSeasonal,
  jubaChance,
  lahenemasChance,
  type LahenemasPick,
  nearAllowed,
  nearEvent,
  type RareObsRow,
  type RaritySpecies,
  seasonChance,
  type SightingEvent,
  type SiteCellRow,
  sortHooaeg,
  tallinnDate,
  toLahenemasItems,
} from "./lists.ts";

function ev(
  date: string,
  cc: string,
  lat: number,
  lon: number,
  km: number,
): SightingEvent {
  return {
    date,
    country_code: cc,
    location: `${cc} ${date}`,
    lat,
    lon,
    km_to_turi: km,
    count: 1,
  };
}

Deno.test("tallinnDate: UTC evening rolls over to next Tallinn day", () => {
  assertEquals(tallinnDate(new Date("2026-11-15T22:30:00Z")), "2026-11-16");
  assertEquals(tallinnDate(new Date("2026-11-15T21:30:00Z")), "2026-11-15");
});

Deno.test("findTrack: Manni-kabilind 15 Nov 2026 -> 12 Nov (431) -> 14 Nov (376)", () => {
  const events = [
    ev("2026-11-05", "FI", 62.578, 24.517, 422),
    ev("2026-11-06", "FI", 60.172, 24.733, 154),
    ev("2026-11-07", "FI", 64.736, 24.571, 660),
    ev("2026-11-08", "FI", 59.824, 23.007, 178),
    ev("2026-11-12", "FI", 62.118, 21.320, 431),
    ev("2026-11-14", "FI", 61.746, 22.048, 376),
  ];
  const chain = findTrack(events, "2026-11-15");
  assertEquals(
    chain?.map((e) => [e.date, e.km_to_turi]),
    [["2026-11-12", 431], ["2026-11-14", 376]],
  );
});

Deno.test("findTrack: Magikiur latest event SE > 400 km -> null", () => {
  const events = [
    ev("2026-11-08", "LV", 56.071, 21.068, 401),
    ev("2026-11-12", "LV", 56.517, 20.988, 367),
    ev("2026-11-13", "SE", 57.457, 11.919, 806),
  ];
  assertEquals(findTrack(events, "2026-11-15"), null);
});

Deno.test("nearEvent: Tuhk-lehelind 11 Nov FI 181 km, gone by 17 Nov", () => {
  const events = [
    ev("2026-11-08", "PL", 54.647, 18.465, 628),
    ev("2026-11-11", "FI", 59.832, 22.946, 181),
  ];
  assertEquals(nearEvent(events, "2026-11-15")?.date, "2026-11-11");
  assertEquals(nearEvent(events, "2026-11-15")?.km_to_turi, 181);
  assertEquals(nearEvent(events, "2026-11-17"), null);
});

// P184f: direction gate. Events within NEAR_KM and NEAR_MAX_AGE_DAYS, so only
// the latitude vs Turi (58.81) and the month decide.
Deno.test("nearEvent: November keeps only birds north of Turi", () => {
  assertEquals(nearEvent([ev("2026-11-16", "LV", 56.9, 24.1, 230)], "2026-11-17"), null);
  assertEquals(
    nearEvent([ev("2026-11-16", "FI", 60.2, 24.9, 150)], "2026-11-17")?.country_code,
    "FI",
  );
  assertEquals(nearEvent([ev("2026-11-16", "RU-PSK", 57.8, 28.3, 220)], "2026-11-17"), null);
  assertEquals(
    nearEvent([ev("2026-11-16", "SE", 59.3, 18.1, 290)], "2026-11-17")?.country_code,
    "SE",
  );
});

Deno.test("nearEvent: May keeps only birds south of Turi", () => {
  assertEquals(
    nearEvent([ev("2026-05-09", "LV", 56.9, 24.1, 230)], "2026-05-10")?.country_code,
    "LV",
  );
  assertEquals(nearEvent([ev("2026-05-09", "FI", 60.2, 24.9, 150)], "2026-05-10"), null);
});

Deno.test("nearEvent: January and July allow either direction", () => {
  assertEquals(
    nearEvent([ev("2026-01-14", "LV", 56.9, 24.1, 230)], "2026-01-15")?.country_code,
    "LV",
  );
  assertEquals(
    nearEvent([ev("2026-07-14", "LV", 56.9, 24.1, 230)], "2026-07-15")?.country_code,
    "LV",
  );
});

Deno.test("nearAllowed: month boundaries", () => {
  const lv = ev("2026-11-16", "LV", 56.9, 24.1, 230);
  const fi = ev("2026-11-16", "FI", 60.2, 24.9, 150);
  assertEquals(nearAllowed(lv, "2026-08-01"), false);
  assertEquals(nearAllowed(fi, "2026-12-31"), true);
  assertEquals(nearAllowed(lv, "2026-02-01"), true);
  assertEquals(nearAllowed(fi, "2026-06-30"), false);
  assertEquals(nearAllowed(fi, "2026-01-15"), true);
  assertEquals(nearAllowed(fi, "2026-07-15"), true);
});

Deno.test("dedupeEvents: same species/day/cell -> one event, min km, max count", () => {
  const base: RareObsRow = {
    species_et_name: "Testlind",
    species_code: "testl1",
    obs_date: "2026-11-10 08:00",
    lat: 59.80,
    lng: 23.00,
    distance_to_ee_km: 190,
    obs_count: 1,
    country_code: "FI",
    location: "A",
  };
  const rows: RareObsRow[] = [
    base,
    {
      ...base,
      obs_date: "2026-11-10 15:30",
      lat: 59.82,
      lng: 23.02,
      distance_to_ee_km: 180,
      obs_count: 3,
      location: "B",
    },
    { ...base, obs_date: "2026-11-11", distance_to_ee_km: 170 },
  ];
  const out = dedupeEvents(rows);
  assertEquals(out.length, 2);
  const d10 = out.find((e) => e.date === "2026-11-10");
  assertEquals(d10?.km_to_turi, 180);
  assertEquals(d10?.count, 3);
  assertEquals(d10?.location, "B");
  assertEquals(d10?.country_code, "FI");
  assertEquals(Math.round((d10?.lat ?? 0) * 100), 5981);
});

Deno.test("groupJubaEestis: 14-day window, sort, county dedupe", () => {
  const rows = [
    { species_et: "Bee", date: "2026-11-10", county: "Saare", count: 2 },
    { species_et: "Bee", date: "2026-11-12", county: "Saare", count: 5 },
    { species_et: "Bee", date: "2026-11-11", county: "Harju", count: null },
    { species_et: "Aaa", date: "2026-11-12", county: null, count: null },
    { species_et: "Old", date: "2026-10-31", county: "Harju", count: 1 },
    { species_et: "Ccc", date: "2026-11-14", county: null, count: 1 },
  ];
  const out = groupJubaEestis(rows, "2026-11-15");
  assertEquals(out.map((g) => g.species_et), ["Ccc", "Aaa", "Bee"]);
  const bee = out[2];
  assertEquals(bee.first_date, "2026-11-10");
  assertEquals(bee.last_date, "2026-11-12");
  assertEquals(bee.n_obs, 3);
  assertEquals(bee.max_count, 5);
  assertEquals(bee.counties, ["Harju", "Saare"]);
  assertEquals(out[1].max_count, null);
  // 2026-11-01 is exactly asOf-14 and stays in.
  const edge = groupJubaEestis(
    [{ species_et: "E", date: "2026-11-01", county: null, count: null }],
    "2026-11-15",
  );
  assertEquals(edge.length, 1);
});

Deno.test("sortHooaeg: years desc, then last10 desc, then name asc", () => {
  const mk = (species_et: string, y: number, l: number) => ({
    species_et,
    years_in_window_since_1990: y,
    years_in_window_last10: l,
    chance_pct: 1,
  });
  const out = sortHooaeg([
    mk("B", 5, 1),
    mk("A", 5, 1),
    mk("C", 5, 3),
    mk("D", 9, 0),
  ]);
  assertEquals(out.map((x) => x.species_et), ["D", "C", "A", "B"]);
});

// ---------------------------------------------------------------------------
// P184h1: calibrated chance_pct
// ---------------------------------------------------------------------------

Deno.test("seasonChance: P184a steps by last10", () => {
  const cases: [number, number][] = [
    [0, 1],
    [1, 7],
    [2, 11],
    [3, 11],
    [4, 15],
    [5, 15],
    [6, 38],
    [10, 38],
  ];
  for (const [l, want] of cases) assertEquals(seasonChance(l), want);
});

Deno.test("lahenemasChance: no history -> 8, else season step", () => {
  assertEquals(lahenemasChance(0), 8);
  assertEquals(lahenemasChance(7), 38);
});

Deno.test("jubaChance: depends on days since last report, null without stay", () => {
  const asOf = "2026-11-19";
  const lounatirk = { n_birds: 30, n_multi_day: 1, n_over_3d: 0 };
  assertEquals(jubaChance(lounatirk, "2026-11-19", asOf), 3);
  assertEquals(jubaChance(lounatirk, "2026-11-17", asOf), 0);
  assertEquals(jubaChance(lounatirk, "2026-11-06", asOf), null);
  const big = { n_birds: 177, n_multi_day: 38, n_over_3d: 18 };
  assertEquals(jubaChance(big, "2026-11-18", asOf), 21);
  assertEquals(jubaChance(big, "2026-11-16", asOf), 10);
  assertEquals(jubaChance(big, "2026-11-15", asOf), null);
  assertEquals(jubaChance(null, "2026-11-19", asOf), null);
});

Deno.test("sortHooaeg: chance desc beats more years", () => {
  const out = sortHooaeg([
    {
      species_et: "A",
      years_in_window_since_1990: 20,
      years_in_window_last10: 2,
      chance_pct: 11,
    },
    {
      species_et: "B",
      years_in_window_since_1990: 8,
      years_in_window_last10: 6,
      chance_pct: 38,
    },
  ]);
  assertEquals(out.map((x) => x.species_et), ["B", "A"]);
});

Deno.test("toLahenemasItems: chance_pct and last10 from the prior map", () => {
  const picks: LahenemasPick[] = [{
    species_et: "Kaljukajakas",
    species_code: "kitwak",
    kind: "near",
    events: [ev("2026-11-10", "FI", 60.1, 24.9, 120)],
    latest_km: 120,
  }];
  const meta: RaritySpecies = {
    name_et: "Kaljukajakas",
    sci: "Rissa tridactyla",
    ebird_code: "bklkit",
    level: "rare",
    avatar_url: null,
  };
  const by = new Map([["Kaljukajakas", meta]]);

  const failed = toLahenemasItems(picks, by, [], null);
  assertEquals(failed[0].chance_pct, null);
  assertEquals(failed[0].years_in_window_last10, 0);

  const noRow = toLahenemasItems(picks, by, [], new Map());
  assertEquals(noRow[0].chance_pct, 8);
  assertEquals(noRow[0].years_in_window_last10, 0);

  const seven = toLahenemasItems(
    picks,
    by,
    [],
    new Map([["Kaljukajakas", 7]]),
  );
  assertEquals(seven[0].chance_pct, 38);
  assertEquals(seven[0].years_in_window_last10, 7);
});

// ---------------------------------------------------------------------------
// P184d1: Hooaeg seasonality + site cleanup
// Real years_by_month values from the 15 Nov 2026 raport.
// ---------------------------------------------------------------------------

const SEASON_CASES: [string, number[], boolean][] = [
  ["Kaljukajakas", [4, 0, 1, 7, 13, 2, 1, 3, 3, 21, 18, 9], true],
  ["Lumekakk", [4, 3, 4, 1, 0, 0, 0, 0, 0, 0, 3, 4], true],
  ["Roosakajakas", [0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 2, 0], true],
  ["Kassikakk", [9, 15, 21, 18, 13, 15, 8, 13, 10, 9, 8, 4], false],
  ["Manni-kabilind", [11, 11, 19, 18, 21, 18, 18, 15, 21, 25, 17, 9], false],
  ["Tundrakaur", [2, 1, 3, 12, 25, 3, 1, 3, 7, 18, 5, 5], false],
];

for (const [name, ybm, want] of SEASON_CASES) {
  Deno.test(`isSeasonal: ${name} on 2026-11-15 -> ${want}`, () => {
    assertEquals(isSeasonal(ybm, "2026-11-15", 14, 1.5), want);
  });
}

Deno.test("isSeasonal: window spanning Oct-Nov counts October", () => {
  const tundrakaur = [2, 1, 3, 12, 25, 3, 1, 3, 7, 18, 5, 5];
  assertEquals(isSeasonal(tundrakaur, "2026-11-05", 14, 1.5), true);
});

Deno.test("isSeasonal: wrong length or all zeros -> false", () => {
  assertEquals(isSeasonal([1, 2, 3], "2026-11-15", 14, 1.5), false);
  assertEquals(isSeasonal(new Array(12).fill(0), "2026-11-15", 14, 1.5), false);
});

Deno.test("cleanSites: drops kaardilt / zero-season / unlabeled cells", () => {
  const base: SiteCellRow = {
    species_name: "Kaljukajakas",
    lat: 57.9,
    lon: 22.05,
    n_season: 5,
    label: "x",
    county: "Saare maakond",
  };
  const rows: SiteCellRow[] = [
    { ...base, label: "vt. kaardilt" },
    { ...base, label: "Kihnu", n_season: 0 },
    { ...base, label: null, county: null },
    { ...base, label: "Sorve", n_season: 77 },
  ];
  const out = cleanSites(rows);
  assertEquals(out.length, 1);
  assertEquals(out[0].label, "Sorve");
  assertEquals(out[0].n_days, 77);
});
