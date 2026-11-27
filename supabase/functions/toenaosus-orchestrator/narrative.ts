// toenaosus-orchestrator / narrative.ts
// P184j: the no-LLM raport. When the narrative stage cannot produce text
// (budget guard, every provider failing in stage 7, or parseMerge rejecting
// the answer), the run still inserts a raport: the deterministic entries and
// the LLM-free evidence_lists, with every LLM-written field replaced by
// exactly what a P24-stubbed entry already gets.
//
// Pure: no I/O, no Deno.serve, so the test can import it directly.

import type { EvidenceLists } from "./lists.ts";
import { stubWhyLikely } from "./score.ts";

export type LlmFailStage = "sonnet" | "parse" | "budget";

export interface LlmFailure {
  stage: LlmFailStage;
  error: string;
}

/** The fields withoutNarrative rewrites; the rest of the payload passes through. */
export interface NarrativePayload {
  intro_et: string | null;
  model: string | null;
  entries: Array<Record<string, unknown>>;
  generation_meta: Record<string, unknown>;
  evidence_lists: EvidenceLists | null;
}

const LLM_ERROR_MAX = 300;
const DIAG_REASON_MAX = 80;

export function llmFailure(stage: LlmFailStage, e: unknown): LlmFailure {
  const message = e instanceof Error ? e.message : String(e);
  return { stage, error: message.slice(0, LLM_ERROR_MAX) };
}

const strOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

function stubEntry(entry: Record<string, unknown>): Record<string, unknown> {
  return {
    ...entry,
    rarity_reason: "",
    why_likely_et: stubWhyLikely({
      country_code: strOrNull(entry.country_code),
      date: strOrNull(entry.date),
    }),
    likely_arrival_sites_et: [],
  };
}

function withLlmDiag(
  lists: EvidenceLists,
  failure: LlmFailure,
): EvidenceLists {
  const reason = `llm: ${failure.stage} ${failure.error}`.slice(
    0,
    DIAG_REASON_MAX,
  );
  return {
    ...lists,
    diag: { ...lists.diag, errors: [...lists.diag.errors, reason] },
  };
}

/**
 * All-or-nothing: no LLM text survives, not even from a part that succeeded.
 * The deterministic fields (probability, predicted_sites, ETA, ...) are kept.
 */
export function withoutNarrative<T extends NarrativePayload>(
  payload: T,
  failure: LlmFailure,
): T {
  return {
    ...payload,
    intro_et: null,
    model: null,
    entries: payload.entries.map(stubEntry),
    generation_meta: { ...payload.generation_meta, llm_failed: failure },
    evidence_lists: payload.evidence_lists
      ? withLlmDiag(payload.evidence_lists, failure)
      : null,
  };
}
