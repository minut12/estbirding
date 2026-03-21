import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type BackendHooks = {
  finalizePredictionResponse: (
    response: Record<string, unknown>,
    branch: string,
  ) => Record<string, unknown>;
  sanitizeSummaryAgainstEvidence: (
    response: Record<string, unknown>,
  ) => Record<string, unknown>;
  withEdgeResponseMarkers: (
    body: Record<string, unknown>,
  ) => Record<string, unknown>;
  SPECIES_PREDICTION_BACKEND_BUILD: string;
  INVOKE_ROUTE_VERSION: string;
  EDGE_RESPONSE_PROOF: string;
  buildNeutralStructuredEvidenceSummary: (speciesName: string) => {
    insightSummary: string;
    confidenceNote: string;
    rankingNotes: string;
    warnings: string[];
  };
};

function loadBackendHooks(): BackendHooks {
  const filePath = path.resolve("supabase/functions/species-prediction/index.ts");
  const source = fs.readFileSync(filePath, "utf8")
    .replace(/^import .*$/gm, "");
  const wrapped = `${source}
globalThis.__speciesPredictionBackendTestHooks = {
  finalizePredictionResponse,
  sanitizeSummaryAgainstEvidence,
  withEdgeResponseMarkers,
  SPECIES_PREDICTION_BACKEND_BUILD,
  INVOKE_ROUTE_VERSION,
  EDGE_RESPONSE_PROOF,
  buildNeutralStructuredEvidenceSummary,
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
    Deno: {
      env: {
        get: () => "",
      },
    },
    globalThis: {} as Record<string, unknown>,
  };
  context.globalThis = context;
  vm.runInNewContext(transpiled, context, { filename: filePath });
  return context.__speciesPredictionBackendTestHooks as BackendHooks;
}

function buildBaseResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    speciesName: "Punakurk-kaur",
    insightSummary: "Structured evidence is currently unavailable or incomplete for this species, so recent Estonia presence and foreign pressure could not be confirmed from the final response payload.",
    aiSummary: "Structured evidence is currently unavailable or incomplete for this species, so recent Estonia presence and foreign pressure could not be confirmed from the final response payload.",
    confidenceNote: "Confidence is limited because the final structured evidence for Punakurk-kaur is incomplete or contradictory.",
    rankingNotes: "Hotspot ranking was not retained because the final structured evidence did not support a consistent ranked output.",
    warnings: [],
    summaryOrigin: "deterministic_structured",
    summaryRegeneratedFromStructuredEvidence: false,
    estoniaEvidence: {
      recentCount7d: 0,
      recentCount30d: 0,
      latestEstoniaLocality: "",
      freshestLocalities: [],
    },
    foreignRecentPoints: [],
    foreignClusters: [],
    predictedTargets: [],
    elurikkusRecentRecords: [],
    sourceHealth: {
      ebirdAvailable: false,
      primarySourceUsed: "eElurikkus Estonia",
    },
    rawResearchPayload: {
      aiSummary: "stale legacy summary",
    },
    ...overrides,
  };
}

describe("species-prediction backend summary finalizer", () => {
  const hooks = loadBackendHooks();
  const emptyEvidenceSummary = "No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This result should be treated as incomplete evidence, not as an already-present signal.";

  it("replaces stale already-present summary when structured evidence is empty", () => {
    const response = buildBaseResponse({
      insightSummary: "ALREADY PRESENT - 12 records in 7 days near Saare village.",
      aiSummary: "ALREADY PRESENT - 12 records in 7 days near Saare village.",
      rawResearchPayload: { aiSummary: "ALREADY PRESENT - 12 records in 7 days near Saare village." },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_exact_contradiction");

    expect(String(finalized.insightSummary)).toBe(emptyEvidenceSummary);
    expect(finalized.aiSummary).toBe(finalized.insightSummary);
    expect((finalized.rawResearchPayload as Record<string, unknown>).aiSummary).toBe(finalized.insightSummary);
    expect(finalized.summaryRegeneratedFromStructuredEvidence).toBe(true);
    expect(finalized.predictedTargets).toEqual([]);
  });

  it("removes foreign narrative when foreign arrays are empty", () => {
    const response = buildBaseResponse({
      insightSummary: "Pressure is building from PL, SE, FI, Mikoszewo, Kalmar and Helsinki.",
      aiSummary: "Pressure is building from PL, SE, FI, Mikoszewo, Kalmar and Helsinki.",
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_foreign_narrative");

    expect(String(finalized.insightSummary)).toBe(emptyEvidenceSummary);
    expect(finalized.summaryOrigin).toBe("neutral_sanitizer_fallback");
  });

  it("removes hotspot narrative when there are no predicted targets", () => {
    const response = buildBaseResponse({
      insightSummary: "Ristna and Poosaspea remain the top hotspot ranking right now.",
      aiSummary: "Ristna and Poosaspea remain the top hotspot ranking right now.",
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_hotspot_narrative");

    expect(String(finalized.insightSummary)).toContain("incomplete evidence");
    expect(String(finalized.insightSummary)).not.toMatch(/Ristna|Poosaspea/i);
    expect(finalized.aiSummary).toBe(finalized.insightSummary);
  });

  it("recomputes even previously valid upstream summaries from structured evidence", () => {
    const response = buildBaseResponse({
      insightSummary: "Punakurk-kaur is supported by canonical structured evidence: Estonia history is present; foreign pressure is present from Finland.",
      aiSummary: "Punakurk-kaur is supported by canonical structured evidence: Estonia history is present; foreign pressure is present from Finland.",
      summaryOrigin: "normalized_upstream",
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        latestEstoniaLocality: "Saaremaa",
        freshestLocalities: ["Saaremaa"],
      },
      foreignRecentPoints: [
        { countryName: "Finland", countryCode: "FI", daysAgo: 2 },
      ],
      foreignClusters: [
        { countries: ["Finland"], countryCodes: ["FI"] },
      ],
      estoniaHistoryPoints: [
        { locality: "Saaremaa", eventDate: "2026-03-18T00:00:00.000Z" },
      ],
      sourceHealth: {
        ebirdAvailable: true,
        primarySourceUsed: "eElurikkus Estonia",
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_valid_upstream");

    expect(finalized.insightSummary).toBe("No recent Estonia records were confirmed in the last 7 days.");
    expect(finalized.summaryOrigin).toBe("regenerated_from_structured");
    expect(finalized.summaryRegeneratedFromStructuredEvidence).toBe(true);
  });

  it("overwrites legacy rawResearchPayload.aiSummary with canonical summary", () => {
    const response = buildBaseResponse({
      rawResearchPayload: {
        aiSummary: "stale raw summary mentioning Finland",
        insightSummary: "stale raw summary mentioning Finland",
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_raw_payload_sync");

    expect((finalized.rawResearchPayload as Record<string, unknown>).aiSummary).toBe(finalized.insightSummary);
    expect((finalized.rawResearchPayload as Record<string, unknown>).insightSummary).toBe(finalized.insightSummary);
  });

  it("prevents late legacy merge text from surviving after sanitize", () => {
    const response = buildBaseResponse({
      insightSummary: "ALREADY PRESENT - 12 records in 7 days around Saare village and Helsinki.",
      aiSummary: "ALREADY PRESENT - 12 records in 7 days around Saare village and Helsinki.",
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT - 12 records in 7 days around Saare village and Helsinki.",
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_late_merge");

    expect(String(finalized.insightSummary)).not.toMatch(/ALREADY PRESENT|Helsinki|Saare/i);
    expect(finalized.aiSummary).toBe(finalized.insightSummary);
    expect((finalized.rawResearchPayload as Record<string, unknown>).aiSummary).toBe(finalized.insightSummary);
    expect(finalized.summaryOrigin).toBe("neutral_sanitizer_fallback");
  });

  it("sanitizes recovery-path summaries and syncs nested rawResearchPayload", () => {
    const response = buildBaseResponse({
      insightSummary: "",
      aiSummary: "ALREADY PRESENT - 12 records in 7 days from PL and SE.",
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT - 12 records in 7 days from PL and SE.",
      },
    });

    const sanitized = hooks.sanitizeSummaryAgainstEvidence(response);
    const finalized = hooks.finalizePredictionResponse(sanitized, "test_recovery_path");

    expect(String(finalized.insightSummary)).not.toMatch(/ALREADY PRESENT|Poland|Sweden|Finland|\bPL\b|\bSE\b|\bFI\b/i);
    expect(finalized.aiSummary).toBe(finalized.insightSummary);
    expect((finalized.rawResearchPayload as Record<string, unknown>).aiSummary).toBe(finalized.insightSummary);
  });

  it("sanitizes legacy_or_unverified_source payloads with stale narrative", () => {
    const response = buildBaseResponse({
      payloadSourceState: "legacy_or_unverified_source",
      insightSummary: "ALREADY PRESENT - 12 records in 7 days at Tagaranna with PL and Finland pressure.",
      aiSummary: "ALREADY PRESENT - 12 records in 7 days at Tagaranna with PL and Finland pressure.",
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT - 12 records in 7 days at Tagaranna with PL and Finland pressure.",
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_legacy_unverified");

    expect(String(finalized.insightSummary)).toBe(emptyEvidenceSummary);
    expect(String(finalized.insightSummary)).not.toMatch(/ALREADY PRESENT|Tagaranna|\bPL\b|Finland/i);
    expect(finalized.aiSummary).toBe(finalized.insightSummary);
    expect((finalized.rawResearchPayload as Record<string, unknown>).aiSummary).toBe(finalized.insightSummary);
  });

  it("overwrites evidence-derived fields from structured evidence", () => {
    const response = buildBaseResponse({
      warnings: ["stale warning"],
      consistencyChecks: {
        routeLooksPlausible: true,
        timingLooksPlausible: true,
        weatherLooksSupportive: true,
        foreignPressureMatchesNarrative: false,
      },
      countryScores: {
        latvia: 9,
        lithuania: 9,
        belarus: 9,
        poland: 9,
        russia: 9,
        finlandContextOnly: 9,
      },
      externalPressureScore: 99,
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        alreadyPresent: true,
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_overwrite_derived_fields");

    expect((finalized.estoniaEvidence as Record<string, unknown>).alreadyPresent).toBe(false);
    expect(finalized.externalPressureScore).toBe(0);
    expect((finalized.countryScores as Record<string, unknown>).latvia).toBe(0);
    expect((finalized.consistencyChecks as Record<string, unknown>).foreignPressureMatchesNarrative).toBe(true);
    expect((finalized.consistencyChecks as Record<string, unknown>).legacyStateSafe).toBe(true);
    expect(finalized.warnings).not.toEqual(["stale warning"]);
  });

  it("does not let poll marker wrapping reintroduce stale summary text", () => {
    const response = buildBaseResponse({
      insightSummary: "ALREADY PRESENT - 12 records in 7 days near Helsinki.",
      aiSummary: "ALREADY PRESENT - 12 records in 7 days near Helsinki.",
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT - 12 records in 7 days near Helsinki.",
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_poll_source");
    const polled = hooks.withEdgeResponseMarkers(finalized);

    expect(String(polled.insightSummary)).not.toMatch(/ALREADY PRESENT|Helsinki/i);
    expect(polled.aiSummary).toBe(polled.insightSummary);
    expect((polled.rawResearchPayload as Record<string, unknown>).aiSummary).toBe(polled.insightSummary);
  });

  it("marks finalized payloads with current backend source identity fields", () => {
    const finalized = hooks.finalizePredictionResponse(buildBaseResponse(), "test_source_markers");
    const wrapped = hooks.withEdgeResponseMarkers(finalized);

    expect(wrapped.backendBuild).toBe(hooks.SPECIES_PREDICTION_BACKEND_BUILD);
    expect(wrapped.invokeRouteVersion).toBe(hooks.INVOKE_ROUTE_VERSION);
    expect(wrapped.responseProof).toBe(hooks.EDGE_RESPONSE_PROOF);
  });
});
