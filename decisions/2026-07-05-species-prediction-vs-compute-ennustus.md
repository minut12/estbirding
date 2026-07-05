# species-prediction vs compute-ennustus — distinct features

**Status:** Accepted · 2026-07-05
**Scope:** Disambiguating two similarly-named Supabase EFs so Phase C doesn't duplicate or disturb the wrong one.

## Decision / fact
- **`species-prediction` EF** = migration-ETA arrival system. Writes `prediction_jobs`; built on `migrationEta` / `globalMigrationEtas` / `predictedTargets`.
- **`compute-ennustus` EF** (Phase C) = map-scan probability compute. Writes `ennustus_cache`; a port of `calculateProbabilities`.

Distinct features, **zero overlap** — verified by grep: `species-prediction` has **0** references to `ennustus_cache` / `gbif_occurrences` / `elurikkus_observations` / `calculateProbabilities`. `compute-ennustus` duplicates nothing here; there is nothing to extend or retire in `species-prediction`.

## Why this note exists
The naming similarity ("prediction" / "ennustus") invites the assumption that `species-prediction` is prior server-side probability work. It is not. This finding evaporated repeatedly across chat round-trips; recorded here so it stays settled.

## Relates
Phase C of "Tõenäosus compute → server-side" (A–D). Companion to the source-split, gbif-partial-date-coercion (+ Resolution), cadence/parity-contract, and port-fidelity-gotchas notes.
