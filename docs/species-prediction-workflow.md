# n8n Workflow: Species Prediction Real Sources (`POST /species-prediction-evidence-first`)

## Goal
- Receive one selected-species prediction request from the Supabase edge function.
- Fetch species-specific research inputs from foreign sightings, Elurikkus history, Estonia recent records, and weather.
- Score them into the same response shape the app already expects.
- Run a server-side OpenAI refinement step on top of the deterministic result.
- Keep everything single-species only. No aggregation across species.

## Files
- Workflow JSON import: `docs/species_prediction_api_real_sources.json`
- Sample request payload: `docs/species_prediction_request_example.json`
- Sample response payload: `docs/species_prediction_response_example.json`

## Import In n8n
1. Open n8n.
2. Choose `Import from file`.
3. Import `docs/species_prediction_api_real_sources.json`.
4. Open the imported workflow and replace every `REPLACE_*` endpoint placeholder with your real source URLs.
5. If your upstreams require auth, configure credentials or headers on each HTTP Request node.
6. Activate the workflow and copy the production webhook URL.
7. Set that webhook URL into Supabase as `SPECIES_PREDICTION_N8N_WEBHOOK_URL`.
8. Production webhook target for this app is `https://estbirds.app.n8n.cloud/webhook/species-prediction-evidence-first`.

## Required External Config
- `SPECIES_PREDICTION_N8N_WEBHOOK_URL`
  - Stored in Supabase Edge Function env, not in the app.
  - Current production value: `https://estbirds.app.n8n.cloud/webhook/species-prediction-evidence-first`
- n8n/server-side OpenAI config:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL` optional, defaults to `gpt-5-mini`
- Optional Supabase edge function auth passthrough:
  - `SPECIES_PREDICTION_N8N_AUTH_HEADER`
  - `SPECIES_PREDICTION_N8N_AUTH_VALUE`
  - `SPECIES_PREDICTION_TIMEOUT_MS`

## Workflow Nodes
1. `prediction_request`
- `Webhook`
- Method: `POST`
- Path: `species-prediction-evidence-first`
- Response mode: `Using Respond to Webhook node`

2. `normalize_input`
- `Set`
- Keeps only species-specific request fields used by the source fetches and scoring logic.

3. `fetch_ebird_foreign`
- `HTTP Request`
- Expected to return foreign sightings for the selected species only.
- Intended normalized row shape:
```json
{
  "rows": [
    {
      "country": "latvia",
      "daysAgo": 1,
      "distanceToEstoniaKm": 120,
      "recordCount": 4,
      "lat": 57.95,
      "lon": 24.11,
      "hotspotName": "Cape Kolka",
      "countyOrParish": "Kurzeme",
      "habitatCue": "coastal migration bottleneck"
    }
  ]
}
```

4. `fetch_elurikkus_history`
- `HTTP Request`
- Expected to return species-specific historical spring fit and hotspot hints.
- Intended normalized shape:
```json
{
  "springFitScore": 74,
  "historicalHotspots": [],
  "habitatHints": ["coastal lagoons", "flooded meadows"],
  "arrivalWindow": "late March to mid April"
}
```

5. `fetch_estonia_recent`
- `HTTP Request`
- Expected to return Estonia recent status for the selected species only.

6. `fetch_weather`
- `HTTP Request`
- Expected to return route/weather support for the selected species only.

7. `merge_research_inputs`
- `Merge`
- Combines normalized request context with all source responses.

8. `calculate_species_parameters`
- `Code`
- Calculates:
  - `countryScores`
  - `externalPressureScore`
  - `springFitScore`
  - `windSupportScore`
  - `routeVector`
  - `bestEntryZone`
  - `alreadyMissedRisk`
  - `topPredictedPoints`
  - `openAIAnalysisInput`
- Rules preserved:
  - source priority is Latvia, Lithuania, Belarus, Poland, Russia
  - Finland is context only
  - exact hotspots are preferred whenever coordinates exist
  - request remains per selected species only

9. `openai_analysis_gate`
- `IF`
- Allows `prediction` requests to return directly while insight-capable requests pass through a server-side OpenAI analysis step.

10. `openai_analysis_request`
- `HTTP Request`
- Sends only the factual payload produced earlier plus `topPredictedPoints` to OpenAI.
- Uses strict JSON schema instructions.
- OpenAI may only rerank or rewrite the provided candidate points.

11. `parse_openai_analysis`
- `Code`
- Parses and validates the model response.
- Rejects any coordinate pair not already present in deterministic `topPredictedPoints`.
- Falls back to deterministic output if parsing or validation fails.

12. `merge_openai_analysis`
- `Code`
- Mirrors successful OpenAI summary into top-level `insightSummary`.
- Adds `analysisVersion`, `analysisFallbackUsed`, `confidenceNote`, `warnings`, `rerankedTopPredictedPoints`, `consistencyChecks`, and `openaiAnalysis`.
- Keeps all existing deterministic fields unchanged.

13. `final_response`
- `Respond to Webhook`
- Returns the JSON payload expected by the Supabase edge function.

## OpenAI Constraints
- Only use the provided evidence payload.
- Never invent extra countries, coordinates, hotspots, or sightings.
- Only reorder or adjust the provided deterministic candidate points.
- Keep the summary short and useful for birding in the field.
- If the signals are contradictory, flag that clearly in `warnings` and `confidenceNote`.
- If OpenAI fails, return the deterministic result with `analysisFallbackUsed: true`.

## Expected Webhook Request
The edge function posts this shape:
```json
{
  "requestType": "prediction_and_insight",
  "species": {
    "key": "anser-albifrons",
    "name": "Suur-laukhani",
    "latinName": "Anser albifrons"
  },
  "settings": {
    "speciesKey": "anser-albifrons",
    "speciesName": "Suur-laukhani",
    "scope": "linnuliigid",
    "enablePrediction": true,
    "enableResearchInsights": true,
    "useEbirdForeignSightings": true,
    "useElurikkusHistory": true,
    "useEstoniaRecentRecords": true,
    "useWeatherWind": true,
    "useLatvia": true,
    "useLithuania": true,
    "useBelarus": true,
    "usePoland": true,
    "useRussia": true,
    "useFinlandContextOnly": true,
    "predictionMode": "precise_hotspot",
    "outputCount": 5,
    "searchRadiusKm": 35,
    "hotspotRadiusKm": 5,
    "hotspotCount": 5
  }
}
```

## Expected Response
This must stay stable because the app and edge function already normalize it:
```json
{
  "speciesKey": "anser-albifrons",
  "speciesName": "Suur-laukhani",
  "generatedAt": "2026-03-12T14:05:00.000Z",
  "externalPressureScore": 72,
  "springFitScore": 76,
  "windSupportScore": 68,
  "routeVector": "latvia->estonia SSE",
  "bestEntryZone": "Southwest Estonia",
  "alreadyMissedRisk": "low",
  "countryScores": {
    "latvia": 82,
    "lithuania": 61,
    "belarus": 33,
    "poland": 28,
    "russia": 19,
    "finlandContextOnly": 11
  },
  "topPredictedPoints": [],
  "insightSummary": "Southwest Estonia still looks best, especially wet coastal stopovers backed by Latvia pressure and supportive SSE winds.",
  "analysisVersion": "openai_v1",
  "analysisFallbackUsed": false,
  "confidenceNote": "Confidence is moderate because the route setup is supportive, but Estonia still has limited recent presence.",
  "warnings": [
    "Recent Estonia confirmations are still sparse."
  ],
  "rerankedTopPredictedPoints": [],
  "consistencyChecks": {
    "routeLooksPlausible": true,
    "timingLooksPlausible": true,
    "weatherLooksSupportive": true,
    "foreignPressureMatchesNarrative": true
  },
  "openaiAnalysis": {
    "analysisVersion": "openai_v1",
    "insightSummary": "Southwest Estonia still looks best, especially wet coastal stopovers backed by Latvia pressure and supportive SSE winds.",
    "confidenceNote": "Confidence is moderate because the route setup is supportive, but Estonia still has limited recent presence.",
    "warnings": [
      "Recent Estonia confirmations are still sparse."
    ],
    "rerankedTopPredictedPoints": [],
    "consistencyChecks": {
      "routeLooksPlausible": true,
      "timingLooksPlausible": true,
      "weatherLooksSupportive": true,
      "foreignPressureMatchesNarrative": true
    }
  },
  "rawResearchPayload": {}
}
```

## What Still Needs Real External Setup
- Replace all placeholder source URLs:
  - `REPLACE_EBIRD_FOREIGN_ENDPOINT`
  - `REPLACE_ELURIKKUS_HISTORY_ENDPOINT`
  - `REPLACE_ESTONIA_RECENT_ENDPOINT`
  - `REPLACE_WEATHER_ENDPOINT`
- Configure credentials or signed headers for those sources if needed.
- Configure OpenAI credentials in n8n and map `OPENAI_API_KEY`.
- Optionally set `OPENAI_MODEL` if you do not want the default `gpt-5-mini`.

## Notes
- This workflow artifact does not change the app contract.
- The app still talks only to the Supabase edge function.
- The edge function still talks only to the n8n webhook URL set in Supabase env.
- The frontend never calls OpenAI directly.
- Use a unique webhook path for the OpenAI workflow so production cannot accidentally route back to the older starter workflow.
