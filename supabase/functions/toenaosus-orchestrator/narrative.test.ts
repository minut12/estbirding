// toenaosus-orchestrator / narrative.test.ts
// P184j: a failed narrative stage still yields an insert payload. Imports
// narrative.ts only -- never index.ts (its top-level Deno.serve()).

import { assert, assertEquals } from "jsr:@std/assert@^1.0.19";
import type { EvidenceLists } from "./lists.ts";
import { llmFailure, type NarrativePayload, withoutNarrative } from "./narrative.ts";
import { stubWhyLikely } from "./score.ts";

interface TestPayload extends NarrativePayload {
  period_start: string;
  season: string;
}

const LISTS: EvidenceLists = {
  version: "v5-evidence",
  as_of: "2026-11-25",
  juba_eestis: [],
  lahenemas: [],
  hooaeg: [],
  diag: { rarity_species: 3, errors: [], elapsed_ms: 1200 },
};

// What index.ts builds before the fallback: a narrated entry with LLM text.
function narratedPayload(): TestPayload {
  return {
    period_start: "2026-11-11",
    season: "fall_winter",
    intro_et: "Sonnet intro",
    model: "claude-sonnet-5-5",
    entries: [{
      ebird_code: "recfly1",
      country_code: "FI",
      date: "2026-11-24 08:10",
      ee_probability_pct: 12,
      rarity_reason: "LLM text",
      why_likely_et: "LLM text",
      likely_arrival_sites_et: [{ name: "Sorve", reasoning: "LLM" }],
      predicted_sites: [{ label: "Sorve", eta_days: 2 }],
    }],
    generation_meta: { run_id: "r1", sonnet_model: null },
    evidence_lists: LISTS,
  };
}

function assertNoLlm(out: TestPayload, stage: string): void {
  assertEquals(out.intro_et, null);
  assertEquals(out.model, null);
  assertEquals(
    (out.generation_meta.llm_failed as { stage: string }).stage,
    stage,
  );
  assertEquals(out.generation_meta.run_id, "r1");
  assert(out.evidence_lists !== null);
  assertEquals(out.evidence_lists.diag.errors.length, 1);
  assert(out.evidence_lists.diag.errors[0].startsWith(`llm: ${stage} `));
  const e = out.entries[0];
  assertEquals(e.rarity_reason, "");
  assertEquals(
    e.why_likely_et,
    stubWhyLikely({ country_code: "FI", date: "2026-11-24 08:10" }),
  );
  assertEquals(e.likely_arrival_sites_et, []);
  // Deterministic fields and the rest of the payload pass through.
  assertEquals(e.ee_probability_pct, 12);
  assertEquals(e.predicted_sites, [{ label: "Sorve", eta_days: 2 }]);
  assertEquals(out.period_start, "2026-11-11");
  assertEquals(out.season, "fall_winter");
}

Deno.test("P184j: narrative failure still yields evidence_lists and stubbed entries", () => {
  const err = new Error(
    "anthropic HTTP 503: " + "x".repeat(500),
  );
  const out = withoutNarrative(narratedPayload(), llmFailure("sonnet", err));
  assertNoLlm(out, "sonnet");
  const failed = out.generation_meta.llm_failed as { error: string };
  assertEquals(failed.error.length, 300);
  assert(failed.error.startsWith("anthropic HTTP 503: "));
  assert(out.evidence_lists!.diag.errors[0].length <= 80);
});

Deno.test("P184j: parse failure is recorded as stage parse", () => {
  const out = withoutNarrative(
    narratedPayload(),
    llmFailure("parse", new Error("Sonnet returned non-JSON [part 1]: {")),
  );
  assertNoLlm(out, "parse");
});

Deno.test("P184j: budget guard is recorded as stage budget", () => {
  const out = withoutNarrative(
    narratedPayload(),
    llmFailure("budget", "budget exhausted before sonnet: 341000 ms"),
  );
  assertNoLlm(out, "budget");
  assertEquals(
    out.evidence_lists!.diag.errors[0],
    "llm: budget budget exhausted before sonnet: 341000 ms",
  );
});

Deno.test("P184j: the input payload is not mutated", () => {
  const input = narratedPayload();
  withoutNarrative(input, llmFailure("sonnet", "x"));
  assertEquals(input.intro_et, "Sonnet intro");
  assertEquals(input.entries[0].why_likely_et, "LLM text");
  assertEquals(LISTS.diag.errors, []);
});
