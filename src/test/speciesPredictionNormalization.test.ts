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
      estoniaHistoryClusters: [
        { id: "ee-cluster-1", lat: 58.5, lon: 24.5, count: 3, recentCount: 1, newestEventDate: "2026-03-10T00:00:00.000Z", oldestEventDate: "2024-03-10T00:00:00.000Z", locality: "Coast", municipality: "County", displayName: "Põõsaspea / Spithami", representativeLat: 58.51, representativeLon: 24.49, representativePointMethod: "medoid", habitatCue: "coastal migration bottleneck", source: "GBIF", sourceBreakdown: { GBIF: 3 } },
      ],
      foreignRecentPoints: [
        { lat: 57.9, lon: 24.1, obsDt: "2026-03-16T00:00:00.000Z", locName: "Coast", countryCode: "lv", countryName: "Latvia", source: "eBird", daysAgo: 1 },
      ],
      foreignClusters: [
        { id: "cluster-1", lat: 57.9, lon: 24.1, pointCount: 2, newestObsDt: "2026-03-16T00:00:00.000Z", oldestObsDt: "2026-03-15T00:00:00.000Z", freshestDaysAgo: 1, averageDaysAgo: 1.5, totalHowMany: 4, countries: ["Latvia"], countryCodes: ["lv"], locNames: ["Coast"], nearestDistanceKm: 90, isFreshest: true },
      ],
      weather: { fetchedAt: "2026-03-17T12:00:00.000Z", windSpeedKph: 22, windDirectionDeg: 210, windDirectionLabel: "SW", weatherAvailable: true, weatherPartial: false, wasWeatherUsedInRanking: true, source: "Open-Meteo" },
      predictionVectors: [
        { id: "v1", kind: "route", confidence: 78, bearingDeg: 25, distanceKm: 140, points: [{ lat: 57.9, lon: 24.1 }, { lat: 58.5, lon: 24.5 }] },
      ],
      evidenceSummary: { dataSourcesUsed: ["Elurikkus", "eBird foreign", "Open-Meteo weather"], activeEvidenceUsed: ["Elurikkus", "eBird foreign", "Open-Meteo weather"], attemptedButNotUsed: [], foreignEbirdAvailable: true, weatherAvailable: true, weatherPartial: false, wasWeatherUsedInRanking: true, rankingMode: "estonia_history_plus_foreign_plus_weather", summaryText: "Evidence-first summary" },
      predictedTargets: [
        { rank: 1, name: "Target", displayName: "Põõsaspea / Spithami", countyOrParish: "County", displayCountyOrParish: "Lääne-Nigula", lat: 58.51, lon: 24.49, confidence: 0.65, eta: "1d", searchRadiusKm: 12, habitatCue: "History", reason: "Evidence-based target", rankingMode: "estonia_history_only", derivedFromClusterId: "ee-cluster-1", supportingEstoniaHistoryCount: 3, latestSupportingEstoniaDate: "2026-03-10T00:00:00.000Z", windAdjusted: true, representativePointMethod: "medoid", sourceType: "estonia_history_cluster", supportingPointCount: 3, usedForeignPressure: false, habitatFilterAdjustedRanking: true, vectorsSuppressed: true },
      ],
      mapLayers: { estoniaHistory: true, estoniaHistoryPoints: true, estoniaHistoryClusters: true, foreignEvidence: true, foreignRecentPoints: true, foreignPressureClusters: true, predictedLines: true, predictedCone: true, predictedTargets: true, diagnostics: true, recentOnly: false },
    } as any, "Test Species", "linnuliigid");

    expect(result.evidenceSummary?.rankingMode).toBe("estonia_history_plus_foreign_plus_weather");
    expect(result.evidenceSummary?.wasWeatherUsedInRanking).toBe(true);
    expect(result.estoniaHistoryPoints?.length).toBe(1);
    expect(result.estoniaHistoryClusters?.[0]?.id).toBe("ee-cluster-1");
    expect(result.estoniaHistoryClusters?.[0]?.displayName).toBe("Põõsaspea / Spithami");
    expect(result.estoniaHistoryClusters?.[0]?.representativePointMethod).toBe("medoid");
    expect(result.foreignRecentPoints?.length).toBe(1);
    expect(result.foreignClusters?.[0]?.id).toBe("cluster-1");
    expect(result.weather?.windDirectionLabel).toBe("SW");
    expect(result.weather?.weatherAvailable).toBe(true);
    expect(result.predictionVectors?.[0]?.kind).toBe("route");
    expect(result.predictedTargets?.[0]?.reason).toBe("Evidence-based target");
    expect(result.predictedTargets?.[0]?.displayName).toBe("Põõsaspea / Spithami");
    expect(result.predictedTargets?.[0]?.representativePointMethod).toBe("medoid");
    expect(result.predictedTargets?.[0]?.sourceType).toBe("estonia_history_cluster");
    expect(result.predictedTargets?.[0]?.rankingMode).toBe("estonia_history_only");
    expect(result.predictedTargets?.[0]?.vectorsSuppressed).toBe(true);
    expect(result.predictedTargets?.[0]?.derivedFromClusterId).toBe("ee-cluster-1");
    expect(result.predictedTargets?.[0]?.supportingEstoniaHistoryCount).toBe(3);
    expect(result.predictedTargets?.[0]?.windAdjusted).toBe(true);
    expect(result.mapLayers?.diagnostics).toBe(true);
  });

  it("normalizes honesty-oriented predicted target metadata", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-17T12:00:00.000Z",
      weather: {
        fetchedAt: "",
        windSpeedKph: 0,
        windDirectionDeg: 0,
        windDirectionLabel: "",
        weatherAvailable: false,
        weatherPartial: true,
        wasWeatherUsedInRanking: false,
        error: "weather fetch failed",
        source: "Open-Meteo",
      },
      evidenceSummary: {
        activeEvidenceUsed: ["GBIF Estonia"],
        attemptedButNotUsed: ["eBird foreign", "Open-Meteo weather"],
        foreignEbirdAvailable: false,
        weatherAvailable: false,
        weatherPartial: true,
        wasWeatherUsedInRanking: false,
        rankingMode: "estonia_history_only",
      },
      predictedTargets: [
        {
          rank: 1,
          name: "Unnamed coastal history cluster",
          displayName: "Unnamed coastal history cluster",
          displayNameSource: "fallback_label",
          countyOrParish: "Lääne",
          lat: 58.9,
          lon: 23.5,
          confidence: 0.7,
          eta: "2d",
          searchRadiusKm: 10,
          habitatCue: "coastal_open_water",
          reason: "Repeated spring records around a coastal migration corridor.",
          rankingMode: "estonia_history_only",
          representativePointMethod: "hotspot_coordinate",
          coordinateSource: "hotspot_coordinate",
          rawClusterId: "ee-cluster-2",
          habitatFitScore: 30,
          historySupportScore: 42,
          foreignSupportScore: 0,
          weatherSupportScore: 0,
          confidenceBeforeCap: 0.82,
          confidenceAfterCap: 0.7,
        },
      ],
    } as any, "Test Species", "linnuliigid");

    expect(result.weather?.weatherPartial).toBe(true);
    expect(result.evidenceSummary?.rankingMode).toBe("estonia_history_only");
    expect(result.predictedTargets?.[0]?.displayNameSource).toBe("fallback_label");
    expect(result.predictedTargets?.[0]?.coordinateSource).toBe("hotspot_coordinate");
    expect(result.predictedTargets?.[0]?.rawClusterId).toBe("ee-cluster-2");
    expect(result.predictedTargets?.[0]?.habitatFitScore).toBe(30);
    expect(result.predictedTargets?.[0]?.historySupportScore).toBe(42);
    expect(result.predictedTargets?.[0]?.confidenceBeforeCap).toBe(0.82);
    expect(result.predictedTargets?.[0]?.confidenceAfterCap).toBe(0.7);
  });

  it("normalizes available sources separately from active evidence", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-18T12:00:00.000Z",
      evidenceSummary: {
        dataSourcesUsed: ["GBIF Estonia", "Open-Meteo weather"],
        availableSources: ["GBIF Estonia", "Open-Meteo weather"],
        activeEvidenceUsed: ["GBIF Estonia"],
        attemptedButNotUsed: ["eBird foreign", "Open-Meteo weather"],
        foreignEbirdAvailable: false,
        weatherAvailable: false,
        weatherPartial: true,
        wasWeatherUsedInRanking: false,
        rankingMode: "estonia_history_only",
      },
    } as any, "Test Species", "linnuliigid");

    expect(result.evidenceSummary?.availableSources).toEqual(["GBIF Estonia", "Open-Meteo weather"]);
    expect(result.evidenceSummary?.activeEvidenceUsed).toEqual(["GBIF Estonia"]);
    expect(result.evidenceSummary?.attemptedButNotUsed).toEqual(["eBird foreign", "Open-Meteo weather"]);
  });

  it("preserves confidence cap metadata and coordinate source fields for predicted targets", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-18T12:00:00.000Z",
      predictedTargets: [
        {
          rank: 1,
          name: "Põõsaspea",
          displayName: "Põõsaspea",
          displayNameSource: "normalized_locality",
          countyOrParish: "Lääne-Nigula",
          lat: 58.9,
          lon: 23.5,
          confidence: 0.7,
          eta: "2d",
          searchRadiusKm: 12,
          habitatCue: "coastal corridor",
          reason: "Repeated spring records around Põõsaspea.",
          rankingMode: "estonia_history_only",
          representativePointMethod: "medoid",
          coordinateSource: "medoid",
          rawClusterId: "ee-cluster-4",
          habitatFitScore: 34,
          historySupportScore: 51,
          foreignSupportScore: 0,
          weatherSupportScore: 0,
          confidenceBeforeCap: 0.86,
          confidenceAfterCap: 0.7,
        },
      ],
    } as any, "Test Species", "linnuliigid");

    expect(result.predictedTargets?.[0]?.displayName).toBe("Põõsaspea");
    expect(result.predictedTargets?.[0]?.displayNameSource).toBe("normalized_locality");
    expect(result.predictedTargets?.[0]?.coordinateSource).toBe("medoid");
    expect(result.predictedTargets?.[0]?.confidenceBeforeCap).toBe(0.86);
    expect(result.predictedTargets?.[0]?.confidenceAfterCap).toBe(0.7);
  });
});
