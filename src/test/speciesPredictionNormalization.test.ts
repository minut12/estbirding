import { describe, expect, it } from "vitest";

import { normalizeSpeciesPredictionResult } from "@/lib/speciesPrediction";

describe("normalizeSpeciesPredictionResult", () => {
  it("prefers canonical fields over legacy aliases", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-17T12:00:00.000Z",
      insightSummary: "Canonical summary",
      externalPressureScore: 11,
      countryScores: { latvia: 1, lithuania: 54, belarus: 2, poland: 3, russia: 4 },
      topPredictedPoints: [
        { rank: 1, name: "Canonical Point", countyOrParish: "County", lat: 58, lon: 26, confidence: 0.81, eta: "Now", searchRadiusKm: 5, habitatCue: "Cue", reason: "Canonical reason" },
      ],
    } as any, "Test Species", "linnuliigid");

    expect(result.insightSummary).toBe("Canonical summary");
    expect(result.externalPressureScore).toBe(11);
    expect(result.countryScores.lithuania).toBe(54);
    expect(result.topPredictedPoints[0]?.reason).toBe("Canonical reason");
  });

  it("uses legacy aliases only when canonical fields are absent", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-17T12:00:00.000Z",
    } as any, "Test Species", "linnuliigid");

    // With no canonical or legacy fields, defaults apply
    expect(result.externalPressureScore).toBe(0);
    expect(result.countryScores.lithuania).toBe(0);
  });

  it("does not replace canonical country scores or points from nested fallback payloads", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-17T12:00:00.000Z",
      countryScores: { latvia: 1, lithuania: 54, belarus: 2, poland: 3, russia: 4 },
      topPredictedPoints: [
        { rank: 1, name: "Canonical Point", countyOrParish: "County", lat: 58, lon: 26, confidence: 0.81, eta: "Now", searchRadiusKm: 5, habitatCue: "Cue", reason: "Canonical reason" },
      ],
      rawResearchPayload: {
        openAIAnalysisInput: {
          countryScores: { lithuania: 48 },
        },
      },
      openaiAnalysis: {
        analysisVersion: "v1",
        insightSummary: "Nested summary",
        consistencyChecks: {
          routeLooksPlausible: true,
          timingLooksPlausible: true,
          weatherLooksSupportive: true,
          foreignPressureMatchesNarrative: true,
        },
        rerankedTopPredictedPoints: [
          { rank: 1, name: "Nested Point", countyOrParish: "County", lat: 58, lon: 26, confidence: 0.33, eta: "Later", searchRadiusKm: 5, habitatCue: "Cue", reason: "Nested reason" },
        ],
      },
    } as any, "Test Species", "linnuliigid");

    expect(result.countryScores.lithuania).toBe(54);
    expect(result.topPredictedPoints[0]?.reason).toBe("Canonical reason");
  });

  it("normalizes map-first evidence payload fields", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-17T12:00:00.000Z",
      estoniaHistoryPoints: [
        { lat: 58.5, lon: 24.5, eventDate: "2026-03-10T00:00:00.000Z", ageClass: "recent", source: "GBIF" },
      ],
      foreignRecentPoints: [
        { lat: 57.9, lon: 24.1, obsDt: "2026-03-16T00:00:00.000Z", locName: "Coast", countryCode: "lv", countryName: "Latvia", source: "eBird", daysAgo: 1 },
      ],
      foreignClusters: [
        { id: "cluster-1", lat: 57.9, lon: 24.1, pointCount: 2, newestObsDt: "2026-03-16T00:00:00.000Z", oldestObsDt: "2026-03-15T00:00:00.000Z", freshestDaysAgo: 1, averageDaysAgo: 1.5, totalHowMany: 4, countries: ["Latvia"], countryCodes: ["lv"], locNames: ["Coast"], nearestDistanceKm: 90, isFreshest: true },
      ],
      weather: { fetchedAt: "2026-03-17T12:00:00.000Z", windSpeedKph: 22, windDirectionDeg: 210, windDirectionLabel: "SW", source: "Open-Meteo" },
      predictionVectors: [
        { id: "v1", kind: "route", confidence: 78, bearingDeg: 25, distanceKm: 140, points: [{ lat: 57.9, lon: 24.1 }, { lat: 58.5, lon: 24.5 }] },
      ],
      predictedTargets: [
        { rank: 1, name: "Target", countyOrParish: "County", lat: 58.5, lon: 24.5, confidence: 81, eta: "1d", searchRadiusKm: 12, habitatCue: "History", reason: "Evidence-based target" },
      ],
      mapLayers: { estoniaHistory: true, foreignEvidence: true, predictedLines: true, predictedCone: true, predictedTargets: true, recentOnly: false },
    } as any, "Test Species", "linnuliigid");

    expect(result.estoniaHistoryPoints?.length).toBe(1);
    expect(result.foreignRecentPoints?.length).toBe(1);
    expect(result.foreignClusters?.[0]?.id).toBe("cluster-1");
    expect(result.weather?.windDirectionLabel).toBe("SW");
    expect(result.predictionVectors?.[0]?.kind).toBe("route");
    expect(result.predictedTargets?.[0]?.reason).toBe("Evidence-based target");
  });
});
