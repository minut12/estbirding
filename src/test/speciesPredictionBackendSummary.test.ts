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
  buildFinalPredictionPayloadFromEvidence: (
    payload: Record<string, unknown>,
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
  buildFinalPredictionPayloadFromEvidence,
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
      normalizedSources: {},
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

  it("canonicalizes route endpoints to the selected target and truncates at that target", () => {
    const response = buildBaseResponse({
      predictedTargets: [
        {
          rank: 1,
          name: "Põõsaspea neem",
          lat: 59.2,
          lon: 23.52,
          migrationEta: {
            entryZone: "Sõrve (S Saaremaa)",
            entryLat: 57.91,
            entryLon: 22.05,
            targetName: "Wrong destination",
            targetLat: 57.91,
            targetLon: 22.05,
            migrationRoute: {
              route: [
                { lat: 54.4, lon: 18.7, name: "Poland origin", type: "origin" },
                { lat: 57.91, lon: 22.05, name: "Sõrve (S Saaremaa)", type: "destination" },
                { lat: 58.4, lon: 21.8, name: "Offshore helper", type: "waypoint" },
              ],
            },
          },
        },
      ],
      topPredictedPoints: [
        {
          rank: 1,
          name: "Põõsaspea neem",
          lat: 59.2,
          lon: 23.52,
          migrationEta: {
            entryZone: "Sõrve (S Saaremaa)",
            entryLat: 57.91,
            entryLon: 22.05,
            targetName: "Wrong destination",
            targetLat: 57.91,
            targetLon: 22.05,
            migrationRoute: {
              route: [
                { lat: 54.4, lon: 18.7, name: "Poland origin", type: "origin" },
                { lat: 57.91, lon: 22.05, name: "Sõrve (S Saaremaa)", type: "destination" },
                { lat: 58.4, lon: 21.8, name: "Offshore helper", type: "waypoint" },
              ],
            },
          },
        },
      ],
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_route_target_alignment");
    const target = (finalized.predictedTargets as Record<string, unknown>[])[0];
    const migrationEta = target.migrationEta as Record<string, unknown>;
    const route = ((migrationEta.migrationRoute as Record<string, unknown>).route as Record<string, unknown>[]);

    expect(migrationEta.targetName).toBe("Põõsaspea neem");
    expect(migrationEta.targetLat).toBe(59.2);
    expect(migrationEta.targetLon).toBe(23.52);
    expect(route[route.length - 1]?.name).toBe("Põõsaspea neem");
    expect(route[route.length - 1]?.lat).toBe(59.2);
    expect(route[route.length - 1]?.lon).toBe(23.52);
    expect(route.some((point) => String(point.name) === "Offshore helper")).toBe(false);
  });

  it("promotes canonical normalized foreign evidence into top-level payload fields", () => {
    const finalized = hooks.buildFinalPredictionPayloadFromEvidence(buildBaseResponse({
      payloadSourceState: "current_finalized_backend_output",
      foreignRecentPoints: [],
      foreignClusters: [{ id: "", pointCount: 0 }],
      foreignEvidence: [],
      hasUsableForeignPressure: true,
      rawResearchPayload: {
        normalizedSources: {
          foreignRecentPoints: [{ countryCode: "PL", lat: 54.3, lon: 18.6, daysAgo: 2, recordCount: 3 }],
          foreignClusters: [{ id: "cluster-1", countries: ["Poland"], countryCodes: ["pl"], nearestDistanceKm: 180, pointCount: 3 }],
        },
        foreignEvidence: [{ countryCode: "pl", countryName: "Poland", recordCount7d: 3, recordCount30d: 3, nearestDistanceKm: 180 }],
      },
    }));

    expect(Array.isArray(finalized.foreignRecentPoints)).toBe(true);
    expect((finalized.foreignRecentPoints as unknown[]).length).toBe(1);
    expect((finalized.foreignClusters as unknown[])[0]).toMatchObject({ id: "cluster-1" });
    expect((finalized.countryScores as Record<string, unknown>).poland).toBeGreaterThan(0);
    expect(Number(finalized.externalPressureScore)).toBeGreaterThan(0);
  });

  it("uses recent elurikkus records ahead of stale latestEstoniaDate", () => {
    const finalized = hooks.buildFinalPredictionPayloadFromEvidence(buildBaseResponse({
      estoniaEvidence: {
        recentCount7d: 1,
        recentCount30d: 2,
        latestEstoniaDate: "2025-11-19",
      },
      elurikkusRecentRecords: [
        { locality: "Ristna", event_date: "2026-03-27", coordinates: { lat: 58.93, lon: 22.05 } },
      ],
      rawResearchPayload: {
        estoniaEvidence: {
          latestEEDate: "2026-03-26",
          latestEELocality: "Kalana",
        },
        normalizedSources: {},
      },
    }));

    expect(String((finalized.estoniaEvidence as Record<string, unknown>).latestEstoniaDate)).toContain("2026-03-27");
  });

  it("keeps weather flags and guardrail reason internally consistent", () => {
    const finalized = hooks.buildFinalPredictionPayloadFromEvidence(buildBaseResponse({
      weather: {
        fetchedAt: "2026-03-30T10:00:00.000Z",
        windSpeedKph: 1,
        windDirectionDeg: 210,
        weatherAvailable: true,
      },
      evidenceSummary: {
        weatherAvailable: false,
      },
      summaryGuardrailReason: "weatherLooksSupportive",
      foreignRecentPoints: [],
      foreignClusters: [],
      predictedTargets: [],
    }));

    expect((finalized.weather as Record<string, unknown>).weatherAvailable).toBe((finalized.evidenceSummary as Record<string, unknown>).weatherAvailable);
    expect(String(finalized.summaryGuardrailReason || "")).not.toContain("weatherLooksSupportive");
  });

  it("suppresses active foreign migration routes when the species is already present", () => {
    const response = buildBaseResponse({
      estoniaEvidence: {
        recentCount7d: 1,
        recentCount30d: 1,
        latestEstoniaLocality: "Ristna",
        freshestLocalities: ["Ristna"],
        alreadyPresent: true,
      },
      predictedTargets: [
        {
          rank: 1,
          name: "Põõsaspea neem",
          lat: 59.2,
          lon: 23.52,
          migrationEta: {
            targetName: "Põõsaspea neem",
            targetLat: 59.2,
            targetLon: 23.52,
            migrationRoute: {
              route: [
                { lat: 54.4, lon: 18.7, name: "Poland origin", type: "origin" },
                { lat: 59.2, lon: 23.52, name: "Põõsaspea neem", type: "destination" },
              ],
            },
          },
        },
      ],
      topPredictedPoints: [
        {
          rank: 1,
          name: "Põõsaspea neem",
          lat: 59.2,
          lon: 23.52,
          migrationEta: {
            targetName: "Põõsaspea neem",
            targetLat: 59.2,
            targetLon: 23.52,
            migrationRoute: {
              route: [
                { lat: 54.4, lon: 18.7, name: "Poland origin", type: "origin" },
                { lat: 59.2, lon: 23.52, name: "Põõsaspea neem", type: "destination" },
              ],
            },
          },
        },
      ],
      globalMigrationEtas: [
        {
          targetName: "Põõsaspea neem",
          targetLat: 59.2,
          targetLon: 23.52,
          migrationRoute: {
            route: [
              { lat: 54.4, lon: 18.7, name: "Poland origin", type: "origin" },
              { lat: 59.2, lon: 23.52, name: "Põõsaspea neem", type: "destination" },
            ],
          },
        },
      ],
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_already_present_route_suppression");
    expect(((finalized.predictedTargets as Record<string, unknown>[])[0]?.migrationEta ?? null)).toBeNull();
    expect(Array.isArray(finalized.globalMigrationEtas) ? finalized.globalMigrationEtas : []).toEqual([]);
    expect((((finalized.rawResearchPayload as Record<string, unknown>).globalMigrationEtas as unknown[]) ?? [])).toEqual([]);
  });

  it("promotes canonical foreign recent points from normalized sources into top-level finalized fields", () => {
    const response = buildBaseResponse({
      foreignRecentPoints: [],
      rawResearchPayload: {
        aiSummary: "stale legacy summary",
        normalizedSources: {
          foreignRecentPoints: [
            { countryCode: "PL", countryName: "Poland", lat: 54.4, lon: 18.7, daysAgo: 1 },
          ],
          foreignClusters: [
            { countries: ["Poland"], lat: 54.4, lon: 18.7 },
          ],
        },
      },
      sourceHealth: {
        ebirdAvailable: true,
        primarySourceUsed: "eBird foreign",
      },
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_foreign_promotion");
    expect(Array.isArray(finalized.foreignRecentPoints) ? finalized.foreignRecentPoints : []).toHaveLength(1);
    expect(Array.isArray((((finalized.rawResearchPayload as Record<string, unknown>).normalizedSources as Record<string, unknown>).foreignRecentPoints)) ? (((finalized.rawResearchPayload as Record<string, unknown>).normalizedSources as Record<string, unknown>).foreignRecentPoints as unknown[]) : []).toHaveLength(1);
  });

  it("derives an approximate fresh Estonia anchor when the freshest recent record lacks coordinates", () => {
    const response = buildBaseResponse({
      estoniaEvidence: {
        recentCount7d: 1,
        recentCount30d: 1,
        latestEstoniaLocality: "Old GBIF place",
        latestEstoniaLat: 57.5,
        latestEstoniaLon: 21.9,
        freshestLocalities: ["Kalana"],
        alreadyPresent: true,
      },
      elurikkusRecentRecords: [
        { locality: "Kalana", event_date: "2026-03-27" },
      ],
      predictedTargets: [
        { rank: 1, name: "Kalana", lat: 58.987, lon: 22.469 },
      ],
      topPredictedPoints: [
        { rank: 1, name: "Kalana", lat: 58.987, lon: 22.469 },
      ],
    });

    const finalized = hooks.finalizePredictionResponse(response, "test_approximate_anchor");
    const estoniaEvidence = finalized.estoniaEvidence as Record<string, unknown>;
    expect(estoniaEvidence.latestEstoniaLocality).toBe("Kalana");
    expect(estoniaEvidence.latestEstoniaLat).toBe(58.987);
    expect(estoniaEvidence.latestEstoniaLon).toBe(22.469);
    expect(estoniaEvidence.latestEstoniaCoordinateApproximate).toBe(true);
  });
});
