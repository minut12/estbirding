// toenaosus-orchestrator / eta.test.ts
// Imports eta.ts only -- never index.ts, whose top-level Deno.serve() would
// start a server inside `deno test`.

import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  buildOpenMeteoUrl,
  etaFor,
  formatEtaEt,
  haversineKm,
  initialBearingDeg,
  midpoint,
  parseOpenMeteo,
  tailwindKmh,
  windLabelEt,
  type WindSample,
} from "./eta.ts";

const NOW = new Date("2026-09-06T12:00:00Z");
const MS_PER_DAY = 86_400_000;

const sample = (over: Partial<WindSample>): WindSample => ({
  lat: 59,
  lon: 25,
  speedKmh: 20,
  dirFromDeg: 90,
  ...over,
});

// --- tailwind sign -----------------------------------------------------------
// NOTE: signs below follow the Design block formula
//   tailwind = speed * cos(travel_bearing - (wind_dir_from + 180)),
// i.e. wind FROM 270 (a westerly) pushes a bird flying east (bearing 90).
// The P5 prose in B2 states the opposite sign for both examples; flagged to the
// architect at STOP B. Flipping the ruling flips only `towardDeg` in eta.ts.
Deno.test("tailwindKmh: wind FROM 270 aids travel on bearing 90 (positive)", () => {
  const t = tailwindKmh([sample({ dirFromDeg: 270, speedKmh: 20 })], 90);
  assert(t !== null);
  assertAlmostEquals(t, 20, 1e-9);
});

Deno.test("tailwindKmh: wind FROM 90 opposes travel on bearing 90 (negative)", () => {
  const t = tailwindKmh([sample({ dirFromDeg: 90, speedKmh: 20 })], 90);
  assert(t !== null);
  assertAlmostEquals(t, -20, 1e-9);
});

Deno.test("tailwindKmh: crosswind projects to ~0", () => {
  const t = tailwindKmh([sample({ dirFromDeg: 0, speedKmh: 30 })], 90);
  assert(t !== null);
  assertAlmostEquals(t, 0, 1e-9);
});

Deno.test("tailwindKmh: means across samples", () => {
  const t = tailwindKmh([
    sample({ dirFromDeg: 270, speedKmh: 20 }),
    sample({ dirFromDeg: 90, speedKmh: 10 }),
  ], 90);
  assert(t !== null);
  assertAlmostEquals(t, 5, 1e-9); // (+20 + -10) / 2
});

Deno.test("tailwindKmh: empty sample list is null", () => {
  assertEquals(tailwindKmh([], 90), null);
});

// --- ground speed clamp ------------------------------------------------------
Deno.test("etaFor: ground speed clamps at the 15 km/h floor", () => {
  const res = etaFor({
    source: { lat: 59.0, lon: 29.0, date: "2026-09-06T12:00:00Z" },
    site: { lat: 59.0, lon: 24.0, label: "Test" },
    flightClass: "raptor_soaring", // airspeed 40
    now: NOW,
  }, [sample({ dirFromDeg: 270, speedKmh: 200 })]); // westerly opposes a westbound track
  assert(res.eta_basis !== null);
  assertEquals(res.eta_basis.ground_kmh, 15);
});

Deno.test("etaFor: ground speed clamps at the 120 km/h ceiling", () => {
  const res = etaFor({
    source: { lat: 59.0, lon: 29.0, date: "2026-09-06T12:00:00Z" },
    site: { lat: 59.0, lon: 24.0, label: "Test" },
    flightClass: "waterbird", // airspeed 70
    now: NOW,
  }, [sample({ dirFromDeg: 90, speedKmh: 300 })]); // easterly drives a westbound track
  assert(res.eta_basis !== null);
  assertEquals(res.eta_basis.ground_kmh, 120);
});

// --- hours per day by flight class ------------------------------------------
Deno.test("etaFor: passerine_nocturnal flies 8 h/day, wader 10 h/day", () => {
  const base = {
    source: { lat: 59.0, lon: 29.0, date: "2026-09-06T12:00:00Z" },
    site: { lat: 59.0, lon: 24.0, label: "Test" },
    now: NOW,
  };
  const passerine = etaFor({ ...base, flightClass: "passerine_nocturnal" }, null);
  const wader = etaFor({ ...base, flightClass: "wader" }, null);
  assert(passerine.eta_basis !== null);
  assert(wader.eta_basis !== null);
  assertEquals(passerine.eta_basis.hours_per_day, 8);
  assertEquals(wader.eta_basis.hours_per_day, 10);
  assertEquals(passerine.eta_basis.airspeed_kmh, 45);
  assertEquals(wader.eta_basis.airspeed_kmh, 65);
});

Deno.test("etaFor: unknown flight class falls back to 50 km/h and 10 h/day", () => {
  const res = etaFor({
    source: { lat: 59.0, lon: 29.0, date: "2026-09-06T12:00:00Z" },
    site: { lat: 59.0, lon: 24.0, label: "Test" },
    flightClass: null,
    now: NOW,
  }, null);
  assert(res.eta_basis !== null);
  assertEquals(res.eta_basis.airspeed_kmh, 50);
  assertEquals(res.eta_basis.hours_per_day, 10);
});

// --- Estonian strings --------------------------------------------------------
Deno.test("formatEtaEt: exact strings", () => {
  assertEquals(formatEtaEt(0), "Võib juba kohal olla");
  assertEquals(formatEtaEt(1), "Varaseim saabumine: täna või homme");
  assertEquals(formatEtaEt(1.5), "Varaseim saabumine: umbes 1,5 päeva");
  assertEquals(formatEtaEt(4), "Varaseim saabumine: umbes 4 päeva");
  assertEquals(formatEtaEt(9), "Varaseim saabumine: hiljem kui nädal");
});

Deno.test("windLabelEt: thresholds at +/-10", () => {
  assertEquals(windLabelEt(10), "pärituul");
  assertEquals(windLabelEt(-10), "vastutuul");
  assertEquals(windLabelEt(0), "külgtuul");
  assertEquals(windLabelEt(9.9), "külgtuul");
  assertEquals(windLabelEt(null), null);
});

// --- eta_days floor ----------------------------------------------------------
Deno.test("etaFor: eta_days floors at 0 when the observation is old", () => {
  const old = new Date(NOW.getTime() - 30 * MS_PER_DAY).toISOString();
  const res = etaFor({
    source: { lat: 59.95, lon: 29.05, date: old },
    site: { lat: 58.93, lon: 22.05, label: "Ristna" },
    flightClass: "seabird",
    now: NOW,
  }, null);
  assertEquals(res.eta_days, 0);
});

// --- wind unavailable --------------------------------------------------------
Deno.test("etaFor: null samples give the wind-unavailable string, tailwind null", () => {
  const res = etaFor({
    source: { lat: 59.95, lon: 29.05, date: NOW.toISOString() },
    site: { lat: 58.93, lon: 22.05, label: "Ristna" },
    flightClass: "seabird",
    now: NOW,
  }, null);
  assertEquals(res.eta_window_et, "Tuuleandmed puuduvad");
  assert(res.eta_basis !== null);
  assertEquals(res.eta_basis.tailwind_kmh, null);
  assertEquals(res.eta_basis.wind_label_et, null);
  assertEquals(res.eta_basis.wind_points, 0);
  assert(typeof res.eta_days === "number"); // still computed, tailwind 0
});

Deno.test("etaFor: unparseable source date yields null eta, never throws", () => {
  const res = etaFor({
    source: { lat: 59.95, lon: 29.05, date: "not-a-date" },
    site: { lat: 58.93, lon: 22.05, label: "Ristna" },
    flightClass: "seabird",
    now: NOW,
  }, null);
  assertEquals(res.eta_days, null);
  assertEquals(res.eta_window_et, "Tuuleandmed puuduvad");
  assertEquals(res.eta_basis, null);
});

// --- parseOpenMeteo ----------------------------------------------------------
const hourly = (speeds: (number | null)[], dirs: (number | null)[], startHourUtc: number) => ({
  time: speeds.map((_, i) =>
    new Date(Date.UTC(2026, 8, 6, startHourUtc + i)).toISOString().slice(0, 16)
  ),
  wind_speed_850hPa: speeds,
  wind_direction_850hPa: dirs,
});

Deno.test("parseOpenMeteo: 2-location fixture returns 2 samples with means", () => {
  const json = [
    { latitude: 59.0, longitude: 29.0, hourly: hourly([10, 20], [90, 90], 12) },
    { latitude: 58.0, longitude: 22.0, hourly: hourly([30, 30], [180, 180], 12) },
  ];
  const samples = parseOpenMeteo(json, NOW);
  assertEquals(samples.length, 2);
  assertAlmostEquals(samples[0].speedKmh, 15, 1e-6);
  assertAlmostEquals(samples[0].dirFromDeg, 90, 1e-6);
  assertAlmostEquals(samples[1].speedKmh, 30, 1e-6);
  assertAlmostEquals(samples[1].dirFromDeg, 180, 1e-6);
});

Deno.test("parseOpenMeteo: single-object response is handled", () => {
  const json = {
    latitude: 59.0,
    longitude: 29.0,
    hourly: hourly([12, 12], [45, 45], 12),
  };
  const samples = parseOpenMeteo(json, NOW);
  assertEquals(samples.length, 1);
  assertAlmostEquals(samples[0].speedKmh, 12, 1e-6);
  assertAlmostEquals(samples[0].dirFromDeg, 45, 1e-6);
});

Deno.test("parseOpenMeteo: hours outside the window are excluded", () => {
  // Hours 0..1 UTC are before NOW (12:00 UTC).
  const json = [{ latitude: 59, longitude: 29, hourly: hourly([10, 10], [90, 90], 0) }];
  assertEquals(parseOpenMeteo(json, NOW).length, 0);
});

Deno.test("parseOpenMeteo: non-finite values are skipped", () => {
  const json = [{
    latitude: 59,
    longitude: 29,
    hourly: hourly([null, 20], [90, 90], 12),
  }];
  const samples = parseOpenMeteo(json, NOW);
  assertEquals(samples.length, 1);
  assertAlmostEquals(samples[0].speedKmh, 20, 1e-6);
});

Deno.test("parseOpenMeteo: vector mean handles the 350/10 degree wrap", () => {
  // Scalar averaging would give 180 deg -- the exact opposite direction.
  const json = [{
    latitude: 59,
    longitude: 29,
    hourly: hourly([10, 10], [350, 10], 12),
  }];
  const samples = parseOpenMeteo(json, NOW);
  assertEquals(samples.length, 1);
  assertAlmostEquals(samples[0].dirFromDeg, 0, 1e-6);
});

Deno.test("buildOpenMeteoUrl: comma-separated coordinate lists in one call", () => {
  const url = buildOpenMeteoUrl([
    { lat: 59.95, lon: 29.05 },
    { lat: 59.44, lon: 25.55 },
    { lat: 58.93, lon: 22.05 },
  ]);
  assert(url.includes("latitude=59.9500,59.4400,58.9300"));
  assert(url.includes("longitude=29.0500,25.5500,22.0500"));
  assert(url.includes("hourly=wind_speed_850hPa,wind_direction_850hPa"));
  assert(url.includes("timezone=UTC"));
});

// --- geometry helpers --------------------------------------------------------
Deno.test("midpoint: lies between source and site", () => {
  const m = midpoint(59.95, 29.05, 58.93, 22.05);
  assert(m.lat > 58.93 && m.lat < 59.95);
  assert(m.lon > 22.05 && m.lon < 29.05);
});

// --- Söödikänn worked example ------------------------------------------------
Deno.test("etaFor: Söödikänn worked example (seabird, +15 tailwind)", () => {
  const source = {
    lat: 59.95,
    lon: 29.05,
    date: new Date(NOW.getTime() - 3 * MS_PER_DAY).toISOString(),
  };
  const site = { lat: 58.93, lon: 22.05, label: "Ristna" };
  const bearing = initialBearingDeg(source.lat, source.lon, site.lat, site.lon);
  // Wind blowing exactly along the travel bearing at 15 km/h => tailwind +15.
  const samples = [sample({ speedKmh: 15, dirFromDeg: (bearing + 180) % 360 })];

  const res = etaFor({ source, site, flightClass: "seabird", now: NOW }, samples);
  assert(res.eta_basis !== null);

  const distance = haversineKm(source.lat, source.lon, site.lat, site.lon);
  assert(distance > 350 && distance < 500, `distance ${distance}`);
  assertAlmostEquals(res.eta_basis.tailwind_kmh ?? 0, 15, 1e-6);
  assertEquals(res.eta_basis.ground_kmh, 65); // 50 airspeed + 15 tailwind
  assertEquals(res.eta_basis.hours_per_day, 10);
  assertEquals(res.eta_basis.site_label, "Ristna");
  assertEquals(res.eta_basis.wind_label_et, "pärituul");
  assertEquals(res.eta_days, 0); // obs 3 d old, ~0.63 d of travel => already due
  assertEquals(res.eta_window_et, "Võib juba kohal olla");
});
