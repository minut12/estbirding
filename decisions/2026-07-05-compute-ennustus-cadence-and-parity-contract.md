# compute-ennustus: cadence + server/client parity contract

**Status:** Accepted · 2026-07-05
**Scope:** Phase C server-side Tõenäosus compute (`compute-ennustus` EF) — scheduling and the parity-verification contract.

## Decision — cadence
`compute-ennustus` runs **2×/day, ~07:00 and ~19:00** (each ~55 min after the 06:05 / 18:05 `elurikkus` refresh, so the new FRESHNESS is guaranteed in place before compute reads it).

**Rationale.** FRESHNESS is the only fast-moving input and carries 35% of the composite weight; HISTORY (GBIF) is weekly and SEASON is slow. Under a once-daily cadence, a bird appearing at the 18:05 elurikkus refresh would wait ~13h to surface — for a "where can I see it now" product an evening sighting reflected by ~19:00 is real user value. Cost is bounded (batched, ~90 chunks at `batch_size` 5).

## Decision — parity-check contract
Server output **legitimately differs** from a live client scan on three axes. These are correct-by-design, not bugs, and Phase-C step-3 verification must expect them:

1. **FRESHNESS scores every cell, not one.** The client credited only the single cell of the one elurikkus marker it had coordinates for. The server has *all* elurikkus obs with coordinates, so FRESHNESS now scores every cell with recent obs — a genuine improvement.
2. **SEASON drops GBIF Jan-1 records.** The client reads GBIF live (real partial dates); the server reads the coerced `gbif_occurrences` table and excludes `month=1 & day=1` from SEASON (see the gbif-partial-date-coercion note). Divergence shows up on winter species.
3. **Five species have no server FRESHNESS.** `Aed-lepalind`, `Jäälind`, `Koduvarblane`, `Taiga-rabahani`, `Turteltuvi` are absent from the elurikkus feeder's `DEFAULT_SPECIES`, so server-side they get HISTORY+SEASON but `FRESHNESS = 0` permanently, while the client fetches elurikkus live for any species. Expect a lower/zero-freshness server score on exactly these five.

A mismatch on these three axes is expected. Any *other* axis of mismatch is a real port defect.

## Accepted transient — co-writer window
During Phase C both the server (scheduled) and the client Jaga blind-upsert `ennustus_cache` on `species_name` with no prefer-newer/server guard. A user who triggers a client scan between scheduled runs transiently overwrites the better server value (all-cell freshness) with the inferior single-cell client value, until the next scheduled run re-corrects. Low-stakes and self-healing; **closes in Phase D** when the iframe goes read-only and Jaga is retired. Named here so it isn't misread as a compute bug during parity-checking.

## Build guard (recorded for the port)
The FRESHNESS query uses a **rolling `observed_at >= now() - interval '7 days' AND observed_at <= now()`** window (timestamp, matching the client's rolling-ms `ageDays` — not a `current_date` day boundary). The upper clamp guards the parked future-dated `latest_obs` bug (A0 audit) from sitting permanently inside the fresh window at 35% weight. No-coordinate elurikkus obs (~29 species) simply don't grid and drop from FRESHNESS, as expected.

## Relates
Phase C of "Tõenäosus compute → server-side" (A–D). Depends on the source-split note (HISTORY=GBIF / FRESHNESS=elurikkus) and the gbif-partial-date-coercion note (its Resolution section).
