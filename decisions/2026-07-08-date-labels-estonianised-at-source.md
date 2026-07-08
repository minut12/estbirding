# Date labels Estonianised at source (Item 2, Fix 2)

**Status:** Done · 2026-07-08 (commit `6612983`)
**Scope:** the two English date-label emitters in `public/maps/linnuliigid/index.html`: `getSeasonPeriods` (`months[]` @~11984, label build @~12001) and the season formatters `formatSeasonWindow` / `calculateSeasonFromData` (@~11871/11900/11917). Fixing the source Estonianises the popup, sidebar, curve labels, and density ticks **together**.

## Decision / fact
Both emitters now produce Estonian; `_etDateLabel` (the popup translator) is left in place but is now inert.

- **`getSeasonPeriods` `months[]`** → Estonian **full** names (`jaanuar … detsember`, `märts`).
- **Period label format** → **collapsed**: same month `17.–31. juuli`; cross month `31. juuli–14. august` (en-dash U+2013). Built into `_lbl` before the object push; `label: _lbl`.
- **Season formatters** → `toLocaleDateString('et-EE', { month: 'long', day: 'numeric' })` (not `'short'` — ICU `et` short is mixed: `juuni` full but `aug`/`sept` abbreviated, which clashes with the full-name period labels; `'long'` gives `10. juuni – 20. august`, consistent).

## Invariant (binding — the double-process trap)
`_etDateLabel` (12543–12550) is now a **passthrough** for every label the app produces. Its two regexes (`(\d{1,2})\s+([A-Za-z]{3})…` and `([A-Za-z]{3})[a-z]*\s+(\d{1,2})`) require an ASCII-month **directly digit-adjacent across whitespace**, which the `DD.–DD. kuu` / `DD. kuu – DD. kuu` shape never presents (the day is followed by `.`, and the ` – ` separator is en-dash-with-spaces). Verified: all 12 `et-EE {month:'long'}` months and all period labels round-trip **identical** through `_etDateLabel`.

**Do NOT re-introduce English-month emission at any label source** (`months[]`, either season formatter, or any new one). English `08 May` / `17 Jul` would make `_etDateLabel` match and **double-process** in the popup while the sidebar (no translator, out of scope) stays English — the exact split this fix closed. Leave `_etDateLabel` and the popup call sites (12575/12650/12729/12761) alone.

## Why this note exists
The fix is **value-only** on the existing `label` field → **no serializer/widen contract touch** (`compute-ennustus/index.ts:649` ↔ `index.html` widen). That invisibility is the risk: a future "just format the date here" edit at a label source could silently resurrect English and the double-process bug, with no type/shape signal.

## Relates
Sibling of the [[2026-07-08-trend-chip-mean-aggregate-metric]] `.probability`-not-`.pct` landmine (both are popup-vs-sidebar scope traps). The density month ticks in [[2026-07-08-curve-density-polish]] pick up the Estonian months automatically via their first-letter-run parser. Supersedes the earlier popup-only `_etDateLabel` retrofit as the single source of truth.
