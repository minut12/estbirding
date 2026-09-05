// batch-driver / state.test.ts
// Pure-function tests. Imports state.ts only -- never index.ts, whose top-level
// Deno.serve() would start a server inside `deno test` (P3 D0).

import { assertEquals, assertFalse } from "jsr:@std/assert@^1.0.19";
import { normalizeState } from "./state.ts";

const EMPTY = { offset: 0, calls_total: 0, total_species: null };

Deno.test("normalizeState: {} yields the empty state with no optional keys", () => {
  const out = normalizeState({});
  assertEquals(out, EMPTY);
  assertEquals(Object.keys(out).sort(), ["calls_total", "offset", "total_species"]);
});

Deno.test("normalizeState: coerces numerics and drops unknown keys and `last`", () => {
  const out = normalizeState({
    offset: "12",
    calls_total: 3.7,
    total_species: 0,
    foo: "bar",
    last: { x: 1 },
  });
  assertEquals(out.offset, 12);
  assertEquals(out.calls_total, 3);
  assertEquals(out.total_species, null);
  assertFalse("foo" in out);
  assertFalse("last" in out);
});

Deno.test("normalizeState: preserves mode 'backfill' and a valid year_from", () => {
  const out = normalizeState({ mode: "backfill", year_from: 2010 });
  assertEquals(out.mode, "backfill");
  assertEquals(out.year_from, 2010);
});

Deno.test("normalizeState: preserves mode 'refresh'", () => {
  assertEquals(normalizeState({ mode: "refresh" }).mode, "refresh");
});

Deno.test("normalizeState: drops an unknown mode and an out-of-range year_from", () => {
  const out = normalizeState({ mode: "x", year_from: 1999 });
  assertFalse("mode" in out);
  assertFalse("year_from" in out);
});

Deno.test("normalizeState: drops a non-integer or non-numeric year_from", () => {
  assertFalse("year_from" in normalizeState({ year_from: 2010.5 }));
  assertFalse("year_from" in normalizeState({ year_from: "2010" }));
});

Deno.test("normalizeState: drops a future year_from", () => {
  const next = new Date().getUTCFullYear() + 1;
  assertFalse("year_from" in normalizeState({ year_from: next }));
});

Deno.test("normalizeState: non-object input yields the empty state", () => {
  assertEquals(normalizeState(null), EMPTY);
  assertEquals(normalizeState("string"), EMPTY);
});

Deno.test("normalizeState: a legacy state without the new keys is unchanged", () => {
  const legacy = { offset: 15, calls_total: 4, total_species: 449 };
  assertEquals(normalizeState(legacy), legacy);
});
