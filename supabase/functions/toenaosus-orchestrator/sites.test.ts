// toenaosus-orchestrator / sites.test.ts
// Imports sites.ts only -- never index.ts, whose top-level Deno.serve() would
// start a server inside `deno test`.

import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  anchorSites,
  historySites,
  predictedSitesFor,
  scoreCell,
  seasonMonths,
  type SiteCell,
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
const WETLAND = ["Kabli", "Haeska", "Matsalu"];

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
  // Käsmu 5.8, Pärispea 5.4, Tahkuna 289.3, Ristna 281.9.
  // Arriving from the SW, Kihnu is the closest fit -- not Sõrve, which sits
  // ~10 degrees further round.
  const sw = anchorSites("seabird", 225);
  assertEquals(sw.map((s) => s.label), ["Kihnu", "Sõrve säär"]);

  // Arriving from the NNE, the northern headlands take over entirely.
  const ne = anchorSites("seabird", 20);
  assertEquals(ne.map((s) => s.label), ["Käsmu", "Pärispea poolsaar"]);

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
