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
});
