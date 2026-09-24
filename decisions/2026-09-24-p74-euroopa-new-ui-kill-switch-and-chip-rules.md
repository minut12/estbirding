# P74 — Euroopa new UI: kill-switch and country-chip rules

Commits: `af0c247` (P74a rename), `da75ce7` (P74b sidebar), `1ddc27e` (P74c pins + cards).

The Euroopa new UI (`public/maps/europe/index.html`) is layered on top of the classic page. The old markup stays in place but hidden. The `euNewUi` script replaces `rowHTML`, `render`, `updateMarker` and `makeIcon` only when `sb-classic` is off. The `estbirding.sidebarUi=classic` kill-switch is its own `<script>` in `<head>`, so classic never flashes the new layout. With the switch on, classic runs untouched code: the old rows, the avatar markers, the `bindPopup` strings and the `zoomend` rebuild.

A country chip swaps `p.regions` to the chip's region only for the length of each synchronous `updateMarker` call and restores it in `finally`. Nothing saves in between. Under a chip, the pin (country code plus that country's 7-day count) and the popup card are per-country in both marker modes.

Kõik counts only species seen in the last 7 days (286). "Ainult viimased 7 päeva" also filters the list, and when it is off the list shows all species (445). Pins stay a fixed size (the `zoomend` rebuild is classic-only). Markers are re-positioned with `m.update()` only on `moveend` inside a 1.5 s window after a locate click or a popup opening. This fixes pins left in the wrong place when a `flyTo` is interrupted by popup auto-pan.

Open items:
- Not yet checked signed in at `127.0.0.1:8080` (real avatars, rarity, scientific names).
- Kristian's push, then a desktop and phone check on `main--estbirds.netlify.app`.
- `europe_ebird_cache` is not used by the iframe.

## P75 — eBird checklist links and automatic "rändel"

Commits: `67ff271` (P75a subId), `46eb074` (P75b+c links + rändel).

Rulings (Kristian, 24 Sep):
1. "rändel" comes automatically from the Rändeajad histograms. There is no manual toggle.
2. The card tile shows `kevad`, `sügis` or `—`, depending on which window is active this week.
3. The same signal turns the country chips in the row (`.mig`) and the pin tag green.
4. The card's "Ava eBirdis" opens the checklist (`https://ebird.org/checklist/<subId>`) of the card's own region. For the aggregated card that is the region shown as "viimati", so the link and the label always agree. Without a `subId` it falls back to the species page.
5. The row-detail "Ava eBirdis" opens the newest checklist across countries (`euNewestRegion`: `tMs`, falling back to `t`), with the same fallback.
6. Released together with P74. Claude checks the desktop on `main--`, Kristian checks his phone.

`subId` storage: `refreshEuropeAggregated` stores `subId` (capped at 32 characters) per region and in `latest`. `compactPoints` keeps it only per region; `latest` and `tMs` are deliberately still not saved. Points saved earlier have no `subId` until the next "Uuenda eBirdist". `SNAPSHOT_VERSION` is unchanged.

Cache is read-only: Euroopa only reads `bm_randeajad_v3`, which linnuliigid owns. It never writes it and never fetches histograms. A cache that is missing, malformed or 7 or more days old means no signal, and everything renders as before (`—`, no green). Classic still reads only `p.migration`, which nothing ever sets.

Open item: during P75 testing, anon calls to the `get_species_week_histograms` RPC returned `500 57014` (statement timeout). On `main--` the real cache had 399 keys and was 24 h old, so it isn't blocking. But if the RPC keeps timing out, the cache will stop refreshing once its 7-day TTL runs out, and "rändel" will silently go back to `—`.

## P76 — curated migration windows for rarities

Commits: `ae54502` (P75d teadmata tile), `37552b7` (P76 curated windows).

Rulings (Kristian, 24 Sep 13:56):
1. The data source for rarities is a curated JSON file in the repo, reviewed by Kristian. No DB, no Storage, no species-meta change.
2. Precedence: the Estonian histogram comes first. When it classifies the species (`migrant`, `resident` or `winter`), that result wins. The curated window is used only when the histogram gives `few` or has no entry for the species.
3. Card tile: `kevad` / `sügis` when a window from either source is active this week; `—` when a source knows the species but no window is active; `teadmata` (tooltip "Rändeaja andmed puuduvad") only when neither source has it, or the curated entry has both halves `null`.
4. The same signal drives the row chips and the pin tag (green only for kevad/sügis).
5. Released separately, after P74/P75 go to production.

File: `public/maps/shared/migration-windows.json` (UTF-8, no BOM, LF). Its layout is `species["<Estonian name>"] = { "spring": [a, b] | null, "autumn": [a, b] | null }`. Weeks run 1–52 in the same non-leap numbering as `randeajad.js`, and the bounds are inclusive. The `euRandel` IIFE fetches the file once (`cache: "force-cache"`) and calls `render()` once when it arrives. Classic never fetches it. If the fetch fails, it logs `[eu-randel] windows load failed` and everything behaves as P75d. `window.__euRandelSource(name)` returns `"hist" | "curated" | null` and is only meant for checking.

Editing the JSON later:
- Keep the key spelling identical to the species name in the list. Names are matched after mojibake repair, NFC normalisation and lowercasing, so case doesn't matter.
- Windows must not wrap past week 52 (`R.isNow` has no wraparound): split a Dec–Jan window or cap it at 52.
- Setting both halves to `null` gives `teadmata` on purpose. Leaving the species out gives the same result unless the histogram knows it.
- Browsers may keep serving the old file from cache (`force-cache`) until the cache expires or the user does a hard refresh. Bump the filename or add a `?v=` to `MW_URL` if a change must show up immediately.

Open item: on first load of the standalone page, the eBird `recent` data for all 7 countries (FI/SE/LV/LT/PL/BY/RU) was fetched 4 times in about 20 s (32 requests) and then stopped. This was seen during P76 testing and was there before P76. Probably existing refresh/retry logic; not yet investigated.

## P77 — flag pin tags, eBird comment and recent obs on the per-country card

Commits: `1f0e33c` (P77a helpers), `24ae8e9` (P77b flags), `92d5a2f` (P77b2 pin "1 RIIK"), `91d093f` (P77c card), `5f42f51` (Aedporr code), `f3dc9ed` (P77b3 card tag "1 riik").

Rulings (Kristian, 24 Sep):
1. Flags: in Riigiti mode, and in Uusim riik under a country chip, the pin tag shows an inline-SVG flag (CSS data URI, `.euf-<cc>`) with `title="<Estonian name> (CC)"`. Uusim riik without a chip keeps the text tag (`N RIIKI`, singular `1 RIIK`). Row chips and the card band tag keep text. The flag tag has `pointer-events:auto` so the title tooltip works; a click still opens the marker popup. The frame keeps the tag colour, so a rändel species gets a green frame.
2. Comment box: per-country card only, only for `rarityLevel` rare/super/mega, and only when the region has a `subId`. On `popupopen` it fetches `GET /v2/product/checklist/view/<subId>` and shows `obs[].comments` for the card's `speciesCode`. It hides (`is-off`) when there is no comment or the fetch fails.
3. Recent list: per-country card only. On `popupopen` it fetches `GET /v2/data/obs/<CC>/recent/<speciesCode>?back=7`. eBird returns the newest obs **per location**, so the list means "where it was seen in the last 7 days", with one row per place, newest first, max 5. The list is shown only with ≥ 2 rows, and then the Koht row is hidden. Rows link to `https://ebird.org/checklist/<subId>`. Time is `dd.mm HH:MM`, or `dd.mm` when eBird gives no time; it is sliced from the string, not parsed. `locationPrivate` rows keep the name as eBird shows it and add `title="Privaatne asukoht"`.
4. The aggregated card and classic are unchanged, apart from the card tag reading "1 riik".

Why not in the refresh: `GET /v2/data/obs/<CC>/recent` (the refresh feed) returns only one row per species per country, so a "last 5" list can't be built from it. The first P77a attempt did that and was reverted before commit. P77 leaves the snapshot and localStorage alone: no `recent` in `compactPoints`, and `SNAPSHOT_VERSION` is unchanged.

Cache: `euChecklistComment` (key `subId`) and `euRecentObs` (key `CC:code`) are in-memory `Map`s for the page session, with one in-flight promise per key. Failures are cached as `null`, so each key is fetched at most once per session. Both call `safeFetchJson` with `timeoutMs: 8000, retries: 1`. Note that `safeFetchJson` treats `retries: 0` as the default of 2.

Popup gotcha: markers use `bindPopup(function)`, so `popup.update()` re-renders the card and throws away anything filled in asynchronously. After filling, the handler calls `popup._updateLayout()` + `popup.setLatLng(popup.getLatLng())` instead (a private Leaflet 1.9.4 method, guarded). Use the same approach for any future async fill.

Data fix: Aedporr (Short-toed Treecreeper) is `shttre1`. The Euroopa table had `shtre1`, which returns `400`. `src/lib/defaultEbirdCodes.ts` still has `shtre1`; that is outside P77 and not fixed yet.

Known limitation: the card's stats ("1 vaatlust 7 p") come from the refresh feed (one row per species per country), while the list comes from the per-species call. A card can show "1 vaatlust" above a list of 5 locations. Accepted; no code change.

Open item: "Ainult haruldased" (`#euSwRare`) was on after every reload in the test browser, so the map started empty. It is not yet known whether this is a saved setting or a default flipped by some change. Kristian checks on `main--`.
