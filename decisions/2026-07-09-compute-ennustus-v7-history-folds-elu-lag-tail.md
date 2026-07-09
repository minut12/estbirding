# compute-ennustus v7 — HISTORY folds the eElurikkus lag-tail

HISTORY was deliberately GBIF-only through v6 (gotcha #5, [[2026-07-05-compute-ennustus-port-fidelity-gotchas]]) to keep the server port a verbatim numeric match to the client. v7 reverses that: `fetchEluHistoryTail` folds coord-bearing `elurikkus_observations` postdating GBIF's newest record per species into `allOccs`, because GBIF's ~1-year ingestion lag was leaving the current season off the map for lagged species and giving 0-GBIF species no map at all (Exit A).

Strict `> gbifMax` ⇒ zero cross-source overlap; when `gbifMax` is empty (0-GBIF species) the lower bound is dropped so all coord-bearing elu folds in. Season / confidence / centrality / `eluCount` now include the tail **by design**; weights, scoring formula, `fetchFreshness`, and the serialized-cell contract are unchanged.

**Scope:** server cache (non-admin) path only. The client admin-live compute stays GBIF-only-history until a matching client fold-in (deferred ticket).

**Verified 2026-07-09** on both branches: Põldvutt (GBIF=884, lagged) `cells_with_elu 0→45`, `n_cells 233→248`, GBIF cells preserved; Hele-urvalind (GBIF=0) Exit-A → 30-cell elu-only map, `max_prob 23` (confidence-dampened, not inflated). Blast radius: ~320 of 397 elu species carry a tail.

Links: [[2026-07-05-compute-ennustus-port-fidelity-gotchas]], [[2026-07-09-git-push-does-not-deploy-edge-functions]].
