# species-prediction summary guardrail — two invariants (M7.6-fix1)

**Status:** Accepted · 2026-09-02 · commit `aafa8f7`
**Scope:** The foreign-pressure guardrail and the warning set in `supabase/functions/species-prediction/index.ts`.

## Context — what broke
C4 (real run, `request_id 9b969274…`, EF v16 = `37967fc`): Sonnet returned a rule-compliant summary — *"No foreign pressure detected from neighboring countries…"* — and the guardrail rejected it (`summary_mentions_foreign_pressure_without_structured_foreign_evidence` → `neutral_sanitizer_fallback`). Prompt rules 2/11 make the analyst write exactly that negative sentence when the foreign arrays are empty, so no compliant summary could ever pass. Four of the five checks were also unbounded: `/SE/i` matched "pre**se**nt", `/FI/i` matched "con**fi**rmed", `/Hel/i` matched "s**hel**ter". A word-bounded `\bby\b` (Belarus) is no better — it matches the English preposition in the real deterministic text at `index.ts:4853` ("is supported **by** canonical structured evidence") and in ordinary analyst prose ("shaped **by** westerly winds").

C3 (`maxTokensOverride:50`): the fallback fired but `ai_summary_unavailable:` never reached `result_json.warnings`. The B1.6 union in `buildFinalPredictionPayloadFromEvidence` was **not** the culprit — it keeps `payload.warnings` unconditionally. The marker died upstream, at two rebuild sites: `buildCanonicalPredictionRecord` (on guardrail failure it swaps `preferredSummary` for `deterministicSummary`, taking that object's warnings with it) and `enforceCanonicalSummaryConsistency` (`warnings: enforcedSummary.warnings` — a hard replace). Only `__timings.stop_reason` survived.

## Invariant 1 — a MENTION is not a CLAIM
A foreign-pressure term in the summary only contradicts empty foreign evidence when it is **asserted**. `mentionsForeignPressureClaim()` is the single arbiter: `FOREIGN_TERM` (all alternatives `\b`-bounded) × `NEGATION_WINDOW` (≤4 words of negation preceding the match, 80-char lookback). Every guardrail calls it — five sites: `canonicalSummaryMatchesEvidence`, `buildFinalConsistencyChecksFromCanonical`, `sanitizeSummaryAgainstEvidence`, `scrubStaleNarrativeFromStructuredEvidence`, `validateNarrativeConsistency`. No country code that is also an English word may enter `FOREIGN_TERM`; `by` is excluded for this reason and Belarus is matched by name.

## Invariant 2 — run-level warnings outlive the narrative
`ai_summary_unavailable:*` and `budget_exceeded_before_sonnet` describe the **run**, not the text. Any code path that rebuilds or replaces the narrative must union them forward (`preserveAiFallbackWarnings`), never replace the warning set wholesale. Preserving them only at the finalizer is insufficient — the loss happens before the finalizer runs.

## Tests pinning these
`src/test/speciesPredictionStaleNarrative.test.ts` (same CJS/`node:vm` harness; hooks added to the epilogue):
- Invariant 1 — `mentionsForeignPressureClaim (M7.6-fix1)`: the C4 sentence → false; asserted Poland/Mikoszewo claim → true; "Birds are present near Sääre" → false (old `/SE/i`), asserted against the helper **and** `sanitizeSummaryAgainstEvidence`; "Not in Finland but strong pressure from Latvia" → true; "…shaped by westerly winds" → false; "Belarus" → true. Plus `canonical guardrails accept a negated foreign mention (M7.6-fix1)` for `canonicalSummaryMatchesEvidence` / `buildFinalConsistencyChecksFromCanonical`.
- Invariant 2 — `ai_summary_unavailable survives the guardrail rebuild (M7.6-fix1)`: the marker survives `buildCanonicalPredictionRecord` and `enforceCanonicalSummaryConsistency` independently.

## Open vs. closed
**May change:** the `NEGATION_WINDOW` span (4 words) and its negator list — tunable against real summaries; new place names in `FOREIGN_TERM`; whether the locality regex at the `summary_mentions_foreign_locality_without_evidence` check gains a negation window (it has boundaries only today).
**May not change without revisiting this note:** reintroducing an inline foreign regex at any of the five sites instead of the helper; adding an English-word country code to `FOREIGN_TERM`; replacing a warning set without `preserveAiFallbackWarnings`; relying on the `buildFinalPredictionPayloadFromEvidence` union alone to carry run-level warnings. Reason strings are part of the contract — logs and tests match on them.

## Relates
M7.6 in-EF Sonnet port (`37967fc`). Phase C verification: C4 → `summaryOrigin:'sonnet_in_ef'`, `summaryGuardrailApplied:false`; C3 → `warnings` contains `ai_summary_unavailable: Sonnet stopped on max_tokens (50 tokens)`. Deploy is CI-driven — see `2026-07-09-git-push-does-not-deploy-edge-functions.md`.
