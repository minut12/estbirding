// _shared/ext-rare / merge.test.ts
// Pure-function tests for duplicate folding across eBird, Tarsiger and LOFK
// (P178d1). Imports merge.ts only; all data is synthetic.

import { assert, assertEquals } from "jsr:@std/assert@^1.0.19";
import { assignMerges, haversineKm, type MergeItem } from "./merge.ts";

const DESERTI = "Oenanthe deserti";

function ebird(id: string, date: string, lat: number, lng: number): MergeItem {
  return {
    key: `ebird:${id}`,
    source: "ebird",
    species_sci: DESERTI,
    country_code: "FI",
    date_from: date,
    date_to: date,
    lat,
    lng,
    precision: "exact",
  };
}

function noCoords(
  key: string,
  source: MergeItem["source"],
  country: string,
  date: string,
): MergeItem {
  return {
    key,
    source,
    species_sci: DESERTI,
    country_code: country,
    date_from: date,
    date_to: date,
    lat: null,
    lng: null,
    precision: "country",
  };
}

function poriAndKokkola(): MergeItem[] {
  return [
    ebird("P1", "2026-10-26", 61.557, 21.535),
    ebird("P2", "2026-10-26", 61.59, 21.47),
    ebird("P3", "2026-10-24", 61.58, 21.5),
    ebird("K1", "2026-10-25", 64.284, 23.848),
    ebird("K2", "2026-10-25", 64.28, 23.85),
  ];
}

function withTarsiger(): MergeItem[] {
  return [...poriAndKokkola(), noCoords("tarsiger:T1", "tarsiger", "FI", "2026-10-25")];
}

Deno.test("a) Pori/Kokkola eBird rows fold by day gap and 10 km radius", () => {
  const out = assignMerges(poriAndKokkola());
  assertEquals(out.get("ebird:P1"), null);
  assertEquals(out.get("ebird:P2"), "ebird:P1");
  assertEquals(out.get("ebird:P3"), null);
  assertEquals(out.get("ebird:K1"), null);
  assertEquals(out.get("ebird:K2"), "ebird:K1");
});

Deno.test("b) coordless Tarsiger row joins the main with the smallest date gap", () => {
  const out = assignMerges(withTarsiger());
  assertEquals(out.get("tarsiger:T1"), "ebird:K1");
});

Deno.test("c) LOFK folds into a coordless Tarsiger record", () => {
  const out = assignMerges([
    noCoords("tarsiger:52592", "tarsiger", "LT", "2026-10-16"),
    noCoords("lofk:L1", "lofk", "LT", "2026-10-16"),
  ]);
  assertEquals(out.get("lofk:L1"), "tarsiger:52592");
  assertEquals(out.get("tarsiger:52592"), null);
});

Deno.test("d) LOFK folds into an exact Tarsiger record", () => {
  const exact: MergeItem = {
    ...noCoords("tarsiger:9", "tarsiger", "LT", "2026-10-16"),
    lat: 55.3,
    lng: 21.4,
    precision: "exact",
  };
  const out = assignMerges([noCoords("lofk:L2", "lofk", "LT", "2026-10-16"), exact]);
  assertEquals(out.get("lofk:L2"), "tarsiger:9");
  assertEquals(out.get("tarsiger:9"), null);
});

Deno.test("e) different countries never merge", () => {
  const out = assignMerges([
    noCoords("tarsiger:F", "tarsiger", "FI", "2026-10-16"),
    noCoords("tarsiger:S", "tarsiger", "SE", "2026-10-16"),
  ]);
  assertEquals(out.get("tarsiger:F"), null);
  assertEquals(out.get("tarsiger:S"), null);
});

Deno.test("f) a 3-day gap does not merge", () => {
  const out = assignMerges([
    noCoords("tarsiger:A", "tarsiger", "FI", "2026-10-10"),
    noCoords("tarsiger:B", "tarsiger", "FI", "2026-10-13"),
  ]);
  assertEquals(out.get("tarsiger:A"), null);
  assertEquals(out.get("tarsiger:B"), null);
});

Deno.test("g) exact eBird rows ~50 km apart on the same day do not merge", () => {
  const out = assignMerges([
    ebird("G1", "2026-10-20", 60.0, 24.0),
    ebird("G2", "2026-10-20", 60.45, 24.0),
  ]);
  assertEquals(out.get("ebird:G1"), null);
  assertEquals(out.get("ebird:G2"), null);
});

Deno.test("h) species names are grouped trimmed and case-insensitive", () => {
  const a = { ...noCoords("tarsiger:H1", "tarsiger", "FI", "2026-10-16"), species_sci: "Oenanthe deserti " };
  const b = { ...noCoords("tarsiger:H2", "tarsiger", "FI", "2026-10-16"), species_sci: "oenanthe deserti" };
  const out = assignMerges([a, b]);
  const values = [out.get("tarsiger:H1"), out.get("tarsiger:H2")];
  assertEquals(values.filter((v) => v === null).length, 1);
  assert(values.includes("tarsiger:H1") || values.includes("tarsiger:H2"));
});

Deno.test("i) result is flat and covers every input key exactly once", () => {
  const input = withTarsiger();
  const out = assignMerges(input);
  assertEquals(out.size, input.length);
  for (const item of input) assert(out.has(item.key), `missing ${item.key}`);
  for (const [key, main] of out) {
    if (main === null) continue;
    assertEquals(out.get(main), null, `${key} points at non-main ${main}`);
  }
});

Deno.test("j) haversineKm Tallinn-Helsinki is about 82 km", () => {
  const km = haversineKm(59.437, 24.7536, 60.1699, 24.9384);
  assert(km > 81 && km < 83, `got ${km}`);
});

Deno.test("assignMerges does not mutate its input", () => {
  const input = withTarsiger();
  const snapshot = JSON.parse(JSON.stringify(input));
  assignMerges(input);
  assertEquals(input, snapshot);
});

Deno.test("country code compared case-insensitively", () => {
  const out = assignMerges([
    noCoords("tarsiger:1", "tarsiger", "LT", "2026-10-16"),
    noCoords("lofk:1", "lofk", "lt", "2026-10-16"),
  ]);
  assertEquals(out.get("lofk:1"), "tarsiger:1");
});
