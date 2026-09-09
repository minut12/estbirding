// toenaosus-orchestrator / arc.test.ts
// Imports score.ts only -- never index.ts, whose top-level Deno.serve() would
// start a server inside `deno test`.

import { assertEquals } from "jsr:@std/assert@^1.0.19";
import {
  bearingInArc,
  type PhenologyRow,
  SOURCE_DIR_OK_DEG,
  sourceArcFor,
} from "./score.ts";

// A row with no arc and no bearing: every optional field left off, exactly as
// PostgREST returns it before the P8c migration lands.
const BARE: PhenologyRow = {
  scientific_name: "Anthus cervinus",
  ebird_code: "retpip",
  arrival_modes: ["autumn_drift"],
  spring_window: null,
  autumn_window: null,
  arrival_bearing_spring: null,
  arrival_bearing_autumn: null,
  source_regions_spring: null,
  source_regions_autumn: null,
  flight_class: null,
};

// ---- bearingInArc ----------------------------------------------------------

Deno.test("bearingInArc: wrap-around arc 300->20 contains 350", () => {
  assertEquals(bearingInArc(350, 300, 20), true);
});

Deno.test("bearingInArc: wrap-around arc 300->20 excludes 200", () => {
  assertEquals(bearingInArc(200, 300, 20), false);
});

Deno.test("bearingInArc: ordinary arc 90->200 contains 100", () => {
  assertEquals(bearingInArc(100, 90, 200), true);
});

Deno.test("bearingInArc: ordinary arc 90->200 excludes 250", () => {
  assertEquals(bearingInArc(250, 90, 200), false);
});

Deno.test("bearingInArc: both edges inclusive, ordinary arc", () => {
  assertEquals(bearingInArc(90, 90, 200), true);
  assertEquals(bearingInArc(200, 90, 200), true);
});

Deno.test("bearingInArc: both edges inclusive, wrap-around arc", () => {
  assertEquals(bearingInArc(300, 300, 20), true);
  assertEquals(bearingInArc(20, 300, 20), true);
});

Deno.test("bearingInArc: normalises out-of-range and negative bounds", () => {
  // The arrival_bearing fallback is un-normalised by design: 30 +- 60 is
  // -30..90, which must behave as 330..90.
  assertEquals(bearingInArc(350, -30, 90), true);
  assertEquals(bearingInArc(200, -30, 90), false);
  assertEquals(bearingInArc(10, 340, 420), true); // 340..60
  assertEquals(bearingInArc(-10, 300, 20), true); // -10 == 350
});

// ---- sourceArcFor ----------------------------------------------------------

Deno.test("sourceArcFor: curated arc wins over arrival_bearing", () => {
  const row: PhenologyRow = {
    ...BARE,
    arrival_bearing_autumn: 30,
    source_arc_autumn_from: 300,
    source_arc_autumn_to: 10,
  };
  assertEquals(sourceArcFor(row, "autumn"), { from: 300, to: 10 });
});

Deno.test("sourceArcFor: spring and autumn arcs do not cross over", () => {
  const row: PhenologyRow = {
    ...BARE,
    source_arc_spring_from: 100,
    source_arc_spring_to: 180,
    source_arc_autumn_from: 300,
    source_arc_autumn_to: 10,
  };
  assertEquals(sourceArcFor(row, "spring"), { from: 100, to: 180 });
  assertEquals(sourceArcFor(row, "autumn"), { from: 300, to: 10 });
});

Deno.test("sourceArcFor: bearing-only row gives arrival_bearing +- 60", () => {
  const row: PhenologyRow = { ...BARE, arrival_bearing_autumn: 90 };
  assertEquals(sourceArcFor(row, "autumn"), {
    from: 90 - SOURCE_DIR_OK_DEG,
    to: 90 + SOURCE_DIR_OK_DEG,
  });
});

Deno.test("sourceArcFor: half a curated arc is not an arc", () => {
  // A row with `from` but no `to` must fall through to the bearing, not build
  // an arc from a null bound.
  const row: PhenologyRow = {
    ...BARE,
    arrival_bearing_autumn: 90,
    source_arc_autumn_from: 300,
    source_arc_autumn_to: null,
  };
  assertEquals(sourceArcFor(row, "autumn"), { from: 30, to: 150 });
});

Deno.test("sourceArcFor: an arc bound of 0 is honoured, not treated as absent", () => {
  const row: PhenologyRow = {
    ...BARE,
    arrival_bearing_autumn: 90,
    source_arc_autumn_from: 0,
    source_arc_autumn_to: 130,
  };
  assertEquals(sourceArcFor(row, "autumn"), { from: 0, to: 130 });
});

Deno.test("sourceArcFor: null phen is null", () => {
  assertEquals(sourceArcFor(null, "autumn"), null);
});

Deno.test("sourceArcFor: no arc and no bearing is null", () => {
  assertEquals(sourceArcFor(BARE, "autumn"), null);
});

Deno.test("sourceArcFor: null season is null even with both curated", () => {
  const row: PhenologyRow = {
    ...BARE,
    arrival_bearing_autumn: 90,
    source_arc_autumn_from: 300,
    source_arc_autumn_to: 10,
  };
  assertEquals(sourceArcFor(row, null), null);
});
