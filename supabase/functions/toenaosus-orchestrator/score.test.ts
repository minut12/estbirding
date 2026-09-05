// toenaosus-orchestrator / score.test.ts
// Imports score.ts only -- never index.ts, whose top-level Deno.serve() would
// start a server inside `deno test`.

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  directionFit,
  parseDateRange,
  type PhenologyRow,
  phenologyGate,
  regionToCountry,
  scoreV4,
  seasonFor,
  sourceFit,
  type UpstreamRow,
  upstreamP,
  V4,
} from "./score.ts";

// Tarsiger cyanurus (Sinisaba) — the reference row from the P4 spec.
const TARSIGER: PhenologyRow = {
  scientific_name: "Tarsiger cyanurus",
  ebird_code: "recfly1",
  arrival_modes: ["spring_overshoot", "autumn_drift"],
  spring_window: "[2000-05-10,2000-06-21)",
  autumn_window: "[2000-09-05,2000-10-21)",
  arrival_bearing_spring: 130,
  arrival_bearing_autumn: 60,
  source_regions_spring: ["FI", "RU-LEN"],
  source_regions_autumn: ["RU-LEN", "RU-KR"],
};

// ---- parseDateRange --------------------------------------------------------

Deno.test("parseDateRange: normal half-open range", () => {
  assertEquals(parseDateRange("[2000-04-15,2000-07-01)"), {
    lo: "04-15",
    hi: "07-01",
  });
});

Deno.test("parseDateRange: upper 2001-01-01 wraps to year end", () => {
  assertEquals(parseDateRange("[2000-11-01,2001-01-01)"), {
    lo: "11-01",
    hi: "12-32",
  });
});

Deno.test("parseDateRange: null and unparseable yield null", () => {
  assertEquals(parseDateRange(null), null);
  assertEquals(parseDateRange("empty"), null);
});

// ---- seasonFor -------------------------------------------------------------

Deno.test("seasonFor: in spring window -> spring", () => {
  assertEquals(seasonFor(new Date("2026-05-20T00:00:00Z"), TARSIGER), "spring");
});

Deno.test("seasonFor: Sep 3 is before the Sep 5 autumn opening -> null", () => {
  assertEquals(seasonFor(new Date("2026-09-03T00:00:00Z"), TARSIGER), null);
});

Deno.test("seasonFor: deep winter -> null", () => {
  assertEquals(seasonFor(new Date("2026-02-01T00:00:00Z"), TARSIGER), null);
});

Deno.test("seasonFor: no phenology row -> null", () => {
  assertEquals(seasonFor(new Date("2026-05-20T00:00:00Z"), null), null);
});

// ---- phenologyGate ---------------------------------------------------------

Deno.test("phenologyGate: matching mode is arrival_modes[0] -> 1.0", () => {
  const g = phenologyGate("spring", TARSIGER);
  assertEquals(g.gate, 1);
  assertEquals(g.mode, "spring_overshoot");
  assertEquals(g.source, "row");
});

Deno.test("phenologyGate: matching mode present but not first -> 0.6", () => {
  const g = phenologyGate("autumn", TARSIGER);
  assertEquals(g.gate, 0.6);
  assertEquals(g.mode, "autumn_drift");
});

Deno.test("phenologyGate: only matching mode is post_breeding_dispersal -> 0.35", () => {
  const row: PhenologyRow = {
    ...TARSIGER,
    arrival_modes: ["spring_overshoot", "post_breeding_dispersal"],
  };
  const g = phenologyGate("autumn", row);
  assertEquals(g.gate, 0.35);
  assertEquals(g.mode, "post_breeding_dispersal");
});

Deno.test("phenologyGate: empty arrival_modes -> 0.05", () => {
  assertEquals(
    phenologyGate("spring", { ...TARSIGER, arrival_modes: [] }).gate,
    0.05,
  );
});

Deno.test("phenologyGate: null season -> 0.05", () => {
  assertEquals(phenologyGate(null, TARSIGER).gate, 0.05);
});

Deno.test("phenologyGate: missing row -> 0.5 and source 'missing'", () => {
  const g = phenologyGate("spring", null);
  assertEquals(g.gate, 0.5);
  assertEquals(g.source, "missing");
  assertEquals(g.mode, null);
});

// ---- directionFit ----------------------------------------------------------

const WIND = (from: number): { from_deg: number; speed_kmh: number } => ({
  from_deg: from,
  speed_kmh: 35,
});

Deno.test("directionFit: wind from the arrival bearing -> 1", () => {
  assertAlmostEquals(directionFit(WIND(60), 60), 1, 1e-9);
});

Deno.test("directionFit: wind from the opposite bearing -> 0", () => {
  assertEquals(directionFit(WIND(240), 60), 0);
});

Deno.test("directionFit: 45 degrees off -> ~0.707", () => {
  assertAlmostEquals(directionFit(WIND(105), 60), Math.SQRT1_2, 1e-9);
});

Deno.test("directionFit: below MIN_TRANSPORT_KMH -> 0.5", () => {
  assertEquals(directionFit({ from_deg: 60, speed_kmh: 10 }, 60), 0.5);
});

Deno.test("directionFit: null bearing or null wind -> 0.5", () => {
  assertEquals(directionFit(WIND(60), null), 0.5);
  assertEquals(directionFit({ from_deg: null, speed_kmh: 35 }, 60), 0.5);
});

// ---- sourceFit -------------------------------------------------------------

Deno.test("sourceFit: any observed region in source_regions -> 1", () => {
  assertEquals(sourceFit(["RU-LEN"], ["FI", "RU-LEN"]), 1);
  // a match on a non-nearest region still counts
  assertEquals(sourceFit(["PL", "LV", "FI"], ["FI", "RU-LEN"]), 1);
});

Deno.test("sourceFit: no observed region in source_regions -> 0.3", () => {
  assertEquals(sourceFit(["PL"], ["FI", "RU-LEN"]), 0.3);
  assertEquals(sourceFit(["PL", "BY"], ["FI", "RU-LEN"]), 0.3);
});

Deno.test("sourceFit: no source_regions or no observations -> 0.5", () => {
  assertEquals(sourceFit(["PL"], null), 0.5);
  assertEquals(sourceFit(["PL"], []), 0.5);
  assertEquals(sourceFit([], ["FI"]), 0.5);
});

// ---- regionToCountry / upstreamP ------------------------------------------

Deno.test("regionToCountry: RU subdivisions collapse to RU", () => {
  assertEquals(regionToCountry("RU-KR"), "RU");
  assertEquals(regionToCountry("RU-LEN"), "RU");
  assertEquals(regionToCountry("FI"), "FI");
  assertEquals(regionToCountry("PL"), null);
  assertEquals(regionToCountry("BY"), null);
  assertEquals(regionToCountry(null), null);
});

const UP: UpstreamRow[] = [
  {
    species_lat: "Phylloscopus inornatus",
    from_country: "RU",
    foreign_days: 79,
    p_ee_30d: 0.392,
  },
  {
    species_lat: "Tarsiger cyanurus",
    from_country: "RU",
    foreign_days: 4,
    p_ee_30d: 0.9,
  },
];

Deno.test("upstreamP: foreign_days below 5 is not informative -> 0", () => {
  assertEquals(upstreamP("Tarsiger cyanurus", ["RU-LEN"], UP), 0);
});

Deno.test("upstreamP: informative row returns p_ee_30d", () => {
  assertEquals(upstreamP("Phylloscopus inornatus", ["RU-KR"], UP), 0.392);
});

Deno.test("upstreamP: takes the max across observed countries", () => {
  const rows: UpstreamRow[] = [
    { species_lat: "X y", from_country: "FI", foreign_days: 20, p_ee_30d: 0.2 },
    { species_lat: "X y", from_country: "RU", foreign_days: 20, p_ee_30d: 0.8 },
  ];
  assertEquals(upstreamP("X y", ["FI"], rows), 0.2);
  assertEquals(upstreamP("X y", ["FI", "RU-LEN"], rows), 0.8);
});

Deno.test("upstreamP: countries with no stats -> 0", () => {
  assertEquals(upstreamP("Phylloscopus inornatus", ["PL"], UP), 0);
  assertEquals(upstreamP("Phylloscopus inornatus", [], UP), 0);
});

// ---- scoreV4 ---------------------------------------------------------------

Deno.test("V4: the frozen fit constants are the ones approved at STOP D3", () => {
  assertEquals(V4.DIR_W, 0);
  assertEquals(V4.SRC_W, 0);
  assertEquals(V4.UP_W, 60);
  assertEquals(V4.CAL_A, 0.02055);
  assertEquals(V4.CAL_B, -2.0367);
});

Deno.test("scoreV4: applies the frozen Platt constants to calibrated_score", () => {
  const f = scoreV4({
    tier_base: 18,
    count: 0.5,
    distance: 0.5,
    season_signal: 0.5,
    today: new Date("2026-05-20T00:00:00Z"),
    species_lat: "Tarsiger cyanurus",
    phen: TARSIGER,
    wind: WIND(130),
    regions: ["FI"],
    upstream: UP,
  });
  assertEquals(f.season, "spring");
  assertEquals(f.phenology_gate, 1);
  assertEquals(f.phenology_source, "row");
  assertEquals(f.source_fit, 1);
  // direction_fit is 1 here and source_fit is 1, but DIR_W = SRC_W = 0; the FI
  // upstream row is absent so the UP_W term is 0 too -- raw is the v3 trio.
  assertEquals(f.direction_fit, 1);
  assertEquals(f.upstream, 0);
  assertEquals(f.raw, 18 + 25 * 0.5 + 25 * 0.5 + 25 * 0.5);
  assertEquals(f.calibrated_score, f.raw); // gate 1
  // pct is the Platt sigmoid of calibrated_score, clamped.
  const expected = Math.max(
    V4.FLOOR,
    Math.min(
      V4.CEIL,
      Math.round(
        100 / (1 + Math.exp(-(V4.CAL_A * f.calibrated_score + V4.CAL_B))),
      ),
    ),
  );
  assertEquals(f.pct, expected);
  assertEquals(f.pct, 29);
});

Deno.test("scoreV4: the gate multiplies the raw score", () => {
  const f = scoreV4({
    tier_base: 18,
    count: 0,
    distance: 0,
    season_signal: 0,
    today: new Date("2026-02-01T00:00:00Z"), // out of every window -> gate 0.05
    species_lat: "Tarsiger cyanurus",
    phen: TARSIGER,
    wind: WIND(130),
    regions: ["FI"],
    upstream: [],
  });
  assertEquals(f.season, null);
  assertEquals(f.phenology_gate, 0.05);
  assertEquals(f.raw, 18);
  assertAlmostEquals(f.calibrated_score, 0.9, 1e-9);
});

Deno.test("scoreV4: no phenology row still gets an upstream signal", () => {
  const f = scoreV4({
    tier_base: 18,
    count: 0,
    distance: 0,
    season_signal: 0,
    today: new Date("2026-09-20T00:00:00Z"),
    species_lat: "Phylloscopus inornatus",
    phen: null, // no phenology row -> gate 0.5, source "missing"
    wind: WIND(60),
    regions: ["RU-KR"],
    upstream: UP,
  });
  assertEquals(f.phenology_source, "missing");
  assertEquals(f.phenology_gate, 0.5);
  assertEquals(f.upstream, 0.392);
});
