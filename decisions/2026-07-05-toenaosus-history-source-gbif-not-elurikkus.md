# Tõenäosus HISTORY source: GBIF, not elurikkus_observations

**Status:** Accepted · 2026-07-05
**Scope:** Server-side Tõenäosus compute (Phase C), HISTORY component only.

## Context
Moving the Tõenäosus probability scan server-side requires a HISTORY signal — per-cell, multi-year occurrence density that establishes *where a species reliably occurs* — computed on a 0.1–0.2° grid. Two server-side sources were candidates:
- `elurikkus_observations` — already present (10 yr nominal, 2×/day refresh, centroid-resolved coords).
- GBIF Estonia occurrences — not yet stored server-side; the source the production **client** already uses for HISTORY.

## Decision
HISTORY sources from **GBIF's Estonia 10-year occurrences** (new `gbif_occurrences` table), **not** `elurikkus_observations`. elurikkus is retained — but only as the **FRESHNESS** source (recent ≤7-day obs), which is what it is actually good for.

## Rationale — A0 audit, 2026-07-05 (read-only, via `query_database`)
`elurikkus_observations` is a **recent-window table, not a history corpus**:
- 106,406 rows / 397 species, earliest date 2000 — but **~97% of rows fall within the last 12 months**.
- **219 of 397 species (55%) have zero observations older than one year**; only **65 (16%)** span ≥5 distinct years.
- Rare/resident tail is single-year (`elu_years = 1`): Värbkakk, Laanepüü, Mänsak, Väike-kirjurähn, Valgeselg-kirjurähn — exactly the species HISTORY exists to stabilize.
- ~15% of rows have no coordinates; those that do are resolved to **county/municipality centroids** — too coarse for a 0.1–0.2° grid.

GBIF, by contrast, carries **precise coordinates across the full 10-year window** and is already the live source the production client computes HISTORY from. The gap elurikkus leaves is precisely what GBIF fills.

## Implementation
- `gbif_occurrences` — per-observation rows (`species_name, species_lat, gbif_key, observed_at, lat, lon`), idempotent on `gbif_key`.
- Fed by Edge Function `gbif-bulk-refresh` (GBIF has no Supabase 418 block, so an EF is fine), **n8n-triggered** — Supabase has no `pg_cron`/`pg_net`, so all scheduling stays in n8n (twice-daily Schedule + webhook pattern, consistent with the existing feeders).
- `gbif_taxon_keys` caches `scientificName → usageKey` with a manual **`override`** flag, so GBIF synonym drift (e.g. `Ardenna grisea`, `Branta bernicla`) is correctable without re-matching.
- Species/match call uses `&kingdom=Animalia` (parity with client `index.html:8626`) to avoid wrong-kingdom homonym matches.

## Consequences
- HISTORY quality is now bounded by GBIF EE coverage; requires the GBIF ingest to backfill and periodically top up (HISTORY is slow-moving → weekly refresh, not twice-daily).
- `elurikkus_observations` stays in the pipeline for FRESHNESS only; Phase-C compute reads both sources.
- Part of the broader "Tõenäosus compute → server-side" plan (Phases A–D). Data-quality byproducts logged during A0: 29 elurikkus species with no coordinates; a future-dated `latest_obs` (parse/date bug) — both parked.
