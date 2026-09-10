// toenaosus-orchestrator / sites.test.ts
// Imports sites.ts only -- never index.ts, whose top-level Deno.serve() would
// start a server inside `deno test`.

import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  anchorSites,
  haversineKm,
  historySites,
  inWatchArc,
  predictedSitesFor,
  RESCUE_MAX_KM,
  scoreCell,
  seasonMonths,
  type SiteCell,
  SITES_MAX_TOTAL,
} from "./sites.ts";

const TODAY = new Date("2026-09-05T00:00:00Z");

const cell = (over: Partial<SiteCell>): SiteCell => ({
  species_name: "Söödikänn",
  cell_lat: 59.25,
  cell_lon: 23.5,
  lat: 59.23,
  lon: 23.51,
  n_total: 10,
  n_season: 10,
  n_recent5y: 5,
  n_effort: 300,
  last_date: "2026-08-30",
  label: "Põõsaspea",
  county: "Lääne",
  ...over,
});

// Sõrve säär is SW of the centre (58.6 N, 25.5 E); Pärispea is almost due N.
const SORVE = cell({
  label: "Sõrve",
  lat: 57.91,
  lon: 22.06,
  cell_lat: 57.9,
  cell_lon: 22.0,
});
const PARISPEA = cell({
  label: "Pärispea",
  lat: 59.67,
  lon: 25.70,
  cell_lat: 59.75,
  cell_lon: 25.75,
});

// ---- seasonMonths ----------------------------------------------------------

Deno.test("seasonMonths: September -> [8, 9, 10]", () => {
  assertEquals(seasonMonths(new Date("2026-09-05T00:00:00Z")), [8, 9, 10]);
});

Deno.test("seasonMonths: January wraps to [12, 1, 2]", () => {
  assertEquals(seasonMonths(new Date("2026-01-15T00:00:00Z")), [12, 1, 2]);
});

Deno.test("seasonMonths: December wraps to [11, 12, 1]", () => {
  assertEquals(seasonMonths(new Date("2026-12-15T00:00:00Z")), [11, 12, 1]);
});

// ---- scoreCell -------------------------------------------------------------

Deno.test("scoreCell: seasonal count outweighs a bigger all-year total", () => {
  const seasonal = cell({
    n_total: 20,
    n_season: 20,
    n_recent5y: 0,
    last_date: null,
  });
  const allYear = cell({
    n_total: 200,
    n_season: 1,
    n_recent5y: 0,
    last_date: null,
  });
  assert(
    scoreCell(seasonal, null, TODAY) > scoreCell(allYear, null, TODAY),
    "n_season must dominate n_total",
  );
});

Deno.test("scoreCell: a recent last_date adds the freshness bonus", () => {
  const fresh = cell({ last_date: "2026-08-30" });
  const stale = cell({ last_date: "2015-08-30" });
  assertEquals(
    Math.round(
      (scoreCell(fresh, null, TODAY) - scoreCell(stale, null, TODAY)) * 100,
    ) / 100,
    0.5,
  );
});

Deno.test("scoreCell: bearing 200 favours the SW cell, bearing 20 the N cell", () => {
  // Arriving from the SSW: Sõrve sits along that bearing, Pärispea opposite it.
  assert(scoreCell(SORVE, 200, TODAY) > scoreCell(PARISPEA, 200, TODAY));
  // Arriving from the NNE: the ordering flips.
  assert(scoreCell(SORVE, 20, TODAY) < scoreCell(PARISPEA, 20, TODAY));
});

// ---- historySites ----------------------------------------------------------

Deno.test("historySites: drops n_season 0 cells", () => {
  const sites = historySites(
    [cell({ label: "Kept" }), cell({ label: "Dropped", n_season: 0 })],
    null,
    TODAY,
  );
  assertEquals(sites.length, 1);
  assertEquals(sites[0].label, "Kept");
  assertEquals(sites[0].source, "history");
  assertEquals(sites[0].cluster_n, 10);
});

Deno.test("historySites: caps at 3", () => {
  const many = [1, 2, 3, 4, 5].map((i) => cell({ label: `C${i}`, n_season: i }));
  const sites = historySites(many, null, TODAY);
  assertEquals(sites.length, 3);
  // Best first: n_season 5, 4, 3.
  assertEquals(sites.map((s) => s.label), ["C5", "C4", "C3"]);
});

Deno.test("historySites: ranks by effort-normalised share, not raw n_season (Söödikänn)", () => {
  // From the P6b.1 spec: n_season / n_effort per cell, Aug-Oct.
  const mk = (label: string, n_season: number, n_effort: number) =>
    cell({ label, n_season, n_effort, n_recent5y: 0, last_date: null });
  const cells = [
    mk("Põõsaspea", 236, 18_299),
    mk("Sõrve", 120, 13_331),
    mk("Pärispea", 24, 1_620),
    mk("Ristna", 11, 399),
    mk("Paldiski", 8, 369),
    mk("Tahkuna", 7, 796),
  ];
  const sites = historySites(cells, null, TODAY);
  // Raw n_season order would be Põõsaspea, Sõrve, Pärispea -- share flips it:
  // Ristna's tiny effort makes its 11 records far more diagnostic.
  assertEquals(sites.map((s) => s.label), ["Ristna", "Põõsaspea", "Pärispea"]);
});

Deno.test("historySites: MIN_SEASON_DAYS excludes a thin cell when a real one exists, but not when it's alone", () => {
  const thin = cell({ label: "Thin", n_season: 2 });
  const real = cell({ label: "Real", n_season: 3 });

  const withBoth = historySites([thin, real], null, TODAY);
  assertEquals(withBoth.map((s) => s.label), ["Real"]);

  const alone = historySites([thin], null, TODAY);
  assertEquals(alone.map((s) => s.label), ["Thin"]);
});

Deno.test("scoreCell: n_effort 0 falls back to the prior, never NaN", () => {
  const zeroEffort = cell({ n_season: 5, n_effort: 0, n_recent5y: 0, last_date: null });
  const score = scoreCell(zeroEffort, null, TODAY);
  assert(Number.isFinite(score), "score must be finite, not NaN");
  // share = 5 / (0 + EFFORT_PRIOR=200) = 0.025 -> shareTerm = 400*0.025 = 10;
  // seasonal = 0.5*ln(6); recent = 0; fresh = 0; sectorFit(null) = 0.5.
  const expected = 10 + 0.5 * Math.log(6) + 0 + 0 + 0.5;
  assertAlmostEquals(score, expected, 1e-9);
});

Deno.test("scoreCell: the share term is capped, so two very different cells can tie on it", () => {
  // 500/(100+200) = 1.667 -> capped; 50/(800+200) = 0.05 exactly -> capped too.
  const c1 = cell({ n_season: 500, n_effort: 100, n_recent5y: 0, last_date: null });
  const c2 = cell({ n_season: 50, n_effort: 800, n_recent5y: 0, last_date: null });
  const s1 = scoreCell(c1, null, TODAY);
  const s2 = scoreCell(c2, null, TODAY);
  const seasonal1 = 0.5 * Math.log(1 + 500);
  const seasonal2 = 0.5 * Math.log(1 + 50);
  // Subtracting each cell's own seasonal term isolates the share term (plus
  // the identical recent/fresh/sectorFit residual); both must land on
  // SHARE_W * SHARE_CAP (400 * 0.05 = 20) + the neutral sectorFit (0.5).
  assertAlmostEquals(s1 - seasonal1, 20.5, 1e-9);
  assertAlmostEquals(s2 - seasonal2, 20.5, 1e-9);
  assertAlmostEquals(s1 - seasonal1, s2 - seasonal2, 1e-9);
});

Deno.test("historySites: label falls back to county, then to the grid square", () => {
  const byCounty = historySites([cell({ label: null })], null, TODAY);
  assertEquals(byCounty[0].label, "Lääne");

  const byGrid = historySites(
    [cell({ label: null, county: null, cell_lat: 58.25, cell_lon: 26.5 })],
    null,
    TODAY,
  );
  assertEquals(byGrid[0].label, "Ruut 58.25 N, 26.50 E");
  assertEquals(byGrid[0].county, null);
});

// ---- anchorSites -----------------------------------------------------------

const INLAND = ["Aardla", "Kallaste (Peipsi)", "Värska (Setomaa)", "Karula"];
const WETLAND = [
  "Kabli",
  "Haeska",
  "Matsalu",
  "Vasknarva",
  "Vormsi (Rumpo)",
  "Kübassaare",
];

Deno.test("anchorSites: raptor_soaring gets inland points only", () => {
  const sites = anchorSites("raptor_soaring", null);
  assertEquals(sites.length, 2);
  for (const s of sites) {
    assert(INLAND.includes(s.label), `${s.label} is not an inland anchor`);
    assertEquals(s.source, "anchor");
    assertEquals(s.cluster_n, 0);
    assertEquals(s.county, null);
  }
});

Deno.test("anchorSites: seabird gets no wetland or inland point", () => {
  const sites = anchorSites("seabird", null);
  assertEquals(sites.length, 2);
  for (const s of sites) {
    assert(
      !INLAND.includes(s.label) && !WETLAND.includes(s.label),
      `${s.label} is not a headland or island`,
    );
  }
});

Deno.test("anchorSites: an unknown flight class accepts any kind", () => {
  assertEquals(anchorSites(null, null).length, 2);
  assertEquals(anchorSites("no_such_class", null).length, 2);
});

Deno.test("anchorSites: bearing steers which anchors win", () => {
  // Bearings from the centre of Estonia: Kihnu 240.1, Sõrve 250.6,
  // Käsmu 5.8, Pärispea 5.4, Tahkuna 289.3, Ristna 281.9, Vainupea 17.2.
  // Arriving from the SW, Kihnu is the closest fit -- not Sõrve, which sits
  // ~10 degrees further round.
  const sw = anchorSites("seabird", 225);
  assertEquals(sw.map((s) => s.label), ["Kihnu", "Sõrve säär"]);

  // Arriving from the NNE, the northern headlands take over entirely. P12's
  // Vainupea sits almost on the bearing (fit 0.999) and displaces Pärispea;
  // Käsmu keeps second on fit (0.969 to Pärispea's 0.968), not on order.
  const ne = anchorSites("seabird", 20);
  assertEquals(ne.map((s) => s.label), ["Vainupea (Lahemaa)", "Käsmu"]);

  // The live case: this raport's tubenoses carry bearing 290 and no EE history.
  const wnw = anchorSites("seabird", 290);
  assertEquals(wnw.map((s) => s.label), ["Tahkuna nina", "Ristna"]);
});

// ---- predictedSitesFor -----------------------------------------------------

Deno.test("predictedSitesFor: history wins when seasonal cells exist", () => {
  const sites = predictedSitesFor(
    [cell({})],
    { bearingFrom: null, flightClass: "seabird" },
    TODAY,
  );
  assertEquals(sites.length, 1);
  assertEquals(sites[0].source, "history");
  assertEquals(sites[0].label, "Põõsaspea");
});

Deno.test("predictedSitesFor: no cells falls back to anchors", () => {
  const sites = predictedSitesFor(
    [],
    { bearingFrom: 290, flightClass: "seabird" },
    TODAY,
  );
  assertEquals(sites.length, 2);
  for (const s of sites) {
    assertEquals(s.source, "anchor");
    assertEquals(s.cluster_n, 0);
  }
});

Deno.test("predictedSitesFor: cells with only n_season 0 fall back to anchors", () => {
  const sites = predictedSitesFor(
    [cell({ n_season: 0 }), cell({ n_season: 0, label: "Teine" })],
    { bearingFrom: null, flightClass: "raptor_soaring" },
    TODAY,
  );
  assertEquals(sites.length, 2);
  assertEquals(sites.every((s) => s.source === "anchor"), true);
});

// ---- P6d: watch arc --------------------------------------------------------
// The arc is WHERE THE BIRD IS SEEN, distinct from arrival_bearing (where it
// comes FROM). Bearings below are from EE_CENTRE (58.6 N, 25.5 E):
//   Pärispea 5.4  Käsmu 5.8  Kallaste 85.3  Sõrve säär 250.6  Haeska 281.2
//   Ristna 281.9  Tahkuna nina 289.3  Põõsaspea neem 302.4  Pakri 316.8

Deno.test("inWatchArc: an arc wrapping through 0 admits both sides of north", () => {
  // 282 -> 20 is a north-coast arc: admits Tahkuna (289) and Pärispea (5),
  // rejects Sõrve säär (250) and Kallaste (85).
  assertEquals(inWatchArc(289.3, 282, 20), true);
  assertEquals(inWatchArc(5.4, 282, 20), true);
  assertEquals(inWatchArc(250.6, 282, 20), false);
  assertEquals(inWatchArc(85.3, 282, 20), false);
  // Edges are inclusive.
  assertEquals(inWatchArc(282, 282, 20), true);
  assertEquals(inWatchArc(20, 282, 20), true);
  assertEquals(inWatchArc(281.9, 282, 20), false);
  assertEquals(inWatchArc(20.1, 282, 20), false);
});

Deno.test("inWatchArc: a non-wrapping arc works without the wrap branch", () => {
  assertEquals(inWatchArc(85.3, 90, 200), false);
  assertEquals(inWatchArc(114.7, 90, 200), true);
  assertEquals(inWatchArc(148.1, 90, 200), true);
  assertEquals(inWatchArc(250.6, 90, 200), false);
  assertEquals(inWatchArc(5.4, 90, 200), false);
});

Deno.test("inWatchArc: a null or absent bound filters nothing", () => {
  assertEquals(inWatchArc(250.6, null, 20), true);
  assertEquals(inWatchArc(250.6, 282, null), true);
  assertEquals(inWatchArc(250.6, undefined, undefined), true);
});

Deno.test("anchorSites: a null arc is byte-identical to pre-P6d output", () => {
  // The no-regression proof for the four tormilind watch-list species.
  const before = anchorSites("seabird", 290);
  assertEquals(
    JSON.stringify(anchorSites("seabird", 290, 2, { from: null, to: null })),
    JSON.stringify(before),
  );
  assertEquals(
    JSON.stringify(anchorSites("seabird", 290, 2, undefined)),
    JSON.stringify(before),
  );
  // ...and that output is still the live one.
  assertEquals(before.map((s) => s.label), ["Tahkuna nina", "Ristna"]);
});

Deno.test("anchorSites: an arc narrows eligibility but not ordering or cap", () => {
  // 0 -> 90 keeps Pärispea (5.4), Käsmu (5.8) and, since P12, Vainupea (17.2)
  // and Narva-Jõesuu (55.3) among seabird kinds. At bearing 290 the two new
  // ones score 0.049 and 0.000, so the arc narrows eligibility without
  // touching the order or the cap -- which is what this test is for.
  const sites = anchorSites("seabird", 290, 2, { from: 0, to: 90 });
  assertEquals(sites.map((s) => s.label), ["Pärispea poolsaar", "Käsmu"]);
  assertEquals(sites.every((s) => s.source === "anchor"), true);
});

Deno.test("anchorSites: the flight-class filter still excludes an in-arc anchor", () => {
  // 275 -> 295 contains Haeska (281.2, wetland), Ristna (281.9) and Tahkuna
  // (289.3). A seabird may not land at a wetland, so Haeska stays out.
  const seabird = anchorSites("seabird", 290, 5, { from: 275, to: 295 });
  assertEquals(seabird.some((s) => s.label === "Haeska"), false);
  assertEquals(seabird.some((s) => s.label === "Tahkuna nina"), true);
  // A wader may, so the same arc yields it.
  const wader = anchorSites("wader", 290, 5, { from: 275, to: 295 });
  assertEquals(wader.some((s) => s.label === "Haeska"), true);
});

// ---- P6d: corroborated rescue ----------------------------------------------
// Fixture is Söödikänn's live pool: three cells ship, three do not.
// share = n_season / (n_effort + 200).

const SOODIKANN: SiteCell[] = [
  cell({ label: "Põõsaspea", lat: 59.2285, lon: 23.5072, cell_lat: 59.25, cell_lon: 23.5, n_season: 236, n_recent5y: 252, n_effort: 18299, last_date: "2026-08-31" }),
  cell({ label: "Sõrve", lat: 57.9186, lon: 22.0524, cell_lat: 58.0, cell_lon: 22.0, n_season: 121, n_recent5y: 100, n_effort: 13331, last_date: "2026-09-07" }),
  cell({ label: "Pärispea küla", lat: 59.6721, lon: 25.7010, cell_lat: 59.75, cell_lon: 25.75, n_season: 24, n_recent5y: 26, n_effort: 1620, last_date: "2026-08-25" }),
  cell({ label: "Ristna", lat: 58.9284, lon: 22.0396, cell_lat: 59.0, cell_lon: 22.0, n_season: 11, n_recent5y: 100, n_effort: 399, last_date: "2026-05-31" }),
  cell({ label: "Paldiski", lat: 59.3944, lon: 24.0435, cell_lat: 59.5, cell_lon: 24.0, n_season: 8, n_recent5y: 4, n_effort: 369, last_date: "2025-09-19" }),
  cell({ label: "Tahkuna", lat: 59.0913, lon: 22.5881, cell_lat: 59.0, cell_lon: 22.5, n_season: 7, n_recent5y: 3, n_effort: 796, last_date: "2025-09-09" }),
];

const NORTH_COAST = {
  bearingFrom: 20,
  flightClass: "seabird",
  arcFrom: 282,
  arcTo: 20,
};

Deno.test("predictedSitesFor: a null arc rescues nothing (no-regression proof)", () => {
  const before = predictedSitesFor(
    SOODIKANN,
    { bearingFrom: 20, flightClass: "seabird" },
    TODAY,
  );
  assertEquals(before.length, 3);
  assertEquals(before.map((s) => s.label), [
    "Ristna",
    "Põõsaspea",
    "Pärispea küla",
  ]);
  // Explicit nulls must behave exactly as absent fields do.
  assertEquals(
    JSON.stringify(predictedSitesFor(
      SOODIKANN,
      { bearingFrom: 20, flightClass: "seabird", arcFrom: null, arcTo: null },
      TODAY,
    )),
    JSON.stringify(before),
  );
});

Deno.test("predictedSitesFor: rescue accepted, appended after the three in score order", () => {
  const sites = predictedSitesFor(SOODIKANN, NORTH_COAST, TODAY);
  assertEquals(sites.length, 5);
  assertEquals(sites.map((s) => s.label), [
    "Ristna",
    "Põõsaspea",
    "Pärispea küla",
    "Paldiski",
    "Tahkuna",
  ]);
  // The three shipped rows keep their original cluster_n and source.
  assertEquals(sites.slice(0, 3).map((s) => s.cluster_n), [11, 236, 24]);
  // A rescued row is a history row: real cluster_n, its own coordinates.
  for (const s of sites.slice(3)) assertEquals(s.source, "history");
  assertEquals(sites[3].cluster_n, 8);
  assertEquals(sites[4].cluster_n, 7);
  assertEquals(sites[4].lat, 59.0913);
  assertEquals(sites[4].lon, 22.5881);
  // Rescues rank below every row they join.
  assert(sites[3].score <= sites[2].score);
  assert(sites[4].score <= sites[3].score);
});

Deno.test("predictedSitesFor: Sõrve is rejected -- outside the arc and over 1 km", () => {
  // Sõrve's share (.00894) clears the floor, so only the arc and the distance
  // gate keep it out: bearing 250.6 is outside 282->20, and the cell mean sits
  // 1.06 km from Sõrve säär.
  const sites = predictedSitesFor(SOODIKANN, NORTH_COAST, TODAY);
  assertEquals(sites.some((s) => s.label === "Sõrve"), false);
});

Deno.test("predictedSitesFor: rescue rejected on distance at just over 1 km", () => {
  // Same cell, nudged just past RESCUE_MAX_KM from Tahkuna nina (59.09/22.59).
  const far = SOODIKANN.map((c) =>
    c.label === "Tahkuna" ? { ...c, lat: 59.1, lon: 22.61 } : c
  );
  assert(haversineKm(59.1, 22.61, 59.09, 22.59) > RESCUE_MAX_KM);
  const sites = predictedSitesFor(far, NORTH_COAST, TODAY);
  assertEquals(sites.some((s) => s.label === "Tahkuna"), false);
  // Paldiski still rescues, so the rejection is the distance and nothing else.
  assertEquals(sites.some((s) => s.label === "Paldiski"), true);
});

Deno.test("predictedSitesFor: rescue rejected on share -- the rule 16 guard", () => {
  // Veetallaja's Türju küla: 3 seasonal records in one of Estonia's most-watched
  // cells. share = 3/13531 = .00022, about 0.05x the weakest shipped row. It
  // passes distance and arc, and must still be refused -- otherwise "near an
  // anchor" becomes a side door back to raw-count ranking, opening exactly
  // where observer effort is highest.
  const thin = SOODIKANN.map((c) =>
    c.label === "Tahkuna" ? { ...c, n_season: 3, n_effort: 13331 } : c
  );
  const cellShare = 3 / (13331 + 200);
  const weakestShipped = 236 / (18299 + 200); // Põõsaspea, weakest of the three
  assert(cellShare / weakestShipped < 0.1);
  const sites = predictedSitesFor(thin, NORTH_COAST, TODAY);
  assertEquals(sites.some((s) => s.label === "Tahkuna"), false);
});

Deno.test("predictedSitesFor: the share gate is a ratio, not an absolute floor", () => {
  const weakestShipped = 236 / (18299 + 200);
  const mk = (n_season: number) =>
    SOODIKANN.map((c) =>
      c.label === "Tahkuna" ? { ...c, n_season, n_effort: 800 } : c
    );
  // 3/1000 = .0030 is under 0.5x .01276; 12/1000 = .0120 is over it.
  assert(3 / 1000 < weakestShipped * 0.5);
  assert(12 / 1000 > weakestShipped * 0.5);
  assertEquals(
    predictedSitesFor(mk(12), NORTH_COAST, TODAY).some((s) =>
      s.label === "Tahkuna"
    ),
    true,
  );
  assertEquals(
    predictedSitesFor(mk(3), NORTH_COAST, TODAY).some((s) =>
      s.label === "Tahkuna"
    ),
    false,
  );
});

Deno.test("predictedSitesFor: at most 2 rescues, 5 sites total", () => {
  // A third rescuable cell on Põõsaspea neem (59.23/23.51, bearing 302.4).
  // share 10/1000 = .0100 clears the .00638 floor, but its score stays under
  // Pärispea küla's 10.00 so it lands sub-cap rather than displacing a row.
  const extra = SOODIKANN.concat([
    cell({ label: "Osmussaar", lat: 59.232, lon: 23.512, cell_lat: 59.25, cell_lon: 23.5, n_season: 10, n_recent5y: 5, n_effort: 800, last_date: "2026-08-20" }),
  ]);
  const sites = predictedSitesFor(extra, NORTH_COAST, TODAY);
  // Three rescuable cells compete; RESCUE_MAX takes two, SITES_MAX_TOTAL caps 5.
  assertEquals(sites.length, SITES_MAX_TOTAL);
  assertEquals(sites.slice(0, 3).map((s) => s.label), [
    "Ristna",
    "Põõsaspea",
    "Pärispea küla",
  ]);
  assertEquals(sites.slice(3).length, 2);
  assertEquals(sites.slice(3).every((s) => s.source === "history"), true);
});

Deno.test("predictedSitesFor: the flight-class filter gates rescue too", () => {
  // raptor_soaring may only land inland, so no coastal anchor can corroborate a
  // coastal cell however close it sits or however wide the arc.
  const sites = predictedSitesFor(
    SOODIKANN,
    { bearingFrom: 20, flightClass: "raptor_soaring", arcFrom: 0, arcTo: 359 },
    TODAY,
  );
  assertEquals(sites.length, 3);
  assertEquals(sites.some((s) => s.label === "Tahkuna"), false);
});

Deno.test("predictedSitesFor: a sub-MIN_SEASON_DAYS cell is never rescued", () => {
  const thin = SOODIKANN.map((c) =>
    c.label === "Tahkuna" ? { ...c, n_season: 2, n_effort: 10 } : c
  );
  // share 2/210 = .0095 clears the floor easily; only the qualify gate refuses.
  const sites = predictedSitesFor(thin, NORTH_COAST, TODAY);
  assertEquals(sites.some((s) => s.label === "Tahkuna"), false);
});
