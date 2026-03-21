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

  it("replaces stale already-present summary when structured evidence is empty", () => {
    const response = buildBaseResponse({
      insightSummary: "ALREADY PRESENT - 12 records in 7 days near Sääre küla.",
      aiSummary: "ALREADY PRESENT - 12 records in 7 days near Sääre küla.",
      rawResearchPayload: { aiSummary: "ALREADY PRESENT - 12 records in 7 days near Sääre küla." },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_exact_contradiction");

    expect(finalized.insightSummary).toContain("Structured evidence is currently incomplete in the final payload");
    expect(finalized.aiSummary).toBe(finalized.insightSummary);
    expect((finalized.rawResearchPayload as Record<string, unknown>).aiSummary).toBe(finalized.insightSummary);
    expect(finalized.summaryRegeneratedFromStructuredEvidence).toBe(true);
  });

  it("removes foreign narrative when foreign arrays are empty", () => {
    const response = buildBaseResponse({
      insightSummary: "Pressure is building from PL, SE, FI, Mikoszewo, Kalmar and Helsinki.",
      aiSummary: "Pressure is building from PL, SE, FI, Mikoszewo, Kalmar and Helsinki.",
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_foreign_narrative");

    expect(String(finalized.insightSummary)).not.toMatch(/PL|SE|FI|Mikoszewo|Kalmar|Helsinki/);
    expect(finalized.summaryOrigin).toBe("neutral_sanitizer_fallback");
  });

  it("removes hotspot narrative when there are no predicted targets", () => {
    const response = buildBaseResponse({
      insightSummary: "Ristna and Põõsaspea remain the top hotspot ranking right now.",
      aiSummary: "Ristna and Põõsaspea remain the top hotspot ranking right now.",
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_hotspot_narrative");

    expect(String(finalized.insightSummary)).not.toMatch(/Ristna|Põõsaspea/i);
    expect(String(finalized.insightSummary)).toContain("cannot be confirmed");
    expect(finalized.aiSummary).toBe(finalized.insightSummary);
  });

  it("preserves a valid upstream summary that matches structured evidence", () => {
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

    expect(finalized.insightSummary).toContain("supported by canonical structured evidence");
    expect(finalized.summaryOrigin).toBe("normalized_upstream");
    expect(finalized.summaryRegeneratedFromStructuredEvidence).toBe(false);
  });

  it("overwrites legacy rawResearchPayload.aiSummary with canonical summary", () => {
    const response = buildBaseResponse({
      insightSummary: "Structured evidence is currently unavailable or incomplete for this species, so recent Estonia presence and foreign pressure could not be confirmed from the final response payload.",
      aiSummary: "Structured evidence is currently unavailable or incomplete for this species, so recent Estonia presence and foreign pressure could not be confirmed from the final response payload.",
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
      insightSummary: "ALREADY PRESENT - 12 records in 7 days around Sääre küla and Helsinki.",
      aiSummary: "ALREADY PRESENT - 12 records in 7 days around Sääre küla and Helsinki.",
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT - 12 records in 7 days around Sääre küla and Helsinki.",
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_late_merge");

    expect(String(finalized.insightSummary)).not.toMatch(/ALREADY PRESENT|Helsinki|Sääre/i);
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
