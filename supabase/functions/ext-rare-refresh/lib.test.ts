// ext-rare-refresh / lib.test.ts (P178d3)
// Pure glue tests. LOFK rows come from the real Oct 2026 fixture so this file
// stays ASCII-only.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.19";
import { type ExtRareRecord, parseLofkHtml } from "../_shared/ext-rare/lib.ts";
import {
  ebirdToMergeItem,
  geocodeQuery,
  lofkMonths,
  toMergeItem,
  unwrapLofkReply,
} from "./lib.ts";

const LOFK_HTML = await Deno.readTextFile(
  new URL("../_shared/ext-rare/__fixtures__/lofk-2026-10.html", import.meta.url),
);
const LOFK = parseLofkHtml(LOFK_HTML);
const ASCII_ONLY = /^[\x00-\x7F]*$/;

function lofkWithHint(): ExtRareRecord {
  const rec = LOFK.find((r) => r.district_hint !== null && r.district_hint !== "");
  assert(rec, "fixture lacks a LOFK row with a district_hint");
  return rec;
}

Deno.test("lofkMonths: Tallinn midnight on Nov 1 is already November", () => {
  assertEquals(lofkMonths(new Date("2026-11-01T00:30:00+02:00")), ["2026-11", "2026-10"]);
});

Deno.test("lofkMonths: January rolls back to previous December", () => {
  assertEquals(lofkMonths(new Date("2026-01-05T12:00:00+02:00")), ["2026-01", "2025-12"]);
});

Deno.test("geocodeQuery: real LOFK row with a district hint -> ASCII query", () => {
  const rec = lofkWithHint();
  const q = geocodeQuery(rec);
  assert(q !== null, "expected a query");
  assert(ASCII_ONLY.test(q), `non-ASCII query: ${q}`);
  assert(q.endsWith(" savivaldybe"), q);
});

Deno.test("geocodeQuery: LOFK row without hint -> null", () => {
  const rec: ExtRareRecord = { ...lofkWithHint(), district_hint: null };
  assertEquals(geocodeQuery(rec), null);
});

Deno.test("geocodeQuery: non-LOFK record -> null even with a hint", () => {
  const rec: ExtRareRecord = { ...lofkWithHint(), source: "tarsiger" };
  assertEquals(geocodeQuery(rec), null);
});

Deno.test("ebirdToMergeItem: null sub_id -> null", () => {
  assertEquals(
    ebirdToMergeItem({
      ebird_sub_id: null,
      species_lat_name: "Oenanthe deserti",
      country_code: "EE",
      obs_date: "2026-10-20",
      lat: 59.4,
      lng: 24.7,
    }),
    null,
  );
});

Deno.test("ebirdToMergeItem: null species -> null", () => {
  assertEquals(
    ebirdToMergeItem({
      ebird_sub_id: "S123",
      species_lat_name: null,
      country_code: "EE",
      obs_date: "2026-10-20",
      lat: 59.4,
      lng: 24.7,
    }),
    null,
  );
});

Deno.test("ebirdToMergeItem: full row maps to an exact MergeItem", () => {
  assertEquals(
    ebirdToMergeItem({
      ebird_sub_id: "S123",
      species_lat_name: "Oenanthe deserti",
      country_code: "EE",
      obs_date: "2026-10-20T08:15:00",
      lat: 59.4,
      lng: 24.7,
    }),
    {
      key: "ebird:S123",
      source: "ebird",
      species_sci: "Oenanthe deserti",
      country_code: "EE",
      date_from: "2026-10-20",
      date_to: "2026-10-20",
      lat: 59.4,
      lng: 24.7,
      precision: "exact",
    },
  );
});

Deno.test("toMergeItem: LOFK record maps key and fields", () => {
  const rec = LOFK[0];
  assertEquals(toMergeItem(rec), {
    key: `lofk:${rec.source_id}`,
    source: "lofk",
    species_sci: rec.species_sci,
    country_code: "LT",
    date_from: rec.obs_date_from,
    date_to: rec.obs_date_to,
    lat: null,
    lng: null,
    precision: "country",
  });
});

Deno.test("unwrapLofkReply: raw HTML passes through unchanged", () => {
  assertEquals(unwrapLofkReply("<table><tr></tr></table>"), "<table><tr></tr></table>");
});

Deno.test("unwrapLofkReply: success=false envelope throws with its data text", () => {
  assertThrows(
    () => unwrapLofkReply('{"success":false,"data":"Invalid month"}'),
    Error,
    "Invalid month",
  );
});

Deno.test("unwrapLofkReply: success=true envelope yields its data HTML", () => {
  assertEquals(unwrapLofkReply('{"success":true,"data":"<table></table>"}'), "<table></table>");
});
