# P46a–c — Rändeajad in the Linnuliigid sidebar (released 5912f41)

P46a–c ship per-species migration windows (Rändeajad) in the new-UI Linnuliigid sidebar, from `rpc/get_species_week_histograms`. The payload is cached as `bm_randeajad_v1` for 7 days and fetched once from the `SUPABASE_CONFIG` handler. Rule v3 replaces the presence span with the shortest run holding 50 % of the records above the summer baseline (median of weeks 23–30). Windows wider than 6 weeks, or with under 10 % excess, show "selget tippu ei ole". A curated 35-species resident list (`isResident`, checked on both the payload key and the sidebar key) overrides the data but not `few`. The classic sidebar is byte-identical, verified by a hash guard and a live DOM diff. Released fast-forward `43db824..5912f41`.

Production verification was HTTP-only (served files contain `isResident` / `selget tippu`). The full logged-in Phase 4 pass ran on main-- at the same commit; no browser pass on production.

**Open:** winter visitors show the whole presence period; Kiivitaja-type springs read "selget tippu ei ole" because breeding records outweigh the arrival; the resident list is extendable (one line per species in `RESIDENTS` in `public/maps/shared/randeajad.js`).

**Method note:** rule v2 passed its 7 hand-picked fixtures and was still wrong in the field. Any future rule change is first run across all species in SQL and the width distribution reviewed before fixtures are written.

Edits to escaped JS strings in `index.html` follow [[2026-09-19-linnuliigid-unicode-escapes-in-edits]]; classic rows stay byte-identical per [[2026-09-18-p37b-classic-rows-byte-identical]].
