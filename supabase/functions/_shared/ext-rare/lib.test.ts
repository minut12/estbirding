// _shared/ext-rare / lib.test.ts
// Pure-function tests for the external rarity parsers (P178b). Imports lib.ts
// only; fixtures are real captures (LOFK Oct 2026 table, Tarsiger API page).

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@^1.0.19";
import {
  type ExtRareRecord,
  lofkDistrictHint,
  parseLofkHtml,
  parseNthRecord,
  parseTarsigerJson,
} from "./lib.ts";

const LOFK_HTML = await Deno.readTextFile(
  new URL("./__fixtures__/lofk-2026-10.html", import.meta.url),
);
const TARSIGER_JSON: unknown = JSON.parse(
  await Deno.readTextFile(new URL("./__fixtures__/tarsiger-100.json", import.meta.url)),
);

const PERSON_KEY = /observer|person|creator/i;

function byId(records: ExtRareRecord[], id: string): ExtRareRecord {
  const rec = records.find((r) => r.source_id === id);
  assert(rec, `missing Tarsiger record ${id}`);
  return rec;
}

// Place strings sliced out of the fixture at runtime (keeps this file ASCII).
function lofkPlaces(): string[] {
  const out: string[] = [];
  const re = /<td style='width:250px;'>([\s\S]*?)<\/td>/g;
  for (const m of LOFK_HTML.matchAll(re)) out.push(m[1]);
  return out;
}

Deno.test("parseLofkHtml: 107 data rows, header skipped", () => {
  assertEquals(parseLofkHtml(LOFK_HTML).length, 107);
});

Deno.test("parseLofkHtml: first and last record", () => {
  const recs = parseLofkHtml(LOFK_HTML);
  const first = recs[0];
  assertEquals(first.obs_date_from, "2026-10-28");
  assertEquals(first.species_sci, "Linaria flavirostris");
  assertEquals(first.country_code, "LT");
  const last = recs[recs.length - 1];
  assertEquals(last.obs_date_from, "2026-10-01");
  assertEquals(last.species_sci, "Anthus cervinus");
});

Deno.test("parseLofkHtml: 41 distinct species, all dated 2026-10", () => {
  const recs = parseLofkHtml(LOFK_HTML);
  assertEquals(new Set(recs.map((r) => r.species_sci)).size, 41);
  for (const r of recs) assert(r.obs_date_from.startsWith("2026-10"), r.obs_date_from);
});

Deno.test("no parser output carries an observer/person/creator key", () => {
  const all = [...parseLofkHtml(LOFK_HTML), ...parseTarsigerJson(TARSIGER_JSON)];
  assert(all.length > 0);
  for (const r of all) {
    for (const k of Object.keys(r)) assertFalse(PERSON_KEY.test(k), `forbidden key ${k}`);
  }
});

Deno.test("parseTarsigerJson: 17 records survive the region filter", () => {
  assertEquals(parseTarsigerJson(TARSIGER_JSON).length, 17);
});

Deno.test("parseTarsigerJson: 52608 PL exact coords, 14th record", () => {
  const r = byId(parseTarsigerJson(TARSIGER_JSON), "52608");
  assertEquals(r.country_code, "PL");
  assertEquals(r.species_sci, "Prunella montanella");
  assertEquals(r.lat, 53.752315);
  assertEquals(r.coord_precision, "exact");
  assertEquals(r.nth_record, 14);
});

Deno.test("parseTarsigerJson: 52592 LT, null date_to falls back to date_from", () => {
  const r = byId(parseTarsigerJson(TARSIGER_JSON), "52592");
  assertEquals(r.country_code, "LT");
  assertEquals(r.species_sci, "Oenanthe deserti");
  assertEquals(r.obs_date_to, "2026-10-16");
  assertEquals(r.nth_record, 3);
});

Deno.test("parseTarsigerJson: nth_record from notes", () => {
  const recs = parseTarsigerJson(TARSIGER_JSON);
  const no = byId(recs, "52538");
  assertEquals(no.country_code, "NO");
  assertEquals(no.nth_record, 1);
  assertEquals(byId(recs, "52518").nth_record, 2);
  assertEquals(byId(recs, "52558").nth_record, 2);
  assertEquals(byId(recs, "52521").nth_record, 9);
});

Deno.test("parseTarsigerJson: non-region countries dropped", () => {
  const banned = new Set(["DN", "UK", "AG", "HY", "HT"]);
  for (const r of parseTarsigerJson(TARSIGER_JSON)) {
    assertFalse(banned.has(r.country_code), `unexpected ${r.country_code}`);
  }
});

function ru(lat: number | null, lng: number | null, id: number): Record<string, unknown> {
  return {
    id,
    date_from: "2026-10-20",
    date_to: null,
    is_important: false,
    species: [{ name_sci: "Oenanthe deserti" }],
    notes: "",
    external_image_url: null,
    internal_image: null,
    country_code: "RU",
    latitude: lat === null ? null : String(lat),
    longitude: lng === null ? null : String(lng),
  };
}

Deno.test("parseTarsigerJson: RU kept only inside the NW Russia box", () => {
  const out = parseTarsigerJson({
    results: [ru(59.9, 30.3, 1), ru(55.7, 37.6, 2), ru(null, null, 3)],
  });
  assertEquals(out.length, 1);
  assertEquals(out[0].lat, 59.9);
});

Deno.test("lofkDistrictHint: real fixture places", () => {
  const places = lofkPlaces();
  const withRSav = places.find((p) => p.includes(" r. sav."));
  const withRajone = places.find((p) => p.includes("rajone"));
  const noMarker = places.find((p) => !/\b(r|raj|sav)\.|rajon/.test(p));
  assert(withRSav && withRajone && noMarker, "fixture lacks a needed place shape");
  assert(lofkDistrictHint(withRSav) !== null, withRSav);
  assert(lofkDistrictHint(withRajone) !== null, withRajone);
  assertEquals(lofkDistrictHint(noMarker), null);
});

Deno.test("parseNthRecord: English ordinal phrases", () => {
  assertEquals(parseNthRecord("14th record"), 14);
  assertEquals(parseNthRecord("3rd for"), 3);
  assertEquals(parseNthRecord("First for"), 1);
  assertEquals(parseNthRecord("Second record"), 2);
  assertEquals(parseNthRecord("2nd observation"), 2);
  assertEquals(
    parseNthRecord("First alive Little Owl in Sweden since 1950 and propably 9th record in total(?)"),
    9,
  );
  assertEquals(parseNthRecord("Photographed near Sagres."), null);
});
