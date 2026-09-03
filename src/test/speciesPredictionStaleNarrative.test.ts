import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type StaleNarrativeHooks = {
  finalizePredictionResponse: (
    response: Record<string, unknown>,
    branch: string,
  ) => Record<string, unknown>;
  buildFinalPredictionPayloadFromEvidence: (
    payload: Record<string, unknown>,
  ) => Record<string, unknown>;
  STALE_NARRATIVE_WARNING: string;
  // M7.6-fix1
  mentionsForeignPressureClaim: (summary: string) => boolean;
  canonicalSummaryMatchesEvidence: (input: {
    summary: string;
    estoniaEvidence: Record<string, unknown>;
    foreignRecentPoints: unknown[];
    foreignClusters: unknown[];
    predictedTargets: unknown[];
    elurikkusRecentRecords: unknown[];
  }) => { ok: boolean; reasons: string[] };
  buildFinalConsistencyChecksFromCanonical: (input: {
    foreignRecentPoints: unknown[];
    foreignClusters: unknown[];
    predictedTargets: unknown[];
    weather: Record<string, unknown>;
    insightSummary: string;
  }) => Record<string, boolean>;
  sanitizeSummaryAgainstEvidence: (
    response: Record<string, unknown>,
  ) => Record<string, unknown>;
  buildCanonicalPredictionRecord: (input: {
    base: Record<string, unknown>;
    alternate?: Record<string, unknown> | null;
    preferredSummary?: {
      insightSummary: string;
      confidenceNote: string;
      rankingNotes: string;
      warnings: string[];
    } | null;
    preferredSummaryOrigin?: string | null;
  }) => Record<string, unknown>;
  enforceCanonicalSummaryConsistency: (
    canonical: Record<string, unknown>,
  ) => Record<string, unknown>;
};

function loadHooks(): StaleNarrativeHooks {
  const filePath = path.resolve("supabase/functions/species-prediction/index.ts");
  const source = fs.readFileSync(filePath, "utf8").replace(/^import .*$/gm, "");
  const wrapped = `${source}
globalThis.__speciesPredictionStaleNarrativeTestHooks = {
  finalizePredictionResponse,
  buildFinalPredictionPayloadFromEvidence,
  STALE_NARRATIVE_WARNING,
  mentionsForeignPressureClaim,
  canonicalSummaryMatchesEvidence,
  buildFinalConsistencyChecksFromCanonical,
  sanitizeSummaryAgainstEvidence,
  buildCanonicalPredictionRecord,
  enforceCanonicalSummaryConsistency,
};
`;
  const transpiled = ts.transpileModule(wrapped, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    Response,
    Request,
    Headers,
    AbortController,
    crypto,
    serve: () => undefined,
    createClient: () => ({}),
    corsHeaders: {},
    Deno: { env: { get: () => "" } },
    globalThis: {} as Record<string, unknown>,
  };
  context.globalThis = context;
  vm.runInNewContext(transpiled, context, { filename: filePath });
  return (context as any).__speciesPredictionStaleNarrativeTestHooks as StaleNarrativeHooks;
}

function buildBasePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    speciesKey: "turdus-merula",
    speciesName: "Musträstas",
    scope: "linnuliigid",
    generatedAt: "2026-03-22T10:00:00.000Z",
    analysisVersion: "test",
    species: {},
    sourceHealth: { ebirdAvailable: false, primarySourceUsed: "eElurikkus Estonia" },
    evidenceSummary: {},
    estoniaEvidence: {
      recentCount7d: 0,
      recentCount30d: 0,
      alreadyPresent: false,
      freshestLocalities: [],
    },
    foreignRecentPoints: [],
    foreignClusters: [],
    estoniaHistoryPoints: [],
    estoniaHistoryClusters: [],
    predictedTargets: [],
    elurikkusRecentRecords: [],
    mapLayers: {},
    foreignEvidence: [],
    historicalEvidence: {},
    rawLinks: {},
    weather: {},
    predictionVectors: [],
    insightSummary: "",
    aiSummary: "",
    warnings: [],
    rawResearchPayload: {
      request: { speciesKey: "turdus-merula" },
      normalizedSources: {},
      aiSummary: "stale raw summary",
    },
    ...overrides,
  };
}

describe("stale narrative scrubber", () => {
  const hooks = loadHooks();

  it("wipes ALREADY PRESENT when recentCount7d is 0", () => {
    const staleText =
      "ALREADY PRESENT — 12 records in 7 days. Sääre küla, Ristna, Põõsaspea. Poland (PL) pressure at Zatoka Pomorska.";
    const response = buildBasePayload({
      insightSummary: staleText,
      aiSummary: staleText,
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_wipe_already_present");

    const summary = String(finalized.insightSummary);
    expect(summary).not.toMatch(/ALREADY PRESENT/i);
    expect(summary).not.toMatch(/Sääre|Ristna|Põõsaspea/);
    expect(summary).not.toMatch(/\bPL\b|Poland|Zatoka/i);

    const warnings = Array.isArray(finalized.warnings)
      ? finalized.warnings.map(String)
      : [];
    expect(warnings.some((w) => w === hooks.STALE_NARRATIVE_WARNING)).toBe(true);
  });

  it("safe summary when all evidence is empty", () => {
    const response = buildBasePayload({ insightSummary: "", aiSummary: "" });

    const finalized = hooks.finalizePredictionResponse(response, "test_empty_evidence");

    const summary = String(finalized.insightSummary).toLowerCase();
    const isHonest =
      summary.includes("incomplete evidence") ||
      summary.includes("no recent estonia records");
    expect(isHonest).toBe(true);
    expect(String(finalized.insightSummary)).not.toMatch(/ALREADY PRESENT/i);
  });

  it("does not wipe valid summary when evidence matches", () => {
    // recentCount7d=5 means "ALREADY PRESENT — 5 records" is a truthful summary.
    // The scrubber must not replace it with an empty-evidence message.
    // Note: validateNarrativeConsistency has a pre-existing false-positive where /SE/i
    // matches the substring "se" in "PRESENT", which spuriously fires STALE_NARRATIVE_WARNING
    // as a side-effect warning. That is a separate issue — what matters here is that the
    // summary text itself is rebuilt correctly from the structured evidence (recentCount7d=5)
    // and is not collapsed to an empty/incomplete-evidence message.
    const validSummary = "ALREADY PRESENT — 5 records in 7 days.";
    const response = buildBasePayload({
      insightSummary: validSummary,
      aiSummary: validSummary,
      estoniaEvidence: {
        recentCount7d: 5,
        recentCount30d: 10,
        alreadyPresent: true,
        freshestLocalities: [],
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_valid_already_present");

    // Summary must be rebuilt from evidence (recentCount7d=5), not wiped to empty-evidence text
    expect(String(finalized.insightSummary)).toContain("ALREADY PRESENT — 5 records in 7 days");
    expect(String(finalized.insightSummary)).not.toMatch(/incomplete evidence/i);
  });

  it("rawResearchPayload.aiSummary matches final insightSummary after fix", () => {
    // Stale rawResearchPayload carries confident-looking arrays and summary from a previous run.
    // Fresh top-level arrays (the current pipeline run) are all empty.
    // The deterministic summary must be built from the empty top-level arrays — not the stale ones.
    const staleAiSummary = "ALREADY PRESENT — 99 records in 7 days. Old stale run.";
    const response = buildBasePayload({
      insightSummary: staleAiSummary,
      aiSummary: staleAiSummary,
      rawResearchPayload: {
        request: { speciesKey: "turdus-merula" },
        normalizedSources: {
          // Stale arrays inside rawResearchPayload — must NOT be used
          foreignRecentPoints: [{ countryCode: "PL", lat: 54.3, lng: 18.6 }],
          estoniaHistoryPoints: [{ locality: "Stale locality" }],
        },
        aiSummary: staleAiSummary,
        insightSummary: staleAiSummary,
        // Stale arrays at rawResearchPayload top level — must NOT be used
        foreignRecentPoints: [{ countryCode: "PL", lat: 54.3, lng: 18.6 }],
        estoniaHistoryPoints: [{ locality: "Stale locality" }],
        predictedTargets: [{ name: "Stale target" }],
      },
      // Fresh top-level arrays from the current run — all empty
      foreignRecentPoints: [],
      foreignClusters: [],
      estoniaHistoryPoints: [],
      estoniaHistoryClusters: [],
      predictedTargets: [],
    });

    const finalized = hooks.buildFinalPredictionPayloadFromEvidence(response);

    const rwp = finalized.rawResearchPayload as Record<string, unknown>;
    // rawResearchPayload.aiSummary must match the final insightSummary
    expect(rwp.aiSummary).toBe(finalized.insightSummary);
    // The stale summary must not survive anywhere
    expect(rwp.aiSummary).not.toBe(staleAiSummary);
    expect(String(finalized.insightSummary)).not.toMatch(/ALREADY PRESENT|Stale/i);
    // Must reflect the honest empty-evidence state, not invent presence from stale arrays
    const summary = String(finalized.insightSummary).toLowerCase();
    const isHonestAboutEmptyEvidence =
      summary.includes("incomplete evidence") ||
      summary.includes("no recent estonia records");
    expect(isHonestAboutEmptyEvidence).toBe(true);
  });

  it("keeps canonical foreign clusters instead of placeholder shells when normalized clusters exist", () => {
    const payload = buildBasePayload({
      sourceHealth: { ebirdAvailable: true, primarySourceUsed: "eBird foreign" },
      foreignRecentPoints: [
        {
          lat: 57.86,
          lon: 23.21,
          obsDt: "2026-03-29T10:00:00.000Z",
          locName: "Kolkasrags",
          countryCode: "lv",
          countryName: "Latvia",
          daysAgo: 1,
        },
      ],
      foreignClusters: [
        {
          id: "placeholder",
          lat: 57.86,
          lon: 23.21,
          pointCount: 1,
          newestObsDt: "2026-03-29T10:00:00.000Z",
          oldestObsDt: "2026-03-29T10:00:00.000Z",
          freshestDaysAgo: 1,
          averageDaysAgo: 1,
          totalHowMany: 0,
          countries: [],
          countryCodes: [],
          locNames: [],
          nearestDistanceKm: 0,
          isFreshest: true,
        },
      ],
      rawResearchPayload: {
        normalizedSources: {
          foreignClusters: [
            {
              id: "lv-cluster-1",
              lat: 57.86,
              lon: 23.21,
              pointCount: 1,
              newestObsDt: "2026-03-29T10:00:00.000Z",
              oldestObsDt: "2026-03-29T10:00:00.000Z",
              freshestDaysAgo: 1,
              averageDaysAgo: 1,
              totalHowMany: 3,
              countries: ["Latvia"],
              countryCodes: ["lv"],
              locNames: ["Kolkasrags"],
              nearestDistanceKm: 69,
              isFreshest: true,
            },
          ],
        },
        aiSummary: "stale raw summary",
      },
    });

    const finalized = hooks.buildFinalPredictionPayloadFromEvidence(payload);
    const cluster = (finalized.foreignClusters as Array<Record<string, unknown>>)[0];

    expect(cluster.countries).toEqual(["Latvia"]);
    expect(cluster.countryCodes).toEqual(["lv"]);
    expect(cluster.totalHowMany).toBe(3);
    expect(cluster.nearestDistanceKm).toBe(69);
  });
});

// M7.6-fix1: the C4 real run (request_id 9b969274…) produced a rule-compliant
// Sonnet summary that the guardrail rejected because its foreign-mention test was
// negation-blind and, at 4 of 5 sites, not word-bounded.
const C4_SENTENCE =
  "No foreign pressure detected from neighboring countries. Current westerly winds (262°) at 10 km/h are cross-winds for a northbound arrival.";

describe("mentionsForeignPressureClaim (M7.6-fix1)", () => {
  const hooks = loadHooks();

  it("treats a negated mention as no claim (the C4 sentence)", () => {
    expect(hooks.mentionsForeignPressureClaim(C4_SENTENCE)).toBe(false);
  });

  it("treats an asserted mention as a claim", () => {
    expect(
      hooks.mentionsForeignPressureClaim(
        "Strong foreign pressure from Poland (12 points at Mikoszewo)",
      ),
    ).toBe(true);
  });

  it("does not fire on the substring 'se' inside 'present' (old /SE/i false positive)", () => {
    expect(hooks.mentionsForeignPressureClaim("Birds are present near Sääre")).toBe(false);
  });

  it("scopes the negation to the negated term only", () => {
    // "Not in Finland" is negated; "strong pressure from Latvia" is not.
    expect(
      hooks.mentionsForeignPressureClaim("Not in Finland but strong pressure from Latvia"),
    ).toBe(true);
  });

  it("does not fire on the English preposition 'by' (the 'by' country code is excluded)", () => {
    expect(
      hooks.mentionsForeignPressureClaim(
        "No foreign pressure detected. Watchers should focus on coastal sites shaped by westerly winds.",
      ),
    ).toBe(false);
  });

  it("still flags Belarus by name", () => {
    expect(
      hooks.mentionsForeignPressureClaim("Strong pressure is building from Belarus."),
    ).toBe(true);
  });

  it("leaves 'Birds are present near Sääre' alone in sanitizeSummaryAgainstEvidence", () => {
    // predictedTargets is non-empty so the unrelated hotspot rule cannot fire and
    // the foreign rule is the only one under test.
    const response: Record<string, unknown> = {
      insightSummary: "Birds are present near Sääre",
      aiSummary: "Birds are present near Sääre",
      estoniaEvidence: { recentCount7d: 0 },
      foreignRecentPoints: [],
      foreignClusters: [],
      predictedTargets: [{ name: "Sääre" }],
      sourceHealth: { ebirdAvailable: false },
    };

    const sanitized = hooks.sanitizeSummaryAgainstEvidence(response);

    expect(sanitized.insightSummary).toBe("Birds are present near Sääre");
    expect(sanitized.summaryOrigin).toBeUndefined();
  });
});

describe("canonical guardrails accept a negated foreign mention (M7.6-fix1)", () => {
  const hooks = loadHooks();

  it("canonicalSummaryMatchesEvidence passes the C4 sentence with empty foreign arrays", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      summary: C4_SENTENCE,
      estoniaEvidence: { recentCount7d: 0, recentCount30d: 0 },
      foreignRecentPoints: [],
      foreignClusters: [],
      predictedTargets: [],
      elurikkusRecentRecords: [],
    });

    expect(result.reasons).not.toContain(
      "summary_mentions_foreign_pressure_without_structured_foreign_evidence",
    );
    expect(result.ok).toBe(true);
  });

  it("buildFinalConsistencyChecksFromCanonical keeps foreignPressureMatchesNarrative true", () => {
    const checks = hooks.buildFinalConsistencyChecksFromCanonical({
      foreignRecentPoints: [],
      foreignClusters: [],
      predictedTargets: [],
      weather: {},
      insightSummary: C4_SENTENCE,
    });

    expect(checks.foreignPressureMatchesNarrative).toBe(true);
  });

  it("still rejects an asserted foreign claim with no structured foreign evidence", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      summary: "Strong foreign pressure from Poland (12 points at Mikoszewo).",
      estoniaEvidence: { recentCount7d: 0, recentCount30d: 0 },
      foreignRecentPoints: [],
      foreignClusters: [],
      predictedTargets: [],
      elurikkusRecentRecords: [],
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(
      "summary_mentions_foreign_pressure_without_structured_foreign_evidence",
    );
  });
});

describe("ai_summary_unavailable survives the guardrail rebuild (M7.6-fix1)", () => {
  const hooks = loadHooks();
  const marker = "ai_summary_unavailable: Sonnet stopped on max_tokens (50 tokens)";

  it("buildCanonicalPredictionRecord keeps the marker when it discards the preferred summary", () => {
    // recentCount7d is 0, so this narrative fails canonicalSummaryMatchesEvidence and
    // the record falls back to the deterministic summary -- which used to drop the
    // fallback marker along with the rest of the preferred summary's warnings.
    const record = hooks.buildCanonicalPredictionRecord({
      base: buildBasePayload(),
      alternate: null,
      preferredSummary: {
        insightSummary: "ALREADY PRESENT — 4 records in 7 days.",
        confidenceNote: "test confidence",
        rankingNotes: "test ranking",
        warnings: ["No foreign pressure detected in canonical evidence.", marker],
      },
      preferredSummaryOrigin: "deterministic_structured",
    });

    const warnings = Array.isArray(record.warnings) ? record.warnings.map(String) : [];
    expect(record.summaryGuardrailApplied).toBe(true);
    expect(warnings).toContain(marker);
  });

  it("enforceCanonicalSummaryConsistency keeps the marker when it rebuilds the summary", () => {
    const canonical: Record<string, unknown> = {
      speciesKey: "gavia-arctica",
      speciesName: "Punakurk-kaur",
      summaryOrigin: "deterministic_structured",
      insightSummary: "ALREADY PRESENT — 7 records in 7 days at Põõsaspea.",
      confidenceNote: "test confidence",
      rankingNotes: "test ranking",
      warnings: ["No predicted targets returned from canonical evidence.", marker],
      estoniaEvidence: { recentCount7d: 0, recentCount30d: 0 },
      foreignRecentPoints: [],
      foreignClusters: [],
      predictedTargets: [],
      elurikkusRecentRecords: [],
      weather: {},
      activeEvidenceSources: [],
      availableSources: [],
      attemptedButUnavailable: [],
      attemptedButReturnedNoUsableEvidence: [],
      hasUsableRecentEstoniaEvidence: false,
      hasUsableEstoniaHistory: false,
      hasUsableForeignPressure: false,
      hasUsablePredictedTargets: false,
      hasOnlyWeather: false,
      hasOnlySourceAvailabilityWithoutUsableEvidence: false,
      effectiveRankingMode: "evidence_only",
      evidenceState: "insufficient_evidence",
      summaryGuardrailReason: "",
    };

    const enforced = hooks.enforceCanonicalSummaryConsistency(canonical);

    const warnings = Array.isArray(enforced.warnings) ? enforced.warnings.map(String) : [];
    expect(enforced.summaryRegeneratedFromStructuredEvidence).toBe(true);
    expect(String(enforced.insightSummary)).not.toMatch(/ALREADY PRESENT/i);
    expect(warnings).toContain(marker);
  });
});

// The exact sentence Sonnet returned in the M7.6b Phase C run (req db798eb7,
// 2026-09-03 04:52Z, EF v18). It is CORRECT -- recentCount30d really was 0 --
// and the negation-blind /30\s+days/i test rejected it, discarding the narrative
// and cascading into fail_closed_summary_enforcement.
const FIX2_30D_SENTENCE =
  "No Estonian records in past 30 days, well after typical arrival window (median 03-Jan, range 01-Jan to 24-Jan).";

const ZERO_EVIDENCE = {
  estoniaEvidence: { recentCount7d: 0, recentCount30d: 0 },
  foreignRecentPoints: [],
  foreignClusters: [],
  predictedTargets: [],
  elurikkusRecentRecords: [],
};

describe("presence guardrails treat a negated or zero mention as no claim (M7.6-fix2)", () => {
  const hooks = loadHooks();

  it("accepts the 04:52Z 30-day sentence when recentCount30d is zero", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      ...ZERO_EVIDENCE,
      summary: FIX2_30D_SENTENCE,
    });

    expect(result.reasons).not.toContain(
      "summary_claims_recent_30d_presence_but_recentCount30d_is_zero",
    );
    expect(result.ok).toBe(true);
  });

  it("still rejects an asserted 30-day presence claim when recentCount30d is zero", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      ...ZERO_EVIDENCE,
      summary: "12 records in the last 30 days confirm a steady presence.",
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(
      "summary_claims_recent_30d_presence_but_recentCount30d_is_zero",
    );
  });

  it("accepts a negated 'already present' when recentCount7d is zero", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      ...ZERO_EVIDENCE,
      summary: "Punakurk-kaur is not already present in Estonia this week.",
    });

    expect(result.reasons).not.toContain(
      "summary_claims_recent_estonia_but_recentCount7d_is_zero",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a stated zero count -- '0 records in 7 days' is a true statement, not a claim", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      ...ZERO_EVIDENCE,
      summary: "0 records in 7 days for this species.",
    });

    expect(result.reasons).not.toContain(
      "summary_claims_recent_estonia_but_recentCount7d_is_zero",
    );
    expect(result.reasons).not.toContain(
      "summary_recentCount7d_does_not_match_structured_recentCount7d",
    );
    expect(result.ok).toBe(true);
  });

  it("still rejects an asserted ALREADY PRESENT with a non-zero count when recentCount7d is zero", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      ...ZERO_EVIDENCE,
      summary: "ALREADY PRESENT — 3 records in 7 days.",
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(
      "summary_claims_recent_estonia_but_recentCount7d_is_zero",
    );
  });
});

// M7.6-fix2: the presence checks use NEGATION_WINDOW_PRESENCE ({0,8}) because a
// 30-day negation is separated from the term by a whole clause. The foreign
// check keeps {0,4} -- see the byte-identical guard at the end of this block.
describe("wider presence negation window accepts natural 30-day phrasings (M7.6-fix2)", () => {
  const hooks = loadHooks();

  it("accepts 'No Estonian records were confirmed in the past 30 days.'", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      ...ZERO_EVIDENCE,
      summary: "No Estonian records were confirmed in the past 30 days.",
    });

    expect(result.reasons).not.toContain(
      "summary_claims_recent_30d_presence_but_recentCount30d_is_zero",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts 'There have been no confirmed Estonian records at all in the past 30 days.'", () => {
    const result = hooks.canonicalSummaryMatchesEvidence({
      ...ZERO_EVIDENCE,
      summary: "There have been no confirmed Estonian records at all in the past 30 days.",
    });

    expect(result.reasons).not.toContain(
      "summary_claims_recent_30d_presence_but_recentCount30d_is_zero",
    );
    expect(result.ok).toBe(true);
  });

  it("keeps the foreign window at 4 -- a claim after a negation is still a claim", () => {
    // At {0,8} the negator would swallow the whole clause and this real foreign
    // claim would slip through the guardrail. Pins the two windows apart.
    expect(
      hooks.mentionsForeignPressureClaim("Not in Finland but strong pressure from Latvia"),
    ).toBe(true);
  });
});
