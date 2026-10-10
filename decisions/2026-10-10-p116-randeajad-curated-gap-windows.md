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

## P116b (same day) - estimates capped at 4 weeks; eBird neighbours tried and rejected
- Kristian: Halltsiitsitaja window (P76 9 apr - 3 juuni / 24 sept - 11 nov) too long.
- Every Linnuliigid estimate is now <= 4 weeks (except Kablik October, his own). P116 rows trimmed
  (departure tails keep their start; bumps take the best 4-week block).
- The 24 regular scarce species get their own `ee: {spring, autumn}` windows (best 4-week block with
  >= half of that half's Estonian records; blocks centred on weeks 25-30 dropped as summer wandering).
  Top-level P76 halves stay untouched as the Euroopa fallback. Jamejalg, Raisakotkas, Prillvaeras: no ee.
- eBird FI/LV/SE (Kristian's ask): public bar charts (48 periods, coarse levels) read via Chrome for the
  122 remaining-gap species (114 mapped; 8 subspecies skipped). With a 2-country agreement check and
  peak-only detection, 0 species gave a consistent window; looser rules put vagrant stragglers in Nov/Dec.
  Nothing added. Better input: the signed-in eBird barchartData TSV (real frequencies).

## P117 (same day) - neighbour-country eBird windows (nb)
- Kristian signed in to eBird in Chrome; barchartData TSV (real frequency + checklists per period)
  downloaded for FI, LV, SE. 130 species halves still empty; 122 mapped to eBird species (8 subspecies skipped).
- Rule: season needs >= 30 reporting checklists in a country; residents in neighbours skipped; window max
  4 weeks inside Mar-Jun / mid-Jul-Nov; take the strongest country (>= 100 reports) that has its own window,
  else the average of the countries when >= 2 agree within 3 weeks. Plain averaging failed where countries
  differ for real (Pink-footed Goose winters in SE, passes FI).
- Result: 7 windows - Korbe-kivitaks, Luhinokk-hani, Pikksaba-ann, Rohunepp, Tommu-lehelind,
  Vaike-laukhani, Vaikealk. Stored as entry.nb {spring, autumn, springCc, autumnCc}; Linnuliigid uses it
  last (data > Estonian curated/ee > nb); tag "hinnang - eBird FI/SE". Euroopa ignores nb.
