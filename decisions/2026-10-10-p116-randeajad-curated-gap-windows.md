# P116 - Randeajad: curated windows fill halves the data cannot show (2026-10-10)

## Problem
The Randeajad rule (v5) measures passage against the June-July baseline. Species that sing in
summer and fade out in autumn (Koldvint, Kablik, most warblers) get "andmetes ei eristu" or
"selget tippu ei ole" for autumn; scarce species get "few". 211 species showed a gap.

## Rulings (Kristian, 2026-10-10)
- Scope: migrants with a missing/diffuse half + regular scarce species (>= 5 years in Elurikkus).
  Vagrants keep the "few" note.
- Curated windows fill gaps only - a data window always wins.
- Stored in git, no DB. Reused the existing P76 file `public/maps/shared/migration-windows.json`
  (Euroopa fallback) instead of a second table; `ee: true` marks the 24 regular scarce species.
- Claude drafts, Kristian reviews on main. Filled windows carry a grey "hinnang" tag.
- Kristian's examples: Koldvint autumn end of Sept (wk 39-40), Kablik autumn October (wk 40-44),
  Liiv-kivitaks autumn 01.10-12.10 (wk 40-41; P76 had 36-42).

## Draft method (74 new entries)
- bump: autumn rise above the late-summer trough (3-week rolling minimum, wk 28-38), shortest run
  holding 60 % of the excess, max 8 weeks.
- tail: weeks holding 75-95 % of autumn records (departure) for species with no bump.
- cluster: >= 3 records bunching in the half (scarce species, spring-missing migrants).
- blank when < 10 autumn records, irruptive crossbills, or records too spread.
Draft CSV: `Claude outputs/2026-10-10-randeajad-manual-draft.csv`.

## Code
- `randeajad.js`: `fillGaps(result, curated)` (pure; manual:true, no pk).
- `linnuliigid/index.html`: fetch the JSON once, apply in `buildParts`, "hinnang" tag + CSS.
- Euroopa unchanged (histogram-known species never read the curated file).
- `__randeajadKind` (Kevadranne) unchanged - data only.

## Follow-up idea
A rule v6 baseline (late-summer trough instead of June-July) would find ~20 of these autumn
windows from data. Needs an all-species width check before fixtures.
