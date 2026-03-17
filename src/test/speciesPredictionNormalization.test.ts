import { describe, expect, it } from "vitest";

import { normalizeSpeciesPredictionResult } from "@/lib/speciesPrediction";

describe("normalizeSpeciesPredictionResult", () => {
  it("prefers canonical fields over legacy aliases", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-17T12:00:00.000Z",
      insightSummary: "Canonical summary",
      summary: "Legacy summary",
      externalPressureScore: 11,
      pressureScore: 10,
      countryScores: { latvia: 1, lithuania: 54, belarus: 2, poland: 3, russia: 4 },
      countryScoreMap: { lithuania: 48 },
      topPredictedPoints: [
        { rank: 1, name: "Canonical Point", countyOrParish: "County", lat: 58, lon: 26, confidence: 0.81, eta: "Now", searchRadiusKm: 5, habitatCue: "Cue", reason: "Canonical reason" },
      ],
      candidates: [
        { rank: 1, name: "Legacy Point", countyOrParish: "County", lat: 58, lon: 26, confidence: 0.2, eta: "Later", searchRadiusKm: 5, habitatCue: "Cue", reason: "Legacy reason" },
      ],
    }, "Test Species", "linnuliigid");

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
      summary: "Legacy summary",
      pressureScore: 10,
      countryScoreMap: { latvia: 1, lithuania: 48, belarus: 2, poland: 3, russia: 4 },
      candidates: [
        { rank: 1, name: "Legacy Point", countyOrParish: "County", lat: 58, lon: 26, confidence: 0.2, eta: "Later", searchRadiusKm: 5, habitatCue: "Cue", reason: "Legacy reason" },
      ],
    }, "Test Species", "linnuliigid");

    expect(result.insightSummary).toBe("Legacy summary");
    expect(result.externalPressureScore).toBe(10);
    expect(result.countryScores.lithuania).toBe(48);
    expect(result.topPredictedPoints[0]?.reason).toBe("Legacy reason");
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
        rerankedTopPredictedPoints: [
          { rank: 1, name: "Nested Point", countyOrParish: "County", lat: 58, lon: 26, confidence: 0.33, eta: "Later", searchRadiusKm: 5, habitatCue: "Cue", reason: "Nested reason" },
        ],
      },
    }, "Test Species", "linnuliigid");

    expect(result.countryScores.lithuania).toBe(54);
    expect(result.topPredictedPoints[0]?.reason).toBe("Canonical reason");
  });
});
