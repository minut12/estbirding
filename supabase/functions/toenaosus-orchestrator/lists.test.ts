// toenaosus-orchestrator / lists.test.ts
// Imports lists.ts only -- never index.ts, whose top-level Deno.serve() would
// start a server inside `deno test`.

import { assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  dedupeEvents,
  findTrack,
  groupJubaEestis,
  nearEvent,
  type RareObsRow,
  type SightingEvent,
  sortHooaeg,
  tallinnDate,
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
  });
  const out = sortHooaeg([
    mk("B", 5, 1),
    mk("A", 5, 1),
    mk("C", 5, 3),
    mk("D", 9, 0),
  ]);
  assertEquals(out.map((x) => x.species_et), ["D", "C", "A", "B"]);
});
