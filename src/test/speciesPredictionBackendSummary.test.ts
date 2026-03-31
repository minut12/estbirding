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
  hasNonPlaceholderForeignClusters: (input: unknown[]) => boolean;
  buildPredictedTargets: (opts: {
    speciesName: string;
    estoniaHistoryClusters: Array<Record<string, unknown>>;
    foreignClusters: Array<Record<string, unknown>>;
    foreignRecentPoints: Array<Record<string, unknown>>;
    weather: Record<string, unknown>;
    estoniaEvidence: Record<string, unknown>;
    horizonDays: number;
  }) => Record<string, unknown>[];
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
  hasNonPlaceholderForeignClusters,
  buildPredictedTargets,
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
  return (context as any).__speciesPredictionBackendTestHooks as BackendHooks;
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
  const emptyEvidenceSummary = "No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This output should be treated as incomplete evidence rather than an already-present signal.";

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
    expect((finalized.rawResearchPayload as Record<string, unknown>).foreignEvidence).toEqual([]);
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
    expect((finalized.rawResearchPayload as Record<string, unknown>).predictedTargets).toEqual([]);
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

  it("rebuilds final foreign payload fields from canonical normalized evidence", () => {
    const response = buildBaseResponse({
      speciesName: "Punanokk-vart",
      foreignRecentPoints: [
        {
          lat: 57.82,
          lon: 23.18,
          obsDt: "2026-03-29T09:00:00.000Z",
          locName: "Kolkasrags",
          countryCode: "lv",
          countryName: "Latvia",
          source: "eBird",
          daysAgo: 1,
          distanceToEstoniaKm: 72,
        },
        {
          lat: 57.91,
          lon: 23.34,
          obsDt: "2026-03-29T08:00:00.000Z",
          locName: "Kurzeme coast",
          countryCode: "lv",
          countryName: "Latvia",
          source: "eBird",
          daysAgo: 1,
          distanceToEstoniaKm: 68,
        },
      ],
      foreignClusters: [
        {
          id: "lv-cluster-1",
          lat: 57.86,
          lon: 23.25,
          pointCount: 2,
          newestObsDt: "2026-03-29T09:00:00.000Z",
          oldestObsDt: "2026-03-29T08:00:00.000Z",
          freshestDaysAgo: 1,
          averageDaysAgo: 1,
          totalHowMany: 5,
          countries: ["Latvia"],
          countryCodes: ["lv"],
          locNames: ["Kolkasrags", "Kurzeme coast"],
          nearestDistanceKm: 68,
          isFreshest: true,
        },
      ],
      sourceHealth: {
        ebirdAvailable: true,
        primarySourceUsed: "eBird foreign",
      },
      weather: {
        fetchedAt: "2026-03-29T10:00:00.000Z",
        windSpeedKph: 24,
        windDirectionDeg: 205,
        weatherAvailable: true,
        weatherPartial: false,
        source: "Open-Meteo",
      },
      evidenceSummary: {
        totalForeignRecentPoints: 0,
        weatherAvailable: false,
      },
      countryScores: {
        latvia: 0,
        lithuania: 0,
        belarus: 0,
        poland: 0,
        russia: 0,
        finlandContextOnly: 0,
      },
      externalPressureScore: 0,
      rawResearchPayload: {
        normalizedSources: {
          foreignRecentPoints: [
            {
              lat: 57.82,
              lon: 23.18,
              obsDt: "2026-03-29T09:00:00.000Z",
              locName: "Kolkasrags",
              countryCode: "lv",
              countryName: "Latvia",
              source: "eBird",
              daysAgo: 1,
              distanceToEstoniaKm: 72,
            },
          ],
          foreignClusters: [
            {
              id: "lv-cluster-1",
              lat: 57.86,
              lon: 23.25,
              pointCount: 2,
              newestObsDt: "2026-03-29T09:00:00.000Z",
              oldestObsDt: "2026-03-29T08:00:00.000Z",
              freshestDaysAgo: 1,
              averageDaysAgo: 1,
              totalHowMany: 5,
              countries: ["Latvia"],
              countryCodes: ["lv"],
              locNames: ["Kolkasrags", "Kurzeme coast"],
              nearestDistanceKm: 68,
              isFreshest: true,
            },
          ],
          weather: {
            fetchedAt: "2026-03-29T10:00:00.000Z",
            windSpeedKph: 24,
            windDirectionDeg: 205,
            weatherAvailable: true,
            weatherPartial: false,
            source: "Open-Meteo",
          },
        },
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_canonical_foreign_finalizer");

    expect(Array.isArray(finalized.foreignRecentPoints)).toBe(true);
    expect((finalized.foreignRecentPoints as unknown[]).length).toBe(2);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.countries).toEqual(["Latvia"]);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.countryCodes).toEqual(["lv"]);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.totalHowMany).toBe(5);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.nearestDistanceKm).toBe(68);
    expect((finalized.evidenceSummary as Record<string, unknown>).totalForeignRecentPoints).toBeGreaterThan(0);
    expect((finalized.countryScores as Record<string, unknown>).latvia).toBeGreaterThan(0);
    expect(Number(finalized.externalPressureScore)).toBeGreaterThan(0);
    expect((finalized.evidenceSummary as Record<string, unknown>).weatherAvailable).toBe(true);
    expect(((finalized.rawResearchPayload as Record<string, unknown>).countryScores as Record<string, unknown>).latvia).toBeGreaterThan(0);
    expect(Number((finalized.rawResearchPayload as Record<string, unknown>).externalPressureScore)).toBeGreaterThan(0);
  });

  it("anchors no-recent-Estonia ranking to foreign pressure and Estonia entry corridor", () => {
    const predicted = hooks.buildPredictedTargets({
      speciesName: "Punanokk-vart",
      foreignRecentPoints: [
        {
          lat: 57.85,
          lon: 23.2,
          obsDt: "2026-03-30T06:00:00.000Z",
          locName: "Kolkasrags",
          countryCode: "lv",
          countryName: "Latvia",
          source: "eBird",
          daysAgo: 1,
          clusterId: "lv-cluster-1",
          distanceToEstoniaKm: 70,
        },
      ],
      foreignClusters: [
        {
          id: "lv-cluster-1",
          lat: 57.86,
          lon: 23.22,
          pointCount: 4,
          newestObsDt: "2026-03-30T06:00:00.000Z",
          oldestObsDt: "2026-03-29T06:00:00.000Z",
          freshestDaysAgo: 1,
          averageDaysAgo: 1.2,
          totalHowMany: 8,
          countries: ["Latvia"],
          countryCodes: ["lv"],
          locNames: ["Kolkasrags"],
          nearestDistanceKm: 70,
          isFreshest: true,
        },
      ],
      estoniaHistoryClusters: [
        {
          id: "nomme-old",
          lat: 59.38,
          lon: 24.67,
          representativeLat: 59.38,
          representativeLon: 24.67,
          count: 12,
          recentCount: 0,
          locality: "Nõmme linnaosa",
          municipality: "Tallinn",
          displayName: "Nõmme linnaosa",
          habitatCue: "inland park",
          habitatType: "terrestrial_or_unknown",
          habitatScore: 2,
          coastalDistanceKm: 42,
          clusterTightnessKm: 4,
          newestEventDate: "2025-03-12T00:00:00.000Z",
          oldestEventDate: "2023-03-12T00:00:00.000Z",
          source: "GBIF",
          sourceBreakdown: { GBIF: 12 },
        },
        {
          id: "poosaspea-entry",
          lat: 59.21,
          lon: 23.52,
          representativeLat: 59.2054,
          representativeLon: 23.5164,
          count: 5,
          recentCount: 0,
          locality: "Põõsaspea neem",
          municipality: "Lääne-Nigula",
          displayName: "Põõsaspea neem",
          habitatCue: "coastal migration bottleneck",
          habitatType: "coastal_open_water",
          habitatScore: 28,
          coastalDistanceKm: 2,
          clusterTightnessKm: 3,
          newestEventDate: "2025-03-10T00:00:00.000Z",
          oldestEventDate: "2023-03-10T00:00:00.000Z",
          source: "GBIF",
          sourceBreakdown: { GBIF: 5 },
        },
      ],
      weather: {
        fetchedAt: "2026-03-30T08:00:00.000Z",
        windSpeedKph: 26,
        windDirectionDeg: 210,
        weatherAvailable: true,
        weatherPartial: false,
      },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        alreadyPresent: false,
      },
      horizonDays: 7,
    });

    expect(predicted[0]?.name).toBe("Põõsaspea neem");
    expect(String(predicted[0]?.reason)).toMatch(/Anchored to fresh foreign pressure/i);
    expect(String(predicted[0]?.reason)).toMatch(/Estonia entry corridor/i);
    expect(String(predicted[0]?.reason)).not.toMatch(/Nõmme linnaosa.*before ranking/i);
    expect(predicted[0]?.rankingMode).toBe("foreign_anchor_entry_corridor");
  });

  it("keeps visible migration origin at strongest upstream source while allowing downstream corridor staging", () => {
    const predicted = hooks.buildPredictedTargets({
      speciesName: "Punanokk-vart",
      foreignRecentPoints: [
        {
          lat: 54.35,
          lon: 18.68,
          obsDt: "2026-03-30T06:00:00.000Z",
          locName: "Mikoszewo",
          countryCode: "pl",
          countryName: "Poland",
          source: "eBird",
          daysAgo: 1,
          clusterId: "pl-source",
          distanceToEstoniaKm: 420,
        },
        {
          lat: 57.86,
          lon: 23.22,
          obsDt: "2026-03-30T07:00:00.000Z",
          locName: "Kolkasrags",
          countryCode: "lv",
          countryName: "Latvia",
          source: "eBird",
          daysAgo: 1,
          clusterId: "lv-corridor",
          distanceToEstoniaKm: 70,
        },
      ],
      foreignClusters: [
        {
          id: "pl-source",
          lat: 54.35,
          lon: 18.68,
          pointCount: 5,
          newestObsDt: "2026-03-30T06:00:00.000Z",
          oldestObsDt: "2026-03-29T06:00:00.000Z",
          freshestDaysAgo: 1,
          averageDaysAgo: 1.1,
          totalHowMany: 18,
          countries: ["Poland"],
          countryCodes: ["pl"],
          locNames: ["Mikoszewo"],
          nearestDistanceKm: 420,
          isFreshest: true,
        },
        {
          id: "lv-corridor",
          lat: 57.86,
          lon: 23.22,
          pointCount: 1,
          newestObsDt: "2026-03-30T07:00:00.000Z",
          oldestObsDt: "2026-03-30T07:00:00.000Z",
          freshestDaysAgo: 1,
          averageDaysAgo: 1,
          totalHowMany: 1,
          countries: ["Latvia"],
          countryCodes: ["lv"],
          locNames: ["Kolkasrags"],
          nearestDistanceKm: 70,
          isFreshest: false,
        },
      ],
      estoniaHistoryClusters: [
        {
          id: "poosaspea-entry",
          lat: 59.21,
          lon: 23.52,
          representativeLat: 59.2054,
          representativeLon: 23.5164,
          count: 5,
          recentCount: 0,
          locality: "Põõsaspea neem",
          municipality: "Lääne-Nigula",
          displayName: "Põõsaspea neem",
          habitatCue: "coastal migration bottleneck",
          habitatType: "coastal_open_water",
          habitatScore: 28,
          coastalDistanceKm: 2,
          clusterTightnessKm: 3,
          newestEventDate: "2025-03-10T00:00:00.000Z",
          oldestEventDate: "2023-03-10T00:00:00.000Z",
          source: "GBIF",
          sourceBreakdown: { GBIF: 5 },
        },
      ],
      weather: {
        fetchedAt: "2026-03-30T08:00:00.000Z",
        windSpeedKph: 24,
        windDirectionDeg: 205,
        weatherAvailable: true,
        weatherPartial: false,
      },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        alreadyPresent: false,
      },
      horizonDays: 7,
    });

    const finalized = hooks.finalizePredictionResponse(buildBaseResponse({
      speciesName: "Punanokk-vart",
      sourceHealth: {
        ebirdAvailable: true,
        primarySourceUsed: "eBird foreign",
      },
      predictedTargets: predicted,
      foreignRecentPoints: [
        {
          lat: 54.35,
          lon: 18.68,
          obsDt: "2026-03-30T06:00:00.000Z",
          locName: "Mikoszewo",
          countryCode: "pl",
          countryName: "Poland",
          source: "eBird",
          daysAgo: 1,
          clusterId: "pl-source",
          distanceToEstoniaKm: 420,
        },
        {
          lat: 57.86,
          lon: 23.22,
          obsDt: "2026-03-30T07:00:00.000Z",
          locName: "Kolkasrags",
          countryCode: "lv",
          countryName: "Latvia",
          source: "eBird",
          daysAgo: 1,
          clusterId: "lv-corridor",
          distanceToEstoniaKm: 70,
        },
      ],
      foreignClusters: [
        {
          id: "placeholder",
          lat: 57.86,
          lon: 23.22,
          pointCount: 1,
          newestObsDt: "2026-03-30T07:00:00.000Z",
          oldestObsDt: "2026-03-30T07:00:00.000Z",
          freshestDaysAgo: 1,
          averageDaysAgo: 1,
          totalHowMany: 0,
          countries: [],
          countryCodes: [],
          locNames: [],
          nearestDistanceKm: 0,
          isFreshest: false,
        },
      ],
      estoniaHistoryClusters: [
        {
          id: "poosaspea-entry",
          lat: 59.21,
          lon: 23.52,
          representativeLat: 59.2054,
          representativeLon: 23.5164,
          count: 5,
          recentCount: 0,
          locality: "Põõsaspea neem",
          municipality: "Lääne-Nigula",
          displayName: "Põõsaspea neem",
          habitatCue: "coastal migration bottleneck",
          habitatType: "coastal_open_water",
          habitatScore: 28,
          coastalDistanceKm: 2,
          clusterTightnessKm: 3,
          newestEventDate: "2025-03-10T00:00:00.000Z",
          oldestEventDate: "2023-03-10T00:00:00.000Z",
          source: "GBIF",
          sourceBreakdown: { GBIF: 5 },
        },
      ],
      weather: {
        fetchedAt: "2026-03-30T08:00:00.000Z",
        windSpeedKph: 24,
        windDirectionDeg: 205,
        weatherAvailable: true,
        weatherPartial: false,
      },
      rawResearchPayload: {
        normalizedSources: {
          foreignRecentPoints: [
            {
              lat: 54.35,
              lon: 18.68,
              obsDt: "2026-03-30T06:00:00.000Z",
              locName: "Mikoszewo",
              countryCode: "pl",
              countryName: "Poland",
              source: "eBird",
              daysAgo: 1,
              clusterId: "pl-source",
              distanceToEstoniaKm: 420,
            },
            {
              lat: 57.86,
              lon: 23.22,
              obsDt: "2026-03-30T07:00:00.000Z",
              locName: "Kolkasrags",
              countryCode: "lv",
              countryName: "Latvia",
              source: "eBird",
              daysAgo: 1,
              clusterId: "lv-corridor",
              distanceToEstoniaKm: 70,
            },
          ],
          foreignClusters: [
            {
              id: "pl-source",
              lat: 54.35,
              lon: 18.68,
              pointCount: 5,
              newestObsDt: "2026-03-30T06:00:00.000Z",
              oldestObsDt: "2026-03-29T06:00:00.000Z",
              freshestDaysAgo: 1,
              averageDaysAgo: 1.1,
              totalHowMany: 18,
              countries: ["Poland"],
              countryCodes: ["pl"],
              locNames: ["Mikoszewo"],
              nearestDistanceKm: 420,
              isFreshest: true,
            },
            {
              id: "lv-corridor",
              lat: 57.86,
              lon: 23.22,
              pointCount: 1,
              newestObsDt: "2026-03-30T07:00:00.000Z",
              oldestObsDt: "2026-03-30T07:00:00.000Z",
              freshestDaysAgo: 1,
              averageDaysAgo: 1,
              totalHowMany: 1,
              countries: ["Latvia"],
              countryCodes: ["lv"],
              locNames: ["Kolkasrags"],
              nearestDistanceKm: 70,
              isFreshest: false,
            },
          ],
          weather: {
            fetchedAt: "2026-03-30T08:00:00.000Z",
            windSpeedKph: 24,
            windDirectionDeg: 205,
            weatherAvailable: true,
            weatherPartial: false,
          },
        },
      },
    }), "test_source_origin_vs_corridor");

    const topTarget = (finalized.predictedTargets as Array<Record<string, unknown>>)[0];
    const eta = topTarget?.migrationEta as Record<string, unknown>;
    const route = (eta?.migrationRoute as Record<string, unknown>)?.route as Array<Record<string, unknown>>;

    expect(String(eta?.fromCountry)).toBe("PL");
    expect(String(eta?.fromLocality)).toBe("Mikoszewo");
    expect(String(route?.[0]?.name)).toBe("Mikoszewo");
    expect(String(route?.[1]?.name)).toBe("Kolkasrags");
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.countries).toEqual(["Poland"]);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.countryCodes).toEqual(["pl"]);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.totalHowMany).toBe(18);
    expect((finalized.foreignRecentPoints as Array<Record<string, unknown>>).length).toBe(2);
  });

  it("uses the canonical Lithuanian origin consistently for punanokk-vart when LT wins over LV", () => {
    const predicted = hooks.buildPredictedTargets({
      speciesName: "Punanokk-vart",
      foreignRecentPoints: [
        {
          lat: 55.34,
          lon: 21.29,
          obsDt: "2026-03-29T08:00:00.000Z",
          locName: "Nemuno delta",
          countryCode: "lt",
          countryName: "Lithuania",
          source: "eBird",
          howMany: 9,
          daysAgo: 2,
          clusterId: "lt-nemuno",
          distanceToEstoniaKm: 265,
        },
        {
          lat: 57.03,
          lon: 23.39,
          obsDt: "2026-03-28T07:00:00.000Z",
          locName: "Lake Kanieris -- Andersalas tornis",
          countryCode: "lv",
          countryName: "Latvia",
          source: "eBird",
          howMany: 2,
          daysAgo: 3,
          clusterId: "lv-kanieris",
          distanceToEstoniaKm: 155,
        },
      ],
      foreignClusters: [
        {
          id: "lt-nemuno",
          lat: 55.34,
          lon: 21.29,
          pointCount: 6,
          newestObsDt: "2026-03-29T08:00:00.000Z",
          oldestObsDt: "2026-03-28T08:00:00.000Z",
          freshestDaysAgo: 2,
          averageDaysAgo: 2,
          totalHowMany: 18,
          countries: ["Lithuania"],
          countryCodes: ["lt"],
          locNames: ["Nemuno delta"],
          nearestDistanceKm: 265,
          isFreshest: true,
        },
        {
          id: "lv-kanieris",
          lat: 57.03,
          lon: 23.39,
          pointCount: 2,
          newestObsDt: "2026-03-28T07:00:00.000Z",
          oldestObsDt: "2026-03-28T07:00:00.000Z",
          freshestDaysAgo: 3,
          averageDaysAgo: 3,
          totalHowMany: 2,
          countries: ["Latvia"],
          countryCodes: ["lv"],
          locNames: ["Lake Kanieris -- Andersalas tornis"],
          nearestDistanceKm: 155,
          isFreshest: false,
        },
      ],
      estoniaHistoryClusters: [
        {
          id: "poosaspea-entry",
          lat: 59.21,
          lon: 23.52,
          representativeLat: 59.2054,
          representativeLon: 23.5164,
          count: 5,
          recentCount: 0,
          locality: "PÃµÃµsaspea neem",
          municipality: "LÃ¤Ã¤ne-Nigula",
          displayName: "PÃµÃµsaspea neem",
          habitatCue: "coastal migration bottleneck",
          habitatType: "coastal_open_water",
          habitatScore: 28,
          coastalDistanceKm: 2,
          clusterTightnessKm: 3,
          newestEventDate: "2025-03-10T00:00:00.000Z",
          oldestEventDate: "2023-03-10T00:00:00.000Z",
          source: "GBIF",
          sourceBreakdown: { GBIF: 5 },
        },
      ],
      weather: {
        fetchedAt: "2026-03-30T08:00:00.000Z",
        windSpeedKph: 24,
        windDirectionDeg: 205,
        weatherAvailable: true,
        weatherPartial: false,
      },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        alreadyPresent: false,
      },
      horizonDays: 7,
    });

    const finalized = hooks.finalizePredictionResponse(buildBaseResponse({
      speciesName: "Punanokk-vart",
      sourceHealth: {
        ebirdAvailable: true,
        primarySourceUsed: "eBird foreign",
      },
      predictedTargets: predicted,
      foreignRecentPoints: [],
      foreignClusters: [],
      estoniaHistoryClusters: [
        {
          id: "poosaspea-entry",
          lat: 59.21,
          lon: 23.52,
          representativeLat: 59.2054,
          representativeLon: 23.5164,
          count: 5,
          recentCount: 0,
          locality: "PÃµÃµsaspea neem",
          municipality: "LÃ¤Ã¤ne-Nigula",
          displayName: "PÃµÃµsaspea neem",
          habitatCue: "coastal migration bottleneck",
          habitatType: "coastal_open_water",
          habitatScore: 28,
          coastalDistanceKm: 2,
          clusterTightnessKm: 3,
          newestEventDate: "2025-03-10T00:00:00.000Z",
          oldestEventDate: "2023-03-10T00:00:00.000Z",
          source: "GBIF",
          sourceBreakdown: { GBIF: 5 },
        },
      ],
      weather: {
        fetchedAt: "2026-03-30T08:00:00.000Z",
        windSpeedKph: 24,
        windDirectionDeg: 205,
        weatherAvailable: true,
        weatherPartial: false,
      },
      rawResearchPayload: {
        normalizedSources: {
          foreignRecentPoints: [
            {
              lat: 55.34,
              lon: 21.29,
              obsDt: "2026-03-29T08:00:00.000Z",
              locName: "Nemuno delta",
              countryCode: "lt",
              countryName: "Lithuania",
              source: "eBird",
              howMany: 9,
              daysAgo: 2,
              clusterId: "lt-nemuno",
              distanceToEstoniaKm: 265,
            },
            {
              lat: 57.03,
              lon: 23.39,
              obsDt: "2026-03-28T07:00:00.000Z",
              locName: "Lake Kanieris -- Andersalas tornis",
              countryCode: "lv",
              countryName: "Latvia",
              source: "eBird",
              howMany: 2,
              daysAgo: 3,
              clusterId: "lv-kanieris",
              distanceToEstoniaKm: 155,
            },
          ],
          foreignClusters: [
            {
              id: "lt-nemuno",
              lat: 55.34,
              lon: 21.29,
              pointCount: 6,
              newestObsDt: "2026-03-29T08:00:00.000Z",
              oldestObsDt: "2026-03-28T08:00:00.000Z",
              freshestDaysAgo: 2,
              averageDaysAgo: 2,
              totalHowMany: 18,
              countries: ["Lithuania"],
              countryCodes: ["lt"],
              locNames: ["Nemuno delta"],
              nearestDistanceKm: 265,
              isFreshest: true,
            },
            {
              id: "lv-kanieris",
              lat: 57.03,
              lon: 23.39,
              pointCount: 2,
              newestObsDt: "2026-03-28T07:00:00.000Z",
              oldestObsDt: "2026-03-28T07:00:00.000Z",
              freshestDaysAgo: 3,
              averageDaysAgo: 3,
              totalHowMany: 2,
              countries: ["Latvia"],
              countryCodes: ["lv"],
              locNames: ["Lake Kanieris -- Andersalas tornis"],
              nearestDistanceKm: 155,
              isFreshest: false,
            },
          ],
        },
      },
    }), "test_lt_origin_selected_over_lv");

    const selectedOrigin = finalized.selectedForeignOrigin as Record<string, unknown>;
    const target = (finalized.predictedTargets as Array<Record<string, unknown>>)[0];
    const eta = target.migrationEta as Record<string, unknown>;
    const route = ((eta.migrationRoute as Record<string, unknown>)?.route || []) as Array<Record<string, unknown>>;
    const vectors = finalized.predictionVectors as Array<Record<string, unknown>>;

    expect(String(selectedOrigin.countryCode)).toBe("LT");
    expect(String(selectedOrigin.locality)).toBe("Nemuno delta");
    expect(String(eta.fromCountry)).toBe("LT");
    expect(String(eta.fromLocality)).toBe("Nemuno delta");
    expect(String(route[0]?.name)).toBe("Nemuno delta");
    expect(Number(route[0]?.lat)).toBeCloseTo(55.34, 2);
    expect(Number(route[0]?.lon)).toBeCloseTo(21.29, 2);
    expect(Number((vectors[0]?.points as Array<Record<string, unknown>>)[0]?.lat)).toBeCloseTo(55.34, 2);
    expect(Number((vectors[0]?.points as Array<Record<string, unknown>>)[0]?.lon)).toBeCloseTo(21.29, 2);
    expect((finalized.foreignRecentPoints as Array<Record<string, unknown>>)[0]?.countryCode).toBe("lt");
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.countries).toEqual(["Lithuania"]);
  });

  it("recomputes top-level foreign-derived fields from canonical normalized evidence", () => {
    const finalized = hooks.finalizePredictionResponse(buildBaseResponse({
      speciesName: "Punanokk-vart",
      hasUsableForeignPressure: true,
      sourceHealth: {
        ebirdAvailable: true,
        primarySourceUsed: "eBird foreign",
      },
      foreignRecentPoints: [],
      foreignClusters: [
        {
          id: "placeholder",
          lat: 57.9,
          lon: 23.3,
          pointCount: 1,
          newestObsDt: "2026-03-30T10:00:00.000Z",
          oldestObsDt: "2026-03-30T10:00:00.000Z",
          freshestDaysAgo: 1,
          averageDaysAgo: 1,
          totalHowMany: 0,
          countries: [],
          countryCodes: [],
          locNames: [],
          nearestDistanceKm: 0,
          isFreshest: false,
        },
      ],
      externalPressureScore: 0,
      routeVector: "Unavailable",
      bestEntryZone: "Unavailable",
      countryScores: {
        latvia: 0,
        lithuania: 0,
        belarus: 0,
        poland: 0,
        russia: 0,
        finlandContextOnly: 0,
      },
      evidenceSummary: {
        totalForeignRecentPoints: 0,
        primaryCountries: [],
      },
      predictedTargets: [
        {
          rank: 1,
          name: "Põõsaspea neem",
          countyOrParish: "Lääne-Nigula",
          entryCorridorLabel: "Põõsaspea neem",
          lat: 59.2054,
          lon: 23.5164,
          confidence: 0.74,
          eta: "2d",
          searchRadiusKm: 10,
          habitatCue: "coastal migration bottleneck",
          reason: "Canonical target",
        },
      ],
      rawResearchPayload: {
        normalizedSources: {
          foreignRecentPoints: [
            {
              lat: 54.35,
              lon: 18.68,
              obsDt: "2026-03-30T06:00:00.000Z",
              locName: "Mikoszewo",
              countryCode: "pl",
              countryName: "Poland",
              source: "eBird",
              daysAgo: 1,
              distanceToEstoniaKm: 420,
            },
            {
              lat: 55.72,
              lon: 21.1,
              obsDt: "2026-03-30T07:00:00.000Z",
              locName: "Klaipeda coast",
              countryCode: "lt",
              countryName: "Lithuania",
              source: "eBird",
              daysAgo: 1,
              distanceToEstoniaKm: 260,
            },
            {
              lat: 57.86,
              lon: 23.22,
              obsDt: "2026-03-30T08:00:00.000Z",
              locName: "Kolkasrags",
              countryCode: "lv",
              countryName: "Latvia",
              source: "eBird",
              daysAgo: 1,
              distanceToEstoniaKm: 70,
            },
          ],
          foreignClusters: [
            {
              id: "pl-source",
              lat: 54.35,
              lon: 18.68,
              pointCount: 5,
              newestObsDt: "2026-03-30T06:00:00.000Z",
              oldestObsDt: "2026-03-29T06:00:00.000Z",
              freshestDaysAgo: 1,
              averageDaysAgo: 1.1,
              totalHowMany: 18,
              countries: ["Poland"],
              countryCodes: ["pl"],
              locNames: ["Mikoszewo"],
              nearestDistanceKm: 420,
              isFreshest: true,
            },
            {
              id: "lt-mid",
              lat: 55.72,
              lon: 21.1,
              pointCount: 2,
              newestObsDt: "2026-03-30T07:00:00.000Z",
              oldestObsDt: "2026-03-30T07:00:00.000Z",
              freshestDaysAgo: 1,
              averageDaysAgo: 1,
              totalHowMany: 5,
              countries: ["Lithuania"],
              countryCodes: ["lt"],
              locNames: ["Klaipeda coast"],
              nearestDistanceKm: 260,
              isFreshest: false,
            },
            {
              id: "lv-corridor",
              lat: 57.86,
              lon: 23.22,
              pointCount: 1,
              newestObsDt: "2026-03-30T08:00:00.000Z",
              oldestObsDt: "2026-03-30T08:00:00.000Z",
              freshestDaysAgo: 1,
              averageDaysAgo: 1,
              totalHowMany: 1,
              countries: ["Latvia"],
              countryCodes: ["lv"],
              locNames: ["Kolkasrags"],
              nearestDistanceKm: 70,
              isFreshest: false,
            },
          ],
          weather: {
            fetchedAt: "2026-03-30T10:00:00.000Z",
            windSpeedKph: 24,
            windDirectionDeg: 205,
            weatherAvailable: true,
            weatherPartial: false,
            source: "Open-Meteo",
          },
        },
      },
    }), "test_canonical_foreign_serialization");

    expect((finalized.foreignRecentPoints as Array<Record<string, unknown>>).length).toBe(3);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.countries).toEqual(["Poland"]);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.countryCodes).toEqual(["pl"]);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.totalHowMany).toBe(18);
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.locality).toBe("Mikoszewo");
    expect((finalized.foreignClusters as Array<Record<string, unknown>>)[0]?.source).toBe("eBird");
    expect((finalized.foreignClusters as Array<Record<string, unknown>>).some((cluster) => String(cluster.id) === "placeholder")).toBe(false);
    expect(Number(finalized.externalPressureScore)).toBeGreaterThan(0);
    expect((finalized.countryScores as Record<string, unknown>).poland).toBeGreaterThan(0);
    expect((finalized.countryScores as Record<string, unknown>).lithuania).toBeGreaterThan(0);
    expect((finalized.countryScores as Record<string, unknown>).latvia).toBeGreaterThan(0);
    expect(String(finalized.routeVector)).not.toBe("Unavailable");
    expect(String(finalized.bestEntryZone)).not.toBe("Unavailable");
    expect((finalized.evidenceSummary as Record<string, unknown>).totalForeignRecentPoints).toBe(3);
    expect((finalized.evidenceSummary as Record<string, unknown>).primaryCountries).toEqual(["Poland", "Lithuania", "Latvia"]);
  });

  it("detects placeholder foreign clusters only when they lack real foreign evidence fields", () => {
    expect(hooks.hasNonPlaceholderForeignClusters([
      {
        countries: [],
        countryCodes: [],
        locNames: [],
        totalHowMany: 0,
        pointCount: 1,
        nearestDistanceKm: 0,
      },
    ])).toBe(false);

    expect(hooks.hasNonPlaceholderForeignClusters([
      {
        countries: ["Poland"],
        countryCodes: ["pl"],
        locNames: ["Mikoszewo"],
        totalHowMany: 18,
        pointCount: 5,
        nearestDistanceKm: 420,
      },
    ])).toBe(true);
  });
});
