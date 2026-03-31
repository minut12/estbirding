import { describe, expect, it } from "vitest";

import { buildActiveMigrationDisplayRoute, buildSpeciesPredictionDisplayModel, extractNormalizedMigrationRoutes, hasUsableSpeciesPredictionResult, isAlreadyPresentPrediction, mergeCanonicalEstoniaHotspots, normalizePrediction, normalizeSpeciesPredictionResult, resolveActiveEstoniaAnchor, resolveFreshestEstoniaEvidence, selectPrimaryMigrationRoute } from "@/lib/speciesPrediction";

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

  it("marks weather-only payloads as insufficient and preserves usable-evidence semantics", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punakurk-kaur",
      speciesName: "Punakurk-kaur",
      generatedAt: "2026-03-20T12:00:00.000Z",
      insightSummary: "Usable prediction evidence is currently missing. No recent Estonia records, Estonia history clusters, foreign pressure points, or predicted targets were available in this result. Weather alone is not enough to support a meaningful arrival prediction.",
      confidenceNote: "Confidence is limited because the result is driven by missing usable evidence rather than positive signals.",
      rankingNotes: "Ranking was not supported by usable Estonia recent evidence, Estonia history, or foreign pressure. Weather was available but is insufficient on its own for ranking.",
      warnings: ["No usable recent Estonia evidence", "No usable Estonia history clusters", "No usable foreign pressure", "No predicted targets returned", "Weather alone is insufficient for prediction"],
      evidenceState: "weather_only_insufficient",
      hasUsableRecentEstoniaEvidence: false,
      hasUsableEstoniaHistory: false,
      hasUsableForeignPressure: false,
      hasUsablePredictedTargets: false,
      hasOnlyWeather: true,
      hasOnlySourceAvailabilityWithoutUsableEvidence: true,
      activeEvidenceSources: ["Open-Meteo weather"],
      availableSources: ["EELURIKKUS Estonia", "Open-Meteo weather"],
      attemptedButUnavailable: ["eBird foreign"],
      attemptedButReturnedNoUsableEvidence: ["EELURIKKUS Estonia"],
      effectiveRankingMode: "Weather only (insufficient)",
      summaryGuardrailApplied: true,
      summaryGuardrailReason: "weather_only_insufficient_fallback",
      sourceHealth: {
        elurikkusAvailable: true,
        ebirdAvailable: false,
        gbifAvailable: false,
        gbifFallbackUsed: false,
        primarySourceUsed: "",
        sourceWarnings: [],
      },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        latestEstoniaDate: "",
        latestEstoniaLat: null,
        latestEstoniaLon: null,
        alreadyPresent: false,
        alreadyPassed: false,
      },
      estoniaHistoryPoints: [],
      estoniaHistoryClusters: [],
      foreignRecentPoints: [],
      foreignClusters: [],
      weather: {
        fetchedAt: "2026-03-20T12:00:00.000Z",
        windSpeedKph: 9,
        windDirectionDeg: 220,
        windDirectionLabel: "SW",
        weatherAvailable: true,
        weatherPartial: true,
        wasWeatherUsedInRanking: false,
        source: "Open-Meteo",
      },
      topPredictedPoints: [],
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.evidenceState).toBe("weather_only_insufficient");
    expect(result.hasUsableRecentEstoniaEvidence).toBe(false);
    expect(result.hasUsableEstoniaHistory).toBe(false);
    expect(result.hasUsableForeignPressure).toBe(false);
    expect(result.hasUsablePredictedTargets).toBe(false);
    expect(result.hasOnlyWeather).toBe(true);
    expect(result.activeEvidenceSources).toEqual(["Open-Meteo weather"]);
    expect(result.availableSources).toEqual(["EELURIKKUS Estonia", "Open-Meteo weather"]);
    expect(result.attemptedButUnavailable).toEqual(["eBird foreign"]);
    expect(result.attemptedButReturnedNoUsableEvidence).toEqual(["EELURIKKUS Estonia"]);
    expect(result.effectiveRankingMode).toBe("Weather only (insufficient)");
    expect(result.summaryGuardrailApplied).toBe(true);
    expect(result.summaryGuardrailReason).toBe("weather_only_insufficient_fallback");
    expect(result.insightSummary).toContain("Usable prediction evidence is currently missing");
    expect(result.confidenceNote?.toLowerCase()).not.toContain("immediate likelihood is low");
    expect(result.rankingNotes?.toLowerCase()).not.toContain("ranking is based mainly on estonia evidence");
    expect(result.rankingNotes?.toLowerCase()).not.toContain("estonia history + weather");
  });

  it("preserves recovered nested aiSummary while carrying evidence-state guardrails", () => {
    const result = normalizeSpeciesPredictionResult({
      responseBody: {
        aiSummary: {
          insightSummary: "No usable recent Estonia evidence, Estonia history clusters, or foreign pressure points were available in this payload.",
          confidenceNote: "Low confidence.",
          rankingNotes: "Fresh Estonia evidence: unavailable or empty.",
          warnings: ["Do not treat this as confirmed absence"],
        },
        sourceHealth: {
          elurikkusAvailable: false,
          ebirdAvailable: false,
          gbifAvailable: false,
          gbifFallbackUsed: false,
          primarySourceUsed: "",
          sourceWarnings: [],
        },
        evidenceState: "insufficient",
        hasUsableRecentEstoniaEvidence: false,
        hasUsableEstoniaHistory: false,
        hasUsableForeignPressure: false,
        hasUsablePredictedTargets: false,
        hasOnlyWeather: false,
        hasOnlySourceAvailabilityWithoutUsableEvidence: true,
        activeEvidenceSources: [],
        availableSources: ["EELURIKKUS Estonia"],
        attemptedButUnavailable: ["eBird foreign"],
        attemptedButReturnedNoUsableEvidence: ["EELURIKKUS Estonia"],
        effectiveRankingMode: "Insufficient evidence",
        summaryGuardrailApplied: true,
        summaryGuardrailReason: "insufficient_evidence_fallback,missing_usable_prediction_evidence",
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toContain("No usable recent Estonia evidence");
    expect(result.evidenceState).toBe("insufficient");
    expect(result.summaryGuardrailApplied).toBe(true);
  });

  it("keeps positive-signal evidence state when foreign pressure exists", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-20T12:00:00.000Z",
      evidenceState: "foreign_pressure",
      hasUsableRecentEstoniaEvidence: false,
      hasUsableEstoniaHistory: true,
      hasUsableForeignPressure: true,
      hasUsablePredictedTargets: false,
      hasOnlyWeather: false,
      hasOnlySourceAvailabilityWithoutUsableEvidence: false,
      activeEvidenceSources: ["eBird foreign"],
      availableSources: ["eBird foreign"],
      attemptedButUnavailable: [],
      attemptedButReturnedNoUsableEvidence: [],
      effectiveRankingMode: "Foreign pressure",
      sourceHealth: {
        elurikkusAvailable: true,
        ebirdAvailable: true,
        gbifAvailable: true,
        gbifFallbackUsed: false,
        primarySourceUsed: "eBird foreign",
        sourceWarnings: [],
      },
      foreignClusters: [
        { id: "cluster-1", lat: 57.9, lon: 24.1, pointCount: 2, newestObsDt: "2026-03-16T00:00:00.000Z", oldestObsDt: "2026-03-15T00:00:00.000Z", freshestDaysAgo: 1, averageDaysAgo: 1.5, totalHowMany: 4, countries: ["Latvia"], countryCodes: ["lv"], locNames: ["Coast"], nearestDistanceKm: 90, isFreshest: true },
      ],
      topPredictedPoints: [],
    } as any, "Test Species", "linnuliigid");

    expect(result.evidenceState).toBe("foreign_pressure");
    expect(result.hasUsableForeignPressure).toBe(true);
  });

  it("allows negative-signal only when core sources are available", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-20T12:00:00.000Z",
      evidenceState: "estonia_history",
      hasUsableRecentEstoniaEvidence: false,
      hasUsableEstoniaHistory: true,
      hasUsableForeignPressure: false,
      hasUsablePredictedTargets: false,
      hasOnlyWeather: false,
      hasOnlySourceAvailabilityWithoutUsableEvidence: false,
      activeEvidenceSources: ["GBIF Estonia"],
      availableSources: ["GBIF Estonia"],
      attemptedButUnavailable: [],
      attemptedButReturnedNoUsableEvidence: [],
      effectiveRankingMode: "Estonia history",
      sourceHealth: {
        elurikkusAvailable: true,
        ebirdAvailable: true,
        gbifAvailable: true,
        gbifFallbackUsed: false,
        primarySourceUsed: "GBIF Estonia",
        sourceWarnings: [],
      },
      estoniaHistoryClusters: [
        { id: "ee-cluster-1", lat: 58.5, lon: 24.5, count: 3, recentCount: 0, newestEventDate: "2025-03-10T00:00:00.000Z", oldestEventDate: "2024-03-10T00:00:00.000Z", source: "GBIF" },
      ],
      topPredictedPoints: [],
    } as any, "Test Species", "linnuliigid");

    expect(result.evidenceState).toBe("estonia_history");
    expect(result.hasOnlyWeather).toBe(false);
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

  it("preserves current n8n root evidence fields and array root normalization", () => {
    const result = normalizeSpeciesPredictionResult([
      {
        speciesKey: "punakurk-kaur",
        speciesName: "Punakurk-kaur",
        generatedAt: "2026-03-21T12:00:00.000Z",
        evidenceState: "mixed",
        recentCount7d: 12,
        recentCount30d: 18,
        confidenceNote: "Confidence is moderate because recent Estonia evidence exists.",
        topTarget: {
          rank: 1,
          name: "Sääre",
          countyOrParish: "Saaremaa",
          lat: 57.9054,
          lon: 22.051674,
          confidence: 0.92,
          eta: "24h",
          searchRadiusKm: 5,
          habitatCue: "coastal open water",
          reason: "Best current target",
        },
        sourceHealth: {
          activeEvidenceUsed: ["eElurikkus recent records", "GBIF Estonia history", "eBird foreign pressure", "Open-Meteo weather"],
          primarySourceUsed: "eElurikkus recent records",
          sourceWarnings: [],
          elurikkusAvailable: true,
          ebirdAvailable: true,
          gbifAvailable: true,
          gbifFallbackUsed: false,
        },
        evidenceSummary: {
          recentCount7d: 99,
          recentCount30d: 88,
        },
        weather: {
          observedAt: "2026-03-21T11:45:00.000Z",
          windSpeedKmh: 23,
          windDirectionDeg: 225,
          source: "Open-Meteo",
        },
        elurikkusRecentRecords: [
          {
            id: "older",
            event_datetime_point: "2026-03-20T09:00:00.000Z",
            locality: "Older place",
            hasCoords: true,
            coordinates: { lat: 58.1, lon: 23.1 },
          },
          {
            id: "freshest",
            event_datetime_point: "2026-03-21T10:15:00.000Z",
            locality: "Sääre küla",
            hasCoords: true,
            latitude: 57.9054,
            longitude: 22.051674,
          },
        ],
        hasRecentEstoniaEvidence: true,
        hasForeignPressure: true,
      },
    ] as any, "Punakurk-kaur", "linnuliigid");

    expect(result.evidenceState).toBe("mixed");
    expect(result.recentCount7d).toBe(12);
    expect(result.recentCount30d).toBe(18);
    expect(result.estoniaEvidence?.recentCount7d).toBe(12);
    expect(result.estoniaEvidence?.recentCount30d).toBe(18);
    expect(result.topTarget?.confidence).toBe(0.92);
    expect(result.sourceHealth?.activeEvidenceUsed).toEqual([
      "eElurikkus recent records",
      "GBIF Estonia history",
      "eBird foreign pressure",
      "Open-Meteo weather",
    ]);
    expect(result.weather?.windSpeedKmh).toBe(23);
    expect(result.weather?.windDirectionDeg).toBe(225);
    expect(result.weather?.observedAt).toBe("2026-03-21T11:45:00.000Z");
    expect(result.elurikkusRecentRecords?.[1]?.coordinates).toEqual({ lat: 57.9054, lon: 22.051674 });
    expect(result.hasRecentEstoniaEvidence).toBe(true);
    expect(result.hasForeignPressure).toBe(true);
  });

  it("keeps finalized backend canonical foreign fields authoritative", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punanokk-vart",
      speciesName: "Punanokk-vart",
      generatedAt: "2026-03-31T08:00:00.000Z",
      backendBuild: "2026-03-31-test",
      invokeRouteVersion: "fix20",
      responseProof: "served by live species-prediction invoke route",
      foreignRecentPoints: [
        {
          lat: 57.86,
          lon: 23.21,
          obsDt: "2026-03-30T10:00:00.000Z",
          locName: "Kolkasrags",
          countryCode: "lv",
          countryName: "Latvia",
          source: "eBird",
          daysAgo: 1,
          distanceToEstoniaKm: 69,
        },
      ],
      foreignClusters: [
        {
          id: "lv-cluster-1",
          lat: 57.86,
          lon: 23.21,
          pointCount: 1,
          newestObsDt: "2026-03-30T10:00:00.000Z",
          oldestObsDt: "2026-03-30T10:00:00.000Z",
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
      weather: {
        fetchedAt: "2026-03-30T11:00:00.000Z",
        windSpeedKph: 25,
        windDirectionDeg: 205,
        weatherAvailable: true,
        weatherPartial: false,
        source: "Open-Meteo",
      },
      countryScores: {
        latvia: 16,
        lithuania: 0,
        belarus: 0,
        poland: 0,
        russia: 0,
        finlandContextOnly: 0,
      },
      externalPressureScore: 16,
      evidenceSummary: {
        totalForeignRecentPoints: 0,
        weatherAvailable: false,
        foreignEbirdAvailable: false,
      },
      rawResearchPayload: {
        foreignRecentPoints: [],
        foreignClusters: [
          {
            id: "placeholder",
            lat: 57.86,
            lon: 23.21,
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
            isFreshest: true,
          },
        ],
        weather: {
          fetchedAt: "2026-03-30T11:00:00.000Z",
          windSpeedKph: 12,
          weatherAvailable: false,
        },
      },
    } as any, "Punanokk-vart", "linnuliigid");

    expect(result.foreignRecentPoints?.length).toBe(1);
    expect(result.foreignClusters?.[0]?.countries).toEqual(["Latvia"]);
    expect(result.foreignClusters?.[0]?.totalHowMany).toBe(3);
    expect(result.countryScores.latvia).toBe(16);
    expect(result.externalPressureScore).toBe(16);
    expect(result.evidenceSummary?.totalForeignRecentPoints).toBe(1);
    expect(result.evidenceSummary?.weatherAvailable).toBe(true);
    expect(result.evidenceSummary?.foreignEbirdAvailable).toBe(true);
  });

  it("falls back to normalizedSources foreign evidence when finalized top-level foreign fields are empty or placeholder-like", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punanokk-vart",
      speciesName: "Punanokk-vart",
      generatedAt: "2026-03-31T08:00:00.000Z",
      backendBuild: "2026-03-31-test",
      invokeRouteVersion: "fix20",
      responseProof: "served by live species-prediction invoke route",
      foreignRecentPoints: [],
      foreignClusters: [
        {
          id: "placeholder",
          lat: 57.86,
          lon: 23.21,
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
      weather: {
        fetchedAt: "2026-03-30T11:00:00.000Z",
        windSpeedKph: 25,
        windDirectionDeg: 205,
        weatherAvailable: true,
        weatherPartial: false,
        source: "Open-Meteo",
      },
      countryScores: {
        latvia: 8,
        lithuania: 8,
        belarus: 0,
        poland: 16,
        russia: 0,
        finlandContextOnly: 0,
      },
      externalPressureScore: 24,
      evidenceSummary: {
        totalForeignRecentPoints: 0,
        primaryCountries: [],
        weatherAvailable: false,
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
          ],
        },
      },
    } as any, "Punanokk-vart", "linnuliigid");

    expect(result.foreignRecentPoints?.length).toBe(2);
    expect(result.foreignClusters?.[0]?.countries).toEqual(["Poland"]);
    expect(result.foreignClusters?.[0]?.totalHowMany).toBe(18);
    expect(result.foreignClusters?.[0]?.locality).toBe("Mikoszewo");
    expect(result.foreignClusters?.[0]?.source).toBe("eBird");
    expect(result.externalPressureScore).toBe(24);
    expect(result.countryScores.poland).toBe(16);
    expect(result.countryScores.lithuania).toBe(8);
    expect(result.evidenceSummary?.totalForeignRecentPoints).toBe(2);
    expect(result.evidenceSummary?.primaryCountries).toEqual(["Poland", "Lithuania"]);
    expect(result.evidenceSummary?.weatherAvailable).toBe(true);
  });

  it("preserves canonical selectedForeignOrigin and usable foreign cluster metadata from finalized payloads", () => {
    const payload = {
      speciesKey: "punanokk-vart",
      speciesName: "Punanokk-vart",
      generatedAt: "2026-03-31T08:00:00.000Z",
      selectedForeignOrigin: {
        countryCode: "LT",
        countryName: "Lithuania",
        locality: "Nemuno delta",
        lat: 55.34,
        lon: 21.29,
        obsDate: "2026-03-29T08:00:00.000Z",
        clusterId: "lt-nemuno",
        source: "eBird",
      },
      foreignRecentPoints: [
        {
          lat: 55.34,
          lon: 21.29,
          obsDt: "2026-03-29T08:00:00.000Z",
          locName: "Nemuno delta",
          countryCode: "lt",
          countryName: "Lithuania",
          source: "eBird",
          daysAgo: 2,
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
      ],
      topPredictedPoints: [
        {
          rank: 1,
          name: "PÃµÃµsaspea neem",
          lat: 59.2054,
          lon: 23.5164,
          confidence: 0.74,
          eta: "2d",
          searchRadiusKm: 10,
          habitatCue: "coastal migration bottleneck",
          reason: "Canonical target",
          migrationEta: {
            fromCountry: "LT",
            fromLocality: "Nemuno delta",
            migrationRoute: {
              route: [
                { lat: 55.34, lon: 21.29, name: "Nemuno delta", type: "origin" },
                { lat: 59.2054, lon: 23.5164, name: "PÃµÃµsaspea neem", type: "destination" },
              ],
            },
          },
        },
      ],
    } as any;
    const result = normalizeSpeciesPredictionResult(payload, "Punanokk-vart", "linnuliigid");
    const routes = extractNormalizedMigrationRoutes(payload);

    expect(result.foreignClusters?.[0]?.countries).toEqual(["Lithuania"]);
    expect(result.foreignClusters?.[0]?.countryCodes).toEqual(["lt"]);
    expect(result.foreignClusters?.[0]?.locNames).toEqual(["Nemuno delta"]);
    expect(routes[0]?.fromLocality).toBe("Nemuno delta");
    expect(routes[0]?.routePoints?.[0]?.name).toBe("Nemuno delta");
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

  it("keeps coastal locality-backed targets for Estonia-history-only marine species payloads", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punakurk-kaur",
      speciesName: "Punakurk-kaur",
      generatedAt: "2026-03-18T12:00:00.000Z",
      evidenceSummary: {
        activeEvidenceUsed: ["Elurikkus Estonia"],
        rankingMode: "estonia_history_only",
        foreignEbirdAvailable: false,
      },
      predictedTargets: [
        {
          rank: 1,
          name: "Põõsaspea",
          displayName: "Põõsaspea",
          displayNameSource: "normalized_locality",
          countyOrParish: "Lääne-Nigula",
          lat: 59.0021,
          lon: 23.4987,
          confidence: 0.7,
          eta: "1d",
          searchRadiusKm: 12,
          habitatCue: "coastal open water",
          reason: "Estonia evidence centers on Põõsaspea for Punakurk-kaur.",
          rankingMode: "estonia_history_only",
          representativePointMethod: "hotspot_coordinate",
          coordinateSource: "hotspot_coordinate",
          rawClusterId: "ee-cluster-7",
          supportingEstoniaHistoryCount: 5,
          latestSupportingEstoniaDate: "2026-03-17T00:00:00.000Z",
          confidenceAfterCap: 0.7,
        },
      ],
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.predictedTargets?.[0]?.displayName).toBe("Põõsaspea");
    expect(result.predictedTargets?.[0]?.coordinateSource).toBe("hotspot_coordinate");
    expect(result.predictedTargets?.[0]?.confidence).toBeLessThanOrEqual(0.7);
    expect(result.predictedTargets?.[0]?.latestSupportingEstoniaDate).toBe("2026-03-17T00:00:00.000Z");
  });

  it("preserves freshest Estonia evidence summary and clean layer defaults", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punakurk-kaur",
      speciesName: "Punakurk-kaur",
      generatedAt: "2026-03-18T12:00:00.000Z",
      estoniaEvidence: {
        recentCount7d: 4,
        recentCount30d: 6,
        latestEstoniaDate: "2026-03-17T00:00:00.000Z",
        latestEstoniaLat: 59.0021,
        latestEstoniaLon: 23.4987,
        latestEstoniaLocality: "Põõsaspea",
        latestEstoniaSource: "EELURIKKUS",
        freshestLocalities: ["Põõsaspea", "Ristna", "Tagaranna"],
        sourceMix: ["EELURIKKUS", "GBIF"],
        alreadyPresent: true,
        alreadyPassed: false,
      },
      mapLayers: {
        estoniaHistory: true,
        estoniaHistoryPoints: true,
        estoniaHistoryClusters: false,
        foreignEvidence: false,
        foreignRecentPoints: false,
        foreignPressureClusters: false,
        predictedLines: false,
        predictedCone: false,
        predictedTargets: true,
        diagnostics: false,
        recentOnly: false,
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.estoniaEvidence?.latestEstoniaLocality).toBe("Põõsaspea");
    expect(result.estoniaEvidence?.freshestLocalities).toEqual(["Põõsaspea", "Ristna", "Tagaranna"]);
    expect(result.estoniaEvidence?.sourceMix).toEqual(["EELURIKKUS", "GBIF"]);
    expect(result.mapLayers?.estoniaHistoryClusters).toBe(false);
    expect(result.mapLayers?.foreignRecentPoints).toBe(false);
    expect(result.mapLayers?.predictedTargets).toBe(true);
  });

  it("normalizes uppercase EELURIKKUS sources for Estonia points and clusters", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punakurk-kaur",
      speciesName: "Punakurk-kaur",
      generatedAt: "2026-03-18T12:00:00.000Z",
      estoniaHistoryPoints: [
        { lat: 59.0021, lon: 23.4987, eventDate: "2026-03-17T00:00:00.000Z", ageClass: "recent", source: "EELURIKKUS" },
      ],
      estoniaHistoryClusters: [
        { id: "ee-cluster-1", lat: 59.0, lon: 23.5, count: 2, recentCount: 2, newestEventDate: "2026-03-17T00:00:00.000Z", oldestEventDate: "2026-03-10T00:00:00.000Z", source: "EELURIKKUS" },
      ],
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.estoniaHistoryPoints?.[0]?.source).toBe("EELURIKKUS");
    expect(result.estoniaHistoryClusters?.[0]?.source).toBe("EELURIKKUS");
  });

  it("accepts nested aiSummary payloads from the live invoke path", () => {
    const result = normalizeSpeciesPredictionResult({
      backendBuild: "2026-03-19-fix17",
      invokeRouteVersion: "fix17",
      summaryShapeUsed: "nested_aiSummary",
      summaryAcceptedBy: "live_post_route",
      normalizationProof: "nested aiSummary accepted by live POST invoke route",
      liveInvokeAcceptedNestedAiSummary: true,
      species: {
        key: "Punakurk-kaur",
        name: "Punakurk-kaur",
        latinName: "",
        ebirdSpeciesCode: "retloo",
      },
      weather: {
        source: "Open-Meteo",
        observedAt: "2026-03-19T11:47:40.961Z",
        windSpeedKmh: 10.1,
        precipitation: 0,
        windDirectionDeg: 230,
      },
      aiSummary: {
        warnings: [
          "No fresh Estonia records in last 7 or 30 days",
          "No Estonia historical clusters to support a forecast",
          "No recent foreign pressure detected",
          "Weather neutral — not a supporting signal",
        ],
        rankingNotes: "Ranking is not driven by Estonia history.",
        confidenceNote: "Low confidence for imminent occurrence.",
        insightSummary: "Overall, current evidence does not support an imminent presence in Estonia.",
      },
      generatedAt: "2026-03-19T11:47:41.623Z",
      sourceHealth: {
        primarySourceUsed: "eElurikkus recent table + GBIF Estonia coordinates + eBird foreign + Open-Meteo",
        sourceWarnings: [],
      },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
      },
      foreignClusters: [],
      predictedTargets: [],
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toBe("Overall, current evidence does not support an imminent presence in Estonia.");
    expect(result.confidenceNote).toBe("Low confidence for imminent occurrence.");
    expect(result.rankingNotes).toBe("Ranking is not driven by Estonia history.");
    expect(result.warnings).toHaveLength(4);
    expect(result.generatedAt).toBe("2026-03-19T11:47:41.623Z");
    expect(result.sourceHealth?.primarySourceUsed).toBe("eElurikkus recent table + GBIF Estonia coordinates + eBird foreign + Open-Meteo");
    expect(result.estoniaEvidence?.recentCount7d).toBe(0);
    expect(result.foreignClusters).toEqual([]);
    expect(result.predictedTargets).toEqual([]);
  });

  it("prefers finalized top-level summary over stale nested legacy summaries when backend markers are present", () => {
    const result = normalizeSpeciesPredictionResult({
      backendBuild: "2026-03-21-fix18",
      invokeRouteVersion: "fix18",
      responseProof: "served by live species-prediction invoke route",
      summaryOrigin: "neutral_sanitizer_fallback",
      insightSummary: "Structured evidence is currently incomplete in the final payload, so recent Estonia presence, foreign pressure, and hotspot ranking cannot be confirmed from this response.",
      aiSummary: "Structured evidence is currently incomplete in the final payload, so recent Estonia presence, foreign pressure, and hotspot ranking cannot be confirmed from this response.",
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT — 12 records in 7 days at Ristna and Põõsaspea with PL and FI pressure.",
      },
      openaiAnalysis: {
        analysisVersion: "legacy",
        insightSummary: "ALREADY PRESENT — 12 records in 7 days at Ristna and Põõsaspea with PL and FI pressure.",
        consistencyChecks: {
          routeLooksPlausible: false,
          timingLooksPlausible: false,
          weatherLooksSupportive: false,
          foreignPressureMatchesNarrative: false,
        },
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toContain("Structured evidence is currently incomplete in the final payload");
    expect(result.insightSummary).not.toContain("ALREADY PRESENT");
    expect(result.aiSummary).toBe(result.insightSummary);
    expect(result.payloadSourceState).toBe("current_finalized_backend_output");
    expect(result.summaryOrigin).toBe("neutral_sanitizer_fallback");
  });

  it("flags payloads without backend markers as legacy or unverified sources", () => {
    const result = normalizeSpeciesPredictionResult({
      insightSummary: "Legacy payload summary",
      rawResearchPayload: {
        aiSummary: "Legacy nested summary",
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.payloadSourceState).toBe("legacy_or_unverified_source");
  });

  it("replaces stale nested narrative on legacy or unverified payloads with a safe deterministic summary", () => {
    const result = normalizeSpeciesPredictionResult({
      insightSummary: "ALREADY PRESENT — 12 records in 7 days at Sääre küla, Ristna, and Põõsaspea with PL, SE, and FI pressure.",
      aiSummary: {
        insightSummary: "ALREADY PRESENT — 12 records in 7 days at Sääre küla, Ristna, and Põõsaspea with PL, SE, and FI pressure.",
      },
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT — 12 records in 7 days at Sääre küla, Ristna, and Põõsaspea with PL, SE, and FI pressure.",
      },
      sourceHealth: {
        ebirdAvailable: false,
      },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        alreadyPresent: false,
        freshestLocalities: [],
      },
      estoniaHistoryPoints: [],
      estoniaHistoryClusters: [],
      foreignRecentPoints: [],
      foreignClusters: [],
      predictedTargets: [],
      countryScores: {
        latvia: 0,
        lithuania: 0,
        belarus: 0,
        poland: 0,
        russia: 0,
        finlandContextOnly: 0,
      },
      externalPressureScore: 0,
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.payloadSourceState).toBe("legacy_or_unverified_source");
    expect(result.insightSummary).toBe("No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This output should be treated as incomplete evidence rather than an already-present signal.");
    expect(result.aiSummary).toBe(result.insightSummary);
    expect(result.insightSummary).not.toMatch(/ALREADY PRESENT|Sääre|Ristna|Põõsaspea|\bPL\b|\bSE\b|\bFI\b/i);
  });

  it("does not let finalized payloads reuse rawResearchPayload aiSummary over top-level summary", () => {
    const result = normalizeSpeciesPredictionResult({
      backendBuild: "2026-03-21-fix18",
      invokeRouteVersion: "fix18",
      responseProof: "served by live species-prediction invoke route",
      insightSummary: "No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This result should be treated as incomplete evidence, not as an already-present signal.",
      aiSummary: "No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This result should be treated as incomplete evidence, not as an already-present signal.",
      rawResearchPayload: {
        aiSummary: "ALREADY PRESENT — 12 records in 7 days at Sääre küla with PL and FI pressure.",
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).not.toContain("ALREADY PRESENT");
    expect(result.aiSummary).toBe(result.insightSummary);
  });

  it("accepts direct wrapped n8n success payloads with nested aiSummary", () => {
    const result = normalizeSpeciesPredictionResult({
      ok: true,
      species: {
        key: "Punakurk-kaur",
        name: "Punakurk-kaur",
        latinName: "",
        ebirdSpeciesCode: "retloo",
      },
      weather: {
        source: "Open-Meteo",
        observedAt: "2026-03-19T18:26:52.847Z",
        windSpeedKmh: 5,
        precipitation: 0,
        windDirectionDeg: 268,
      },
      aiSummary: {
        warnings: [
          "No recent or historical Estonia records in the dataset",
          "No foreign pressure recorded to indicate incoming birds",
          "Weather is a single snapshot and may change rapidly",
          "Update assessment as soon as any new records are reported",
        ],
        rankingNotes: "Ranking drivers: none present — no fresh Estonia records, no Estonia history clusters, and no recent foreign pressure. Weather is neutral and does not provide evidence of increased arrival risk. Expect a very low ranking until fresh local or foreign records appear.",
        confidenceNote: "High confidence that there are no recent Estonian detections.",
        insightSummary: "No recent or historical evidence of Punakurk-kaur in Estonia.",
      },
      generatedAt: "2026-03-19T18:26:53.531Z",
      sourceHealth: {
        primarySourceUsed: "eElurikkus recent table + GBIF Estonia coordinates + eBird foreign + Open-Meteo",
        sourceWarnings: [],
      },
      countryScores: {},
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        alreadyPresent: false,
      },
      evidenceSummary: {
        totalForeignRecentPoints: 0,
      },
      foreignClusters: [],
      mapLayersDefault: {
        showPredictedTargets: true,
      },
      predictedTargets: [],
      foreignRecentPoints: [],
      estoniaHistoryPoints: [],
      elurikkusRecentRecords: [],
      estoniaHistoryClusters: [],
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toBe("No recent or historical evidence of Punakurk-kaur in Estonia.");
    expect(result.confidenceNote).toBe("High confidence that there are no recent Estonian detections.");
    expect(result.rankingNotes).toContain("Ranking drivers: none present");
    expect(result.warnings).toHaveLength(4);
    expect(result.hasAiSummaryObject).toBeUndefined();
    expect(result.hasNestedInsightSummary).toBeUndefined();
    expect(result.summarySourcePath).toBeUndefined();
    expect(result.rankingNotesInputType).toBeUndefined();
    expect(result.warningsInputType).toBeUndefined();
    expect(result.analysisVersion).toBe("n8n_aiSummary_normalized");
    expect(result.foreignClusters).toEqual([]);
    expect(result.predictedTargets).toEqual([]);
    expect(result.weather?.observedAt).toBe("2026-03-19T18:26:52.847Z");
    expect(result.weather?.windSpeedKmh).toBe(5);
    expect(result.weather?.windSpeedKph).toBe(5);
    expect(result.evidenceSummary?.totalForeignRecentPoints).toBe(0);
    expect(result.species?.key).toBe("Punakurk-kaur");
    expect(result.species?.name).toBe("Punakurk-kaur");
  });

  it("recovers nested aiSummary from an invalid_upstream_json error envelope", () => {
    const result = normalizeSpeciesPredictionResult({
      code: "N8N_UPSTREAM_INVALID_RESPONSE",
      message: "n8n returned success but no AI summary payload was present",
      stage: "invalid_upstream_json",
      httpStatus: 200,
      responseBody: {
        upstreamBody: {
          ok: true,
          species: {
            key: "Punakurk-kaur",
            name: "Punakurk-kaur",
            latinName: "",
            ebirdSpeciesCode: "retloo",
          },
          weather: {
            source: "Open-Meteo",
            observedAt: "2026-03-19T17:03:54.650Z",
            windSpeedKmh: 6.1,
            precipitation: 0.1,
            windDirectionDeg: 263,
          },
          aiSummary: {
            warnings: [
              "No recent or historical Estonian records — expect low immediate arrival pressure.",
              "No foreign observations — incoming pressure absent.",
            ],
            rankingNotes: [
              "Fresh Estonia evidence (priority 1): recentCount7d=0, recentCount30d=0, alreadyPresent=false.",
              "Weather (priority 4): wind 263° at 6.1 km/h, precipitation 0.1 mm — weak conditions for long-distance displacement.",
            ],
            confidenceNote: "High confidence in low immediate arrival pressure.",
            insightSummary: "Immediate arrival pressure is low based on the provided evidence.",
          },
          generatedAt: "2026-03-19T17:03:55.249Z",
          sourceHealth: {
            primarySourceUsed: "eElurikkus recent table + GBIF Estonia coordinates + eBird foreign + Open-Meteo",
            sourceWarnings: [],
          },
          estoniaEvidence: {
            recentCount7d: 0,
            recentCount30d: 0,
            alreadyPresent: false,
          },
          evidenceSummary: {
            totalForeignRecentPoints: 0,
          },
          foreignClusters: [],
          predictedTargets: [],
          foreignRecentPoints: [],
          estoniaHistoryPoints: [],
          elurikkusRecentRecords: [],
          estoniaHistoryClusters: [],
          mapLayersDefault: {
            showPredictedTargets: true,
          },
        },
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toBe("Immediate arrival pressure is low based on the provided evidence.");
    expect(result.confidenceNote).toBe("High confidence in low immediate arrival pressure.");
    expect(result.rankingNotes).toContain("Fresh Estonia evidence");
    expect(result.rankingNotes).toContain("Weather (priority 4)");
    expect(result.warnings).toEqual([
      "No recent or historical Estonian records — expect low immediate arrival pressure.",
      "No foreign observations — incoming pressure absent.",
    ]);
    expect(result.summarySourcePath).toBe("responseBody.upstreamBody.aiSummary");
    expect(result.recoveredFromErrorEnvelope).toBe(true);
    expect(result.normalizedPredictionShape).toBe("nested-aiSummary-error-envelope");
    expect(result.rawTopLevelCode).toBe("N8N_UPSTREAM_INVALID_RESPONSE");
    expect(result.rawTopLevelStage).toBe("invalid_upstream_json");
    expect(result.analysisVersion).toBe("n8n_aiSummary_recovered");
    expect(result.sourceHealth?.primarySourceUsed).toBe("eElurikkus recent table + GBIF Estonia coordinates + eBird foreign + Open-Meteo");
    expect(result.evidenceSummary?.totalForeignRecentPoints).toBe(0);
    expect(result.weather?.observedAt).toBe("2026-03-19T17:03:54.650Z");
    expect(result.weather?.windSpeedKmh).toBe(6.1);
    expect(result.weather?.windSpeedKph).toBe(6.1);
    expect(result.foreignClusters).toEqual([]);
    expect(result.predictedTargets).toEqual([]);
  });
  it("normalizes wrapped upstreamBody aiSummary payloads as clean success", () => {
    const result = normalizeSpeciesPredictionResult({
      responseBody: {
        upstreamBody: {
          ok: true,
          status: "completed",
          speciesKey: "punakurk-kaur",
          speciesName: "Punakurk-kaur",
          scope: "linnuliigid",
          species: {
            key: "Punakurk-kaur",
            name: "Punakurk-kaur",
            latinName: "",
            ebirdSpeciesCode: "retloo",
          },
          weather: {
            source: "Open-Meteo",
            observedAt: "2026-03-19T17:03:54.650Z",
            windSpeedKmh: 6.1,
            windDirectionDeg: 263,
          },
          aiSummary: {
            warnings: ["Wrapped warning."],
            rankingNotes: "Wrapped ranking notes.",
            confidenceNote: "Wrapped confidence.",
            insightSummary: "Wrapped upstreamBody summary.",
          },
          generatedAt: "2026-03-19T17:03:55.249Z",
          sourceHealth: {
            primarySourceUsed: "eElurikkus recent table + GBIF Estonia coordinates + eBird foreign + Open-Meteo",
            sourceWarnings: [],
          },
          estoniaEvidence: {
            recentCount7d: 0,
            recentCount30d: 0,
            alreadyPresent: false,
          },
          evidenceSummary: {
            totalForeignRecentPoints: 0,
          },
          foreignClusters: [],
          predictedTargets: [],
          foreignRecentPoints: [],
          estoniaHistoryPoints: [],
          estoniaHistoryClusters: [],
          mapLayersDefault: {
            showPredictedTargets: true,
          },
        },
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toBe("Wrapped upstreamBody summary.");
    expect(result.confidenceNote).toBe("Wrapped confidence.");
    expect(result.rankingNotes).toBe("Wrapped ranking notes.");
    expect(result.warnings).toEqual(["Wrapped warning."]);
    expect(result.summarySourcePath).toBeUndefined();
    expect(result.recoveredFromErrorEnvelope).toBeUndefined();
    expect(result.normalizedPredictionShape).toBeUndefined();
    expect(result.rawTopLevelCode).toBeUndefined();
    expect(result.rawTopLevelStage).toBeUndefined();
    expect(result.hasAiSummaryObject).toBeUndefined();
    expect(result.hasNestedInsightSummary).toBeUndefined();
    expect(result.rankingNotesInputType).toBeUndefined();
    expect(result.warningsInputType).toBeUndefined();
    expect(result.analysisVersion).toBe("n8n_aiSummary_normalized");
    expect(result.speciesKey).toBe("punakurk-kaur");
    expect(result.speciesName).toBe("Punakurk-kaur");
    expect(result.scope).toBe("linnuliigid");
  });

  it("normalizes canonical success payloads without relying on recovery flags", () => {
    const result = normalizeSpeciesPredictionResult({
      ok: true,
      status: "completed",
      speciesKey: "punakurk-kaur",
      speciesName: "Punakurk-kaur",
      scope: "linnuliigid",
      species: {
        key: "Punakurk-kaur",
        name: "Punakurk-kaur",
      },
      generatedAt: "2026-03-19T20:00:00.000Z",
      analysisVersion: "n8n-flat-success",
      insightSummary: "Flat wrapped success summary.",
      confidenceNote: "Flat confidence.",
      rankingNotes: "Flat ranking notes.",
      warnings: ["Flat warning."],
      sourceHealth: {
        primarySourceUsed: "n8n",
        sourceWarnings: [],
      },
      estoniaEvidence: {
        recentCount7d: 1,
        recentCount30d: 2,
        alreadyPresent: true,
      },
      evidenceSummary: {
        totalForeignRecentPoints: 3,
      },
      foreignRecentPoints: [],
      foreignClusters: [],
      estoniaHistoryPoints: [],
      estoniaHistoryClusters: [],
      predictedTargets: [],
      weather: {
        source: "Open-Meteo",
        observedAt: "2026-03-19T19:55:00.000Z",
      },
      countryScores: {
        latvia: 1,
        lithuania: 2,
        belarus: 3,
        poland: 4,
        russia: 5,
      },
      mapLayersDefault: {
        showPredictedTargets: true,
      },
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toBe("Flat wrapped success summary.");
    expect(result.confidenceNote).toBe("Flat confidence.");
    expect(result.rankingNotes).toBe("Flat ranking notes.");
    expect(result.warnings).toEqual(["Flat warning."]);
    expect(result.summarySourcePath).toBeUndefined();
    expect(result.recoveredFromErrorEnvelope).toBeUndefined();
    expect(result.normalizedPredictionShape).toBeUndefined();
    expect(result.rawTopLevelCode).toBeUndefined();
    expect(result.rawTopLevelStage).toBeUndefined();
    expect(result.hasAiSummaryObject).toBeUndefined();
    expect(result.hasNestedInsightSummary).toBeUndefined();
    expect(result.rankingNotesInputType).toBeUndefined();
    expect(result.warningsInputType).toBeUndefined();
    expect(result.speciesKey).toBe("punakurk-kaur");
    expect(result.speciesName).toBe("Punakurk-kaur");
    expect(result.scope).toBe("linnuliigid");
    expect(result.analysisVersion).toBe("n8n-flat-success");
    expect(result.mapLayers?.predictedTargets).toBe(true);
  });

  it("does not treat wrapped payloads without any usable summary as valid", () => {
    const raw = {
      responseBody: {
        upstreamBody: {
          ok: true,
          species: {
            key: "punakurk-kaur",
            name: "Punakurk-kaur",
          },
          aiSummary: {
            confidenceNote: "Missing summary body.",
          },
        },
      },
    } as any;

    expect(hasUsableSpeciesPredictionResult(raw)).toBe(false);
    const result = normalizeSpeciesPredictionResult(raw, "Punakurk-kaur", "linnuliigid");
    expect(result.insightSummary).toBeUndefined();
    expect(result.recoveredFromErrorEnvelope).toBeUndefined();
  });

  it("unwraps array payloads and preserves current evidence-state values", () => {
    const result = normalizeSpeciesPredictionResult([
      {
        speciesKey: "punakurk-kaur",
        species: { name: "Punakurk-kaur" },
        generatedAt: "2026-03-21T08:00:00.000Z",
        evidenceState: "already_present_recent_evidence",
        sourceHealth: {
          elurikkusAvailable: true,
          ebirdAvailable: true,
          gbifAvailable: true,
          gbifFallbackUsed: false,
          primarySourceUsed: "eElurikkus recent Estonia",
          activeEvidenceUsed: ["EELURIKKUS", "GBIF Estonia coordinates", "Open-Meteo weather"],
          sourceWarnings: [],
        },
        estoniaEvidence: {
          recentCount7d: 12,
          recentCount30d: 12,
          latestEstoniaDate: "2026-03-20T00:00:00.000Z",
          latestEstoniaLat: null,
          latestEstoniaLon: null,
          alreadyPresent: true,
          alreadyPassed: false,
        },
        evidenceSummary: {
          freshestElurikkusDate: "2026-03-20T00:00:00.000Z",
          freshestElurikkusLocality: "Põõsaspea neem",
        },
        elurikkusRecentRecords: [
          {
            id: "rec-1",
            date: "2026-03-20T00:00:00.000Z",
            locality: "Põõsaspea neem",
            hasCoords: true,
            coordinates: { lat: 59.2054, lon: 23.5164 },
          },
        ],
        predictedTargets: [
          {
            rank: 1,
            name: "Põõsaspea neem",
            countyOrParish: "Lääne-Nigula",
            lat: 59.2054,
            lon: 23.5164,
            confidence: 0.88,
            eta: "already in Estonia",
            searchRadiusKm: 5,
            habitatCue: "coastal",
            reason: "Recent Estonia evidence",
          },
        ],
        aiSummary: {
          insightSummary: "Nested fallback should not override top-level summary",
        },
        insightSummary: "Top-level summary wins",
      } as any,
    ], "Punakurk-kaur", "linnuliigid");

    expect(result.species?.name).toBe("Punakurk-kaur");
    expect(result.evidenceState).toBe("already_present_recent_evidence");
    expect(result.sourceHealth?.activeEvidenceUsed).toEqual(["EELURIKKUS", "GBIF Estonia coordinates", "Open-Meteo weather"]);
    expect(result.estoniaEvidence?.recentCount7d).toBe(12);
    expect(result.estoniaEvidence?.recentCount30d).toBe(12);
    expect(result.evidenceSummary?.freshestElurikkusDate).toBe("2026-03-20T00:00:00.000Z");
    expect(result.evidenceSummary?.freshestElurikkusLocality).toBe("Põõsaspea neem");
    expect(result.elurikkusRecentRecords?.[0]?.coordinates).toEqual({ lat: 59.2054, lon: 23.5164 });
    expect(result.insightSummary).toBe("Top-level summary wins");
  });

  it("falls back to nested aiSummary summary and preserves current schema recent evidence fields", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punakurk-kaur",
      speciesName: "Punakurk-kaur",
      generatedAt: "2026-03-21T08:00:00.000Z",
      evidenceState: "weather_only",
      sourceHealth: {
        elurikkusAvailable: true,
        ebirdAvailable: true,
        gbifAvailable: true,
        gbifFallbackUsed: false,
        primarySourceUsed: "Open-Meteo weather",
        activeEvidenceUsed: ["Open-Meteo weather"],
        sourceWarnings: ["Foreign eBird was empty"],
      },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        latestEstoniaDate: "",
        latestEstoniaLat: null,
        latestEstoniaLon: null,
        alreadyPresent: false,
        alreadyPassed: false,
      },
      aiSummary: {
        insightSummary: "Nested summary text",
      },
      predictedTargets: [],
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.evidenceState).toBe("weather_only");
    expect(result.sourceHealth?.activeEvidenceUsed).toEqual(["Open-Meteo weather"]);
    expect(result.insightSummary).toBe("Nested summary text");
  });

  it("uses openAiResultValid as a last summary fallback when no insight summary exists", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punakurk-kaur",
      speciesName: "Punakurk-kaur",
      generatedAt: "2026-03-21T08:00:00.000Z",
      openAiResultValid: "Fallback summary text",
      predictedTargets: [],
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.insightSummary).toBe("Fallback summary text");
  });

  it("keeps punakurk-kaur current-schema values needed by the summary panel", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "punakurk-kaur",
      species: { name: "Punakurk-kaur" },
      generatedAt: "2026-03-21T08:00:00.000Z",
      evidenceState: "already_present_recent_evidence",
      sourceHealth: {
        elurikkusAvailable: true,
        ebirdAvailable: false,
        gbifAvailable: true,
        gbifFallbackUsed: false,
        primarySourceUsed: "eElurikkus recent Estonia",
        activeEvidenceUsed: ["EELURIKKUS", "GBIF Estonia coordinates", "Open-Meteo weather"],
        sourceWarnings: ["Foreign eBird evidence was unavailable in this run."],
      },
      estoniaEvidence: {
        recentCount7d: 12,
        recentCount30d: 12,
        latestEstoniaDate: "2026-03-20T00:00:00.000Z",
        latestEstoniaLat: null,
        latestEstoniaLon: null,
        alreadyPresent: true,
        alreadyPassed: false,
      },
      evidenceSummary: {
        freshestElurikkusDate: "2026-03-20T00:00:00.000Z",
        freshestElurikkusLocality: "Põõsaspea neem",
      },
      elurikkusRecentRecords: [
        {
          id: "rec-no-coords",
          date: "2026-03-20T00:00:00.000Z",
          locality: "Põõsaspea neem",
          hasCoords: false,
          coordinates: { lat: null, lon: null },
        },
        {
          id: "rec-with-coords",
          date: "2026-03-19T00:00:00.000Z",
          locality: "Dirhami",
          hasCoords: true,
          coordinates: { lat: 59.21001, lon: 23.49991 },
        },
      ],
      predictedTargets: [
        {
          rank: 1,
          name: "Põõsaspea neem",
          countyOrParish: "Lääne-Nigula",
          lat: 59.2054,
          lon: 23.5164,
          confidence: 0.88,
          eta: "already in Estonia",
          searchRadiusKm: 5,
          habitatCue: "coastal",
          reason: "Recent Estonia evidence",
        },
      ],
      insightSummary: "OpenAI summary text",
    } as any, "Punakurk-kaur", "linnuliigid");

    expect(result.evidenceState).not.toBe("unavailable");
    expect(result.estoniaEvidence?.recentCount7d).toBe(12);
    expect(result.estoniaEvidence?.recentCount30d).toBe(12);
    expect(result.sourceHealth?.activeEvidenceUsed).toContain("EELURIKKUS");
    expect(result.sourceHealth?.activeEvidenceUsed).toContain("GBIF Estonia coordinates");
    expect(result.sourceHealth?.activeEvidenceUsed).toContain("Open-Meteo weather");
    const freshestCoords = result.elurikkusRecentRecords?.find((record) => record?.hasCoords)?.coordinates;
    expect(freshestCoords).toEqual({ lat: 59.21001, lon: 23.49991 });
  });

  it("extracts nested migration routes from topPredictedPoints first", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        {
          rank: 1,
          name: "Mustvares Target",
          lat: 58.5,
          lon: 23.4,
          migrationEta: {
            entryLat: 57.9,
            entryLon: 23.1,
            fromLocality: "Kurzeme coast",
            fromCountry: "Latvia",
            earliestArrival: "2026-03-24",
            latestArrival: "2026-03-26",
            routeDistanceKm: 210,
            migrationRoute: {
              currentProgressPct: 44,
              currentEstimatedLat: 57.7,
              currentEstimatedLon: 22.8,
              route: [
                { lat: 56.9, lon: 21.1, type: "origin", name: "Origin" },
                { lat: 57.9, lon: 23.1, type: "waypoint", name: "Entry" },
                { lat: 58.5, lon: 23.4, type: "destination", name: "Mustvares Target" },
              ],
            },
          },
        },
      ],
    } as any);

    expect(routes).toHaveLength(1);
    expect(routes[0]?.targetName).toBe("Mustvares Target");
    expect(routes[0]?.sourcePath).toBe("topPredictedPoints[0]");
    expect(routes[0]?.routePoints).toHaveLength(3);
    expect(routes[0]?.displayRoutePoints?.[0]).toEqual({ lat: 56.9, lon: 21.1, name: "Origin", type: "origin" });
    expect(routes[0]?.currentProgressPct).toBe(44);
  });

  it("does not use rawResearchPayload predicted targets as a production route source", () => {
    const routes = extractNormalizedMigrationRoutes({
      predictedTargets: [],
      rawResearchPayload: {
        topPredictedPoints: [
          {
            rank: 2,
            name: "Fallback Target",
            lat: 58.7,
            lon: 23.8,
            migrationEta: {
              entryLat: 58.1,
              entryLon: 23.4,
              migrationRoute: {
                route: [
                  { lat: 57.1, lon: 22.1, type: "origin" },
                  { lat: 58.7, lon: 23.8, type: "destination" },
                ],
              },
            },
          },
        ],
      },
    } as any);

    expect(routes).toHaveLength(0);
  });

  it("synthesizes origin-entry-target fallback routes when nested route arrays are too short", () => {
    const routes = extractNormalizedMigrationRoutes({
      predictedTargets: [
        {
          rank: 3,
          name: "Synth Target",
          lat: 59.0,
          lon: 24.0,
          migrationEta: {
            entryLat: 58.4,
            entryLon: 23.6,
            migrationRoute: {
              route: [{ lat: 57.0, lon: 22.0, type: "origin", name: "Origin" }],
            },
          },
        },
      ],
    } as any);

    expect(routes).toHaveLength(1);
    expect(routes[0]?.routePoints).toEqual([
      { lat: 57, lon: 22, name: "Origin", type: "origin" },
      { lat: 58.4, lon: 23.6, name: "Entry", type: "waypoint" },
      { lat: 59, lon: 24, name: "Target", type: "destination" },
    ]);
  });

  it("ignores targets without migrationEta or usable coordinates", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        { rank: 1, name: "No ETA", lat: 58.1, lon: 23.1 },
        {
          rank: 2,
          name: "Broken route",
          lat: 58.2,
          lon: 23.2,
          migrationEta: {
            migrationRoute: {
              route: [{ lat: "bad", lon: 22.2 }],
            },
          },
        },
      ],
    } as any);

    expect(routes).toHaveLength(0);
  });

  it("deduplicates equivalent nested routes from topPredictedPoints and predictedTargets", () => {
    const sharedTarget = {
      rank: 1,
      name: "Same Target",
      lat: 58.8,
      lon: 23.9,
      migrationEta: {
        migrationRoute: {
          route: [
            { lat: 57.2, lon: 22.2, type: "origin" },
            { lat: 58.8, lon: 23.9, type: "destination" },
          ],
        },
      },
    };

    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [sharedTarget],
      predictedTargets: [sharedTarget],
    } as any);

    expect(routes).toHaveLength(1);
    expect(routes[0]?.sourcePath).toBe("topPredictedPoints[0]");
  });

  it("separates entry progress from final target semantics", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        {
          rank: 1,
          name: "Põõsaspea",
          lat: 59.002,
          lon: 23.498,
          migrationEta: {
            entryZone: "Kabli",
            entryLat: 58.0,
            entryLon: 24.4,
            migrationRoute: {
              currentEstimatedLat: 58.0,
              currentEstimatedLon: 24.4,
              currentProgressPct: 55,
              route: [
                { lat: 56.9, lon: 22.1, type: "origin", name: "Origin coast" },
                { lat: 58.0, lon: 24.4, type: "waypoint", name: "Kabli" },
                { lat: 59.002, lon: 23.498, type: "destination", name: "Põõsaspea" },
              ],
            },
          },
        },
      ],
    } as any);

    expect(routes[0]?.entryLabel).toBe("Kabli");
    expect(routes[0]?.progressAtEntry).toBe(true);
    expect(routes[0]?.progressLabel).toBe("Entry via Kabli");
    expect(routes[0]?.targetName).toBe("Põõsaspea");
    expect(routes[0]?.entryPoint?.name).toBe("Kabli");
    expect(routes[0]?.targetPoint?.name).toBe("Põõsaspea");
  });
  it("preserves explicit origin waypoint metadata for active routes", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        {
          name: "Target",
          lat: 58.9,
          lon: 23.4,
          migrationEta: {
            fromLocality: "Ragaciems, Gausā jūdze.",
            fromCountry: "LV",
            foreignSightingDate: "2026-03-30",
            entryLat: 58.1,
            entryLon: 24.3,
            migrationRoute: {
              route: [
                { lat: 57.0, lon: 23.5, type: "origin", name: "Ragaciems, Gausā jūdze." },
                { lat: 58.1, lon: 24.3, type: "waypoint", name: "Kabli" },
                { lat: 58.9, lon: 23.4, type: "destination", name: "Target" },
              ],
            },
          },
        },
      ],
    } as any);

    expect(routes[0]?.originPoint?.name).toBe("Ragaciems, Gausā jūdze.");
    expect(routes[0]?.originLocality).toBe("Ragaciems, Gausā jūdze.");
    expect(routes[0]?.originCountryCode).toBe("LV");
    expect(routes[0]?.foreignSightingDate).toBe("2026-03-30");
    expect(routes[0]?.distanceToEntryKm).toBeGreaterThan(0);
  });

  it("uses first route coordinate as origin when no explicit origin waypoint exists", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        {
          name: "Target",
          lat: 58.9,
          lon: 23.4,
          migrationEta: {
            fromLocality: "Fallback foreign point",
            migrationRoute: {
              route: [
                { lat: 57.1, lon: 23.2, type: "waypoint" },
                { lat: 58.9, lon: 23.4, type: "destination" },
              ],
            },
          },
        },
      ],
    } as any);

    expect(routes[0]?.originPoint).toEqual({ lat: 57.1, lon: 23.2, type: "waypoint" });
    expect(routes[0]?.originLocality).toBe("Fallback foreign point");
  });

  it("keeps origin marker data even when origin and entry are close", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        {
          name: "Nearby target",
          lat: 58.9,
          lon: 23.4,
          migrationEta: {
            fromLocality: "Close origin",
            entryLat: 57.001,
            entryLon: 23.501,
            migrationRoute: {
              route: [
                { lat: 57.0, lon: 23.5, type: "origin", name: "Close origin" },
                { lat: 58.9, lon: 23.4, type: "destination" },
              ],
            },
          },
        },
      ],
    } as any);

    expect(routes[0]?.originPoint).toBeTruthy();
    expect(routes[0]?.entryPoint).toBeTruthy();
  });

  it("keeps origin marker data for legacy fallback routes", () => {
    const routes = extractNormalizedMigrationRoutes({
      globalMigrationEtas: [
        {
          fromLocality: "Legacy origin",
          foreignCountry: "LV",
          foreignSightingDate: "2026-03-30",
          entryLat: 58.1,
          entryLon: 24.3,
          migrationRoute: {
            route: [
              { lat: 57.0, lon: 23.5, type: "origin", name: "Legacy origin" },
              { lat: 58.1, lon: 24.3, type: "waypoint", name: "Kabli" },
            ],
          },
        },
      ],
    } as any);

    expect(routes[0]?.originPoint?.name).toBe("Legacy origin");
  });

  it("prepends the real origin ahead of snapped coastal route points in display geometry", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        {
          name: "Mägi-kanepilind",
          lat: 58.9,
          lon: 23.4,
          migrationEta: {
            fromLocality: "Ragaciems, Gausā jūdze.",
            fromCountry: "LV",
            entryLat: 58.1,
            entryLon: 24.3,
            migrationRoute: {
              route: [
                { lat: 57.2, lon: 23.7, type: "waypoint", name: "Snapped coastal point" },
                { lat: 58.1, lon: 24.3, type: "waypoint", name: "Kabli" },
                { lat: 58.9, lon: 23.4, type: "destination", name: "Target" },
              ],
            },
            currentEstimatedLat: 57.6,
            currentEstimatedLon: 23.9,
          },
          migrationRoute: {
            route: [
              { lat: 57.2, lon: 23.7, type: "waypoint", name: "Snapped coastal point" },
              { lat: 58.1, lon: 24.3, type: "waypoint", name: "Kabli" },
              { lat: 58.9, lon: 23.4, type: "destination", name: "Target" },
            ],
          },
          targetLat: 58.9,
          targetLon: 23.4,
        },
      ],
    } as any);

    expect(routes[0]?.originPoint).toEqual({ lat: 57.2, lon: 23.7, name: "Snapped coastal point", type: "waypoint" });
    expect(routes[0]?.displayRoutePoints?.[0]).toEqual({ lat: 57.2, lon: 23.7, name: "Snapped coastal point", type: "waypoint" });
    expect(routes[0]?.displayRoutePoints?.[1]?.name).toBe("Kabli");
  });

  it("keeps display route ordering as origin then waypoints then entry then target", () => {
    const routes = extractNormalizedMigrationRoutes({
      topPredictedPoints: [
        {
          name: "Target",
          lat: 58.9,
          lon: 23.4,
          migrationEta: {
            fromLocality: "Ragaciems, Gausā jūdze.",
            fromCountry: "LV",
            entryLat: 58.1,
            entryLon: 24.3,
            migrationRoute: {
              route: [
                { lat: 57.0, lon: 23.5, type: "origin", name: "Ragaciems, Gausā jūdze." },
                { lat: 57.6, lon: 23.9, type: "waypoint", name: "Route bend" },
                { lat: 58.1, lon: 24.3, type: "waypoint", name: "Kabli" },
                { lat: 58.9, lon: 23.4, type: "destination", name: "Target" },
              ],
            },
          },
        },
      ],
    } as any);

    expect(routes[0]?.displayRoutePoints?.map((point) => point.name)).toEqual([
      "Ragaciems, Gausā jūdze.",
      "Route bend",
      "Kabli",
      "Target",
    ]);
  });
  it("clips already-present routes to the fresh Estonia anchor instead of continuing offshore", () => {
    const result = buildActiveMigrationDisplayRoute({
      targetName: "Offshore helper",
      entryLabel: "Kabli",
      originPoint: { lat: 56.95, lon: 23.6, name: "Ragaciems", type: "origin" },
      entryPoint: { lat: 58.0, lon: 24.45, name: "Kabli", type: "waypoint" },
      targetPoint: { lat: 57.7, lon: 23.1, name: "Sea helper", type: "destination" },
      routePoints: [],
      displayRoutePoints: [
        { lat: 56.95, lon: 23.6, name: "Ragaciems", type: "origin" },
        { lat: 58.0, lon: 24.45, name: "Kabli", type: "waypoint" },
        { lat: 57.7, lon: 23.1, name: "Sea helper", type: "destination" },
      ],
      sourcePath: "test",
    } as any, {
      name: "Ristna / Kalana",
      lat: 58.93,
      lon: 22.05,
    }, true);

    expect(result.activeDisplayRoutePoints.map((point) => point.name)).toEqual([
      "Ragaciems",
      "Kabli",
      "Ristna / Kalana",
    ]);
    expect(result.activeDisplayDestination?.name).toBe("Ristna / Kalana");
  });

  it("drops post-entry segments that move farther away from the chosen Estonia destination", () => {
    const result = buildActiveMigrationDisplayRoute({
      targetName: "Põõsaspea",
      entryLabel: "Kabli",
      originPoint: { lat: 56.95, lon: 23.6, name: "Ragaciems", type: "origin" },
      entryPoint: { lat: 58.0, lon: 24.45, name: "Kabli", type: "waypoint" },
      targetPoint: { lat: 58.93, lon: 22.05, name: "Ristna", type: "destination" },
      routePoints: [],
      displayRoutePoints: [
        { lat: 56.95, lon: 23.6, name: "Ragaciems", type: "origin" },
        { lat: 58.0, lon: 24.45, name: "Kabli", type: "waypoint" },
        { lat: 58.6, lon: 23.0, name: "Closer inland", type: "waypoint" },
        { lat: 57.8, lon: 23.7, name: "Offshore drift", type: "waypoint" },
      ],
      sourcePath: "test",
    } as any, {
      name: "Ristna",
      lat: 58.93,
      lon: 22.05,
    }, false);

    expect(result.activeDisplayRoutePoints.map((point) => point.name)).toEqual([
      "Ragaciems",
      "Kabli",
      "Closer inland",
      "Põõsaspea",
    ]);
  });

  it("falls back to origin to entry when already-present mode has no active Estonia anchor", () => {
    const result = buildActiveMigrationDisplayRoute({
      targetName: "Offshore helper",
      entryLabel: "Kabli",
      originPoint: { lat: 56.95, lon: 23.6, name: "Ragaciems", type: "origin" },
      entryPoint: { lat: 58.0, lon: 24.45, name: "Kabli", type: "waypoint" },
      targetPoint: { lat: 57.7, lon: 23.1, name: "Sea helper", type: "destination" },
      routePoints: [],
      displayRoutePoints: [
        { lat: 56.95, lon: 23.6, name: "Ragaciems", type: "origin" },
        { lat: 58.0, lon: 24.45, name: "Kabli", type: "waypoint" },
        { lat: 57.7, lon: 23.1, name: "Sea helper", type: "destination" },
      ],
      sourcePath: "test",
    } as any, null, true);

    expect(result.activeDisplayRoutePoints.map((point) => point.name)).toEqual([
      "Ragaciems",
      "Kabli",
    ]);
  });
  it("preserves unavailable-state flags for the panel model", () => {
    const result = normalizeSpeciesPredictionResult({
      speciesKey: "test-species",
      speciesName: "Test Species",
      generatedAt: "2026-03-31T12:00:00.000Z",
      statusCode: "CONFIGURED_UNAVAILABLE",
      userMessage: "Prediction backend is currently unavailable.",
      isLivePredictionAvailable: false,
      isCachedPrediction: false,
      canRenderPredictionLayers: false,
      predictionVectors: [],
      predictedTargets: [],
      topPredictedPoints: [],
      mapLayers: {
        estoniaHistory: false,
        estoniaHistoryPoints: false,
        estoniaHistoryClusters: false,
        foreignEvidence: false,
        foreignRecentPoints: false,
        foreignPressureClusters: false,
        predictedLines: false,
        predictedCone: false,
        predictedTargets: false,
        diagnostics: true,
        recentOnly: false,
      },
      insightSummary: "Prediction backend is currently unavailable.",
    } as any, "Test Species", "linnuliigid");

    const panel = normalizePrediction(result);
    expect(result.statusCode).toBe("CONFIGURED_UNAVAILABLE");
    expect(result.canRenderPredictionLayers).toBe(false);
    expect(panel.isLivePredictionAvailable).toBe(false);
    expect(panel.isCachedPrediction).toBe(false);
    expect(panel.canRenderPredictionLayers).toBe(false);
    expect(panel.userMessage).toBe("Prediction backend is currently unavailable.");
  });
});

describe("normalizePrediction", () => {
  it("builds one panel-facing normalized object from current n8n payload", () => {
    const normalized = normalizePrediction([
      {
        speciesKey: "punakurk-kaur",
        speciesName: "Punakurk-kaur",
        evidenceState: "mixed",
        confidenceNote: "Moderate confidence",
        topTarget: {
          rank: 1,
          name: "Põõsaspea",
          countyOrParish: "Lääne-Nigula",
          lat: 59.0021,
          lon: 23.4987,
          confidence: 0.92,
          eta: "24h",
          searchRadiusKm: 5,
          habitatCue: "coastal open water",
          reason: "Top target",
        },
        sourceHealth: {
          activeEvidenceUsed: ["eElurikkus recent records", "GBIF Estonia history", "eBird foreign pressure", "Open-Meteo weather"],
          elurikkusAvailable: true,
          ebirdAvailable: true,
          gbifAvailable: true,
        },
        recentCount7d: 12,
        recentCount30d: 12,
        predictedTargets: [
          {
            rank: 1,
            name: "Põõsaspea",
            countyOrParish: "Lääne-Nigula",
            lat: 59.0021,
            lon: 23.4987,
            confidence: 0.92,
            eta: "24h",
            searchRadiusKm: 5,
            habitatCue: "coastal open water",
            reason: "Top target",
          },
        ],
        weather: {
          windSpeedKmh: 21,
          windDirectionDeg: 225,
          observedAt: "2026-03-21T11:45:00.000Z",
          source: "Open-Meteo",
        },
        elurikkusRecentRecords: [
          {
            id: "older",
            date: "2026-03-20T08:00:00.000Z",
            locality: "Older locality",
            coordinates: { lat: 58.1, lon: 23.1 },
          },
          {
            id: "freshest",
            event_datetime_point: "2026-03-21T10:15:00.000Z",
            locality: "Sääre küla",
            latitude: 57.9054,
            longitude: 22.051674,
          },
        ],
        estoniaHistoryClusters: [{ id: "ee1", lat: 1, lon: 1, count: 1, recentCount: 1, newestEventDate: "", oldestEventDate: "", source: "GBIF" }],
        foreignClusters: [{ id: "f1", lat: 1, lon: 1, pointCount: 1, newestObsDt: "", oldestObsDt: "", freshestDaysAgo: 1, averageDaysAgo: 1, totalHowMany: 1, countries: ["Latvia"], countryCodes: ["lv"], locNames: ["x"], nearestDistanceKm: 1, isFreshest: true }],
        insightSummary: "OpenAI summary text",
        hasRecentEstoniaEvidence: true,
        hasForeignPressure: true,
      },
    ] as any);

    expect(normalized.speciesName).toBe("Punakurk-kaur");
    expect(normalized.evidenceState).toBe("mixed");
    expect(normalized.confidenceValue).toBe(0.92);
    expect(normalized.confidenceLabel).toBe("92%");
    expect(normalized.sourcesContacted).toEqual([
      "eElurikkus recent records",
      "GBIF Estonia history",
      "eBird foreign pressure",
      "Open-Meteo weather",
    ]);
    expect(normalized.rankingMode).toBe("eElurikkus recent records + GBIF Estonia history + eBird foreign pressure + Open-Meteo weather");
    expect(normalized.activeEvidenceUsed).toEqual([
      "eElurikkus recent records",
      "GBIF Estonia history",
      "eBird foreign pressure",
      "Open-Meteo weather",
    ]);
    expect(normalized.latestEeCoords).toBe("57.9054, 22.051674");
    expect(normalized.latestEeLocality).toBe("Sääre küla");
    expect(normalized.recentCount7d).toBe(12);
    expect(normalized.recentCount30d).toBe(12);
    expect(normalized.predictedTargets).toHaveLength(1);
    expect(normalized.predictedTargets[0]?.name).toBe("Põõsaspea");
    expect(normalized.weatherLabel).toContain("SW");
    expect(normalized.summaryText).toBe("OpenAI summary text");
  });

  it("prefers finalized panel mapping fields over derived source lists", () => {
    const normalizedResult = normalizeSpeciesPredictionResult({
      speciesKey: "punanokk-vart",
      speciesName: "Punanokk-vart",
      generatedAt: "2026-03-31T08:00:00.000Z",
      payloadSourceState: "current_finalized_backend_output",
      sourceHealth: {
        primarySourceUsed: "eBird foreign",
        activeEvidenceUsed: ["stale source health value"],
        elurikkusAvailable: true,
        ebirdAvailable: true,
        gbifAvailable: true,
      },
      evidenceSummary: {
        effectiveRankingMode: "Foreign pressure + Estonia history",
        activeEvidenceUsed: ["eBird foreign", "GBIF Estonia"],
        rankingMode: "wrong legacy ranking mode",
      },
      activeEvidenceSources: ["eBird foreign", "GBIF Estonia"],
      effectiveRankingMode: "Foreign pressure + Estonia history",
      foreignRecentPoints: [
        { lat: 55.72, lon: 21.1, obsDt: "2026-03-30T07:00:00.000Z", locName: "Klaipeda coast", countryCode: "lt", countryName: "Lithuania", source: "eBird", daysAgo: 1 },
      ],
      foreignClusters: [
        { id: "lt-mid", lat: 55.72, lon: 21.1, pointCount: 2, newestObsDt: "2026-03-30T07:00:00.000Z", oldestObsDt: "2026-03-30T07:00:00.000Z", freshestDaysAgo: 1, averageDaysAgo: 1, totalHowMany: 5, countries: ["Lithuania"], countryCodes: ["lt"], locNames: ["Klaipeda coast"], nearestDistanceKm: 260, isFreshest: true },
      ],
      externalPressureScore: 12,
      countryScores: { latvia: 0, lithuania: 40, belarus: 0, poland: 0, russia: 0 },
      estoniaEvidence: {
        recentCount7d: 0,
        recentCount30d: 0,
        latestEstoniaLocality: "",
        freshestLocalities: [],
      },
      hasUsableRecentEstoniaEvidence: false,
      hasUsableForeignPressure: true,
      insightSummary: "No recent Estonia records were confirmed in the last 7 days, but recent foreign pressure exists, supporting near-term watch targets in Estonia.",
      rawResearchPayload: {
        normalizedSources: {
          foreignRecentPoints: [
            { lat: 57.86, lon: 23.22, obsDt: "2026-03-30T08:00:00.000Z", locName: "Kolkasrags", countryCode: "lv", countryName: "Latvia", source: "eBird", daysAgo: 1 },
          ],
        },
      },
    } as any, "Punanokk-vart", "linnuliigid");

    const panelModel = normalizePrediction(normalizedResult);

    expect(normalizedResult.sourceHealth?.primarySourceUsed).toBe("eBird foreign");
    expect(normalizedResult.effectiveRankingMode).toBe("Foreign pressure + Estonia history");
    expect(normalizedResult.activeEvidenceSources).toEqual(["eBird foreign", "GBIF Estonia"]);
    expect(normalizedResult.foreignRecentPoints?.length).toBe(1);
    expect(normalizedResult.externalPressureScore).toBe(12);
    expect(normalizedResult.countryScores.lithuania).toBe(40);

    expect(panelModel.primarySourceUsed).toBe("eBird foreign");
    expect(panelModel.rankingMode).toBe("Foreign pressure + Estonia history");
    expect(panelModel.activeEvidenceUsed).toEqual(["eBird foreign", "GBIF Estonia"]);
  });

  it("prefers rawResearchPayload latestEEDate over stale top-level latestEstoniaDate", () => {
    const freshest = resolveFreshestEstoniaEvidence({
      estoniaEvidence: {
        latestEstoniaDate: "2024-03-01",
        latestEstoniaLocality: "Old fallback",
      },
      elurikkusRecentRecords: [
        { locality: "Ristna", event_date: "2026-03-28", coordinates: { lat: 58.93, lon: 22.05 } },
      ],
      rawResearchPayload: {
        estoniaEvidence: {
          latestEEDate: "2026-03-29",
          latestEELocality: "Kalana",
        },
      },
    } as any);

    expect(freshest?.date).toBe("2026-03-29");
    expect(freshest?.locality).toBe("Kalana");
    expect(freshest?.source).toBe("rawResearchPayload.estoniaEvidence.latestEEDate");
  });

  it("falls back to newest eElurikkus record before stale estoniaEvidence date", () => {
    const freshest = resolveFreshestEstoniaEvidence({
      estoniaEvidence: {
        latestEstoniaDate: "2025-03-01",
        latestEstoniaLocality: "Historical fallback",
      },
      elurikkusRecentRecords: [
        { locality: "Sääre küla", event_date: "2026-03-27", coordinates: { lat: 57.905, lon: 22.051 } },
        { locality: "Older locality", event_date: "2026-03-20", coordinates: { lat: 58.1, lon: 23.1 } },
      ],
    } as any);

    expect(freshest?.date).toBe("2026-03-27");
    expect(freshest?.locality).toBe("Sääre küla");
    expect(freshest?.source).toBe("elurikkusRecentRecords");
  });

  it("merges canonical hotspot aliases within nearby clusters", () => {
    const merged = mergeCanonicalEstoniaHotspots([
      { displayName: "Põõsaspea neem", lat: 59.01, lon: 23.49, supportingEstoniaHistoryCount: 3, latestSupportingEstoniaDate: "2024-04-01" },
      { displayName: "Spithami küla", lat: 59.02, lon: 23.5, supportingEstoniaHistoryCount: 2, latestSupportingEstoniaDate: "2026-03-15" },
      { displayName: "Ringsu", lat: 57.78, lon: 23.26, supportingEstoniaHistoryCount: 1, latestSupportingEstoniaDate: "2022-03-01" },
    ] as any);

    const poosaspea = merged.find((item) => item.canonicalName === "Põõsaspea / Spithami");
    expect(poosaspea?.supportCount).toBe(5);
    expect(poosaspea?.latestYear).toBe(2026);
  });

  it("detects already-present mode from estoniaEvidence or recentCount7d", () => {
    expect(isAlreadyPresentPrediction({ estoniaEvidence: { alreadyPresent: true } } as any)).toBe(true);
    expect(isAlreadyPresentPrediction({ recentCount7d: 2 } as any)).toBe(true);
    expect(isAlreadyPresentPrediction({ recentCount7d: 0, estoniaEvidence: { alreadyPresent: false } } as any)).toBe(false);
  });

  it("prioritizes nearby watch-next targets and de-prioritizes ruhnu in already-present mode", () => {
    const model = buildSpeciesPredictionDisplayModel({
      recentCount7d: 4,
      elurikkusRecentRecords: [
        { locality: "Ristna", event_date: "2026-03-29", coordinates: { lat: 58.9257, lon: 22.0541 } },
      ],
      predictedTargets: [
        { rank: 1, name: "Ringsu", lat: 57.78, lon: 23.26, confidence: 0.8, eta: "24h", searchRadiusKm: 5, habitatCue: "", reason: "", countyOrParish: "" },
        { rank: 2, name: "Kalana", lat: 58.99, lon: 22.45, confidence: 0.7, eta: "12h", searchRadiusKm: 5, habitatCue: "", reason: "", countyOrParish: "" },
        { rank: 3, name: "Ristna", lat: 58.93, lon: 22.05, confidence: 0.9, eta: "now", searchRadiusKm: 5, habitatCue: "", reason: "", countyOrParish: "" },
      ],
    } as any);

    expect(model.alreadyPresentMode).toBe(true);
    expect(model.displayedTargets).toHaveLength(2);
    expect(model.displayedTargets[0]?.name).toBe("Ristna");
    expect(model.displayedTargets.some((item) => item.name === "Ringsu")).toBe(false);
  });

  it("resolves the active Estonia anchor from freshest Estonia evidence in already-present mode", () => {
    const model = buildSpeciesPredictionDisplayModel({
      recentCount7d: 3,
      elurikkusRecentRecords: [
        { locality: "Kalana", event_date: "2026-03-29", coordinates: { lat: 58.987, lon: 22.469 } },
      ],
      predictedTargets: [
        { rank: 1, name: "Põõsaspea", lat: 59.14, lon: 23.49, confidence: 0.71, eta: "12h", searchRadiusKm: 5, habitatCue: "", reason: "", countyOrParish: "" },
      ],
    } as any);

    expect(model.activeEstoniaAnchor).toEqual({
      name: "Kalana",
      lat: 58.987,
      lon: 22.469,
    });
  });

  it("falls back to the first predicted target for the active Estonia anchor outside already-present mode", () => {
    expect(resolveActiveEstoniaAnchor([
      { rank: 1, name: "Põõsaspea", lat: 59.14, lon: 23.49, confidence: 0.71, eta: "12h", searchRadiusKm: 5, habitatCue: "", reason: "", countyOrParish: "" },
    ] as any, null, false)).toEqual({
      name: "Põõsaspea",
      lat: 59.14,
      lon: 23.49,
      confidence: 0.71,
      supportCount: undefined,
    });
  });

  it("selects the route nearest to freshest Estonia evidence in already-present mode", () => {
    const selected = selectPrimaryMigrationRoute([
      {
        targetName: "Ringsu",
        targetLat: 57.78,
        targetLon: 23.26,
        routePoints: [{ lat: 57.0, lon: 22.0 }],
        sourcePath: "a",
      },
      {
        targetName: "Ristna",
        targetLat: 58.9257,
        targetLon: 22.0541,
        routePoints: [{ lat: 57.1, lon: 22.1 }],
        sourcePath: "b",
      },
    ] as any, [], {
      locality: "Ristna",
      date: "2026-03-29",
      coords: { lat: "58.9257", lon: "22.0541" },
      source: "elurikkusRecentRecords",
    }, true);

    expect(selected?.targetName).toBe("Ristna");
  });

  it("selects the route matching the first displayed target outside already-present mode", () => {
    const selected = selectPrimaryMigrationRoute([
      {
        targetName: "Ringsu",
        targetLat: 57.78,
        targetLon: 23.26,
        routePoints: [{ lat: 57.0, lon: 22.0 }],
        sourcePath: "a",
      },
      {
        targetName: "Põõsaspea",
        targetLat: 59.14,
        targetLon: 23.49,
        routePoints: [{ lat: 57.1, lon: 22.1 }],
        sourcePath: "b",
      },
    ] as any, [
      { rank: 1, name: "Põõsaspea", lat: 59.14, lon: 23.49, confidence: 0.71, eta: "12h", searchRadiusKm: 5, habitatCue: "", reason: "", countyOrParish: "" },
    ] as any, null, false);

    expect(selected?.targetName).toBe("Põõsaspea");
  });
});
