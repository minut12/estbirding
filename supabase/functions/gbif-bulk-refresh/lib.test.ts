// gbif-bulk-refresh / lib.test.ts
// Pure-function tests. Imports lib.ts only -- never index.ts, whose top-level
// Deno.serve() would start a server inside `deno test` (P3 D0).

import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@^1.0.19";
import {
  buildCountUrl,
  buildOccurrenceUrl,
  isCountry,
  RU_BBOX_WKT,
  selectSpecies,
} from "./lib.ts";

Deno.test("buildOccurrenceUrl: EE has no geometry and pages from offset 0", () => {
  const url = buildOccurrenceUrl(5231244, "EE", 2025, 2026, 0);
  assertStringIncludes(url, "taxonKey=5231244");
  assertStringIncludes(url, "country=EE");
  assertStringIncludes(url, "hasCoordinate=true");
  assertStringIncludes(url, "year=2025,2026");
  assertStringIncludes(url, "limit=300");
  assertStringIncludes(url, "offset=0");
  assertFalse(url.includes("geometry"), "EE must not carry a geometry filter");
});

Deno.test("buildOccurrenceUrl: RU carries the encoded NW bbox and page 2 -> offset 600", () => {
  const url = buildOccurrenceUrl(5231244, "RU", 2010, 2026, 2);
  assertStringIncludes(url, "country=RU");
  assertStringIncludes(url, "offset=600");
  assertStringIncludes(url, `geometry=${encodeURIComponent(RU_BBOX_WKT)}`);
});

Deno.test("buildCountUrl: limit=0, no paging, geometry only for RU", () => {
  const fi = buildCountUrl(5231244, "FI", 2010, 2026);
  assertStringIncludes(fi, "country=FI");
  assertStringIncludes(fi, "hasCoordinate=true");
  assertStringIncludes(fi, "year=2010,2026");
  assertStringIncludes(fi, "limit=0");
  assertFalse(fi.includes("offset"), "a count probe must not page");
  assertFalse(fi.includes("geometry"), "FI must not carry a geometry filter");

  const ru = buildCountUrl(5231244, "RU", 2010, 2026);
  assertStringIncludes(ru, `geometry=${encodeURIComponent(RU_BBOX_WKT)}`);
  assertStringIncludes(ru, "limit=0");
});

// Keys deliberately out of order: the sort is part of the contract, because
// batch-driver pages this list by numeric offset across hops.
const ITEMS: Record<string, unknown> = {
  ccc: { scientificName: "C c", rarityLevel: "mega" },
  aaa: { scientificName: "A a", rarityLevel: "none" },
  bbb: { scientificName: "B b", rarityLevel: "rare" },
};

Deno.test("selectSpecies: EE keeps every tier, foreign keeps rare+ only", () => {
  const ee = selectSpecies(ITEMS, "EE");
  assertEquals(ee.length, 3);

  const fi = selectSpecies(ITEMS, "FI");
  assertEquals(fi.length, 2);
  assertEquals(fi.map((s) => s.species_name), ["Bbb", "Ccc"]);
  assertEquals(fi.map((s) => s.tier), ["rare", "mega"]);
});

Deno.test("selectSpecies: sorted by species_name regardless of key order", () => {
  assertEquals(
    selectSpecies(ITEMS, "EE").map((s) => s.species_name),
    ["Aaa", "Bbb", "Ccc"],
  );
});

Deno.test("selectSpecies: an empty scientificName is dropped for every country", () => {
  const items: Record<string, unknown> = {
    ...ITEMS,
    ddd: { scientificName: "", rarityLevel: "mega" },
  };
  assertEquals(selectSpecies(items, "EE").length, 3);
  assertEquals(selectSpecies(items, "FI").length, 2);
  assertFalse(selectSpecies(items, "EE").some((s) => s.species_name === "Ddd"));
});

Deno.test("selectSpecies: a missing rarityLevel is tier 'none' -- EE keeps it, FI drops it", () => {
  const items: Record<string, unknown> = { eee: { scientificName: "E e" } };
  const ee = selectSpecies(items, "EE");
  assertEquals(ee.length, 1);
  assertEquals(ee[0].tier, "none");
  assertEquals(ee[0].species_name, "Eee");
  assertEquals(ee[0].species_lat, "E e");
  assertEquals(selectSpecies(items, "FI").length, 0);
});

Deno.test("isCountry: narrows only the six known codes", () => {
  assert(isCountry("FI"));
  assert(isCountry("EE"));
  assertFalse(isCountry("DE"));
  assertFalse(isCountry(1));
  assertFalse(isCountry(null));
});
