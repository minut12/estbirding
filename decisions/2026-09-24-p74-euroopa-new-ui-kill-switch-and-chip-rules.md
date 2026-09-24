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

## P78a — eBird media counts strip on the per-country card

Commit: `164cbc6`.

Rulings (Kristian, 24 Sep):
1. Info only: a strip with the photo / audio / video counts for this species from the card's checklist, plus a "Vaata eBirdis" link to the checklist. No thumbnails; those are P78b, which waits on a Macaulay Library probe.
2. All species, not only rarities. Per-country card only, and only when the region has a `subId`. The aggregated card and classic are unchanged.
3. The data comes from the checklist call P77c already makes (`product/checklist/view/<subId>` → `obs[].mediaCounts` `{P, A, V}`, matched on `speciesCode`). A rarity card showing both the comment box and the strip makes one request per checklist.
4. The strip stays hidden (`is-off`) when all counts are 0 or missing, or the fetch fails. It sits between the comment box and the recent list.

Cache shape change: `euChecklistCommentCache` now stores **every** species in `obs[]` as `{code: {c: comment or "", m: {p, a, v}}}`, where it used to store `{code: comment}` for commented species only. `euChecklistCommentPick` returns `c`, or `null` when `c` is empty, so the P77c contract is unchanged. The new `euChecklistMedia` / `euChecklistMediaPick` return `m` only when `p+a+v > 0`. Cache, in-flight and retry behaviour is unchanged.

`#euStr` keys are `data-photos1`, `data-audio1` and `data-video1`, not `data-photos-1`. The browser keeps the `-1` in the key, so `STR.photos1` would not find `data-photos-1`.

Open items:
- The audio and video icons are untested; no checklist in the test data had audio or video.
- Lumehani FI (`S395292982`) is flagged `exoticCategory:"X"`, `present:false` in the checklist, so an escapee shows as an SR pin. The recent feed carries no exotic flag, so a filter could only come from the checklist call, which runs only when a card opens. This is a P79 locate candidate; nothing changes now.

## P79 — Euroopa lag: species meta memo, pins without CSS filters

Root cause (measured in Kristian's Chrome on `main--`, 24 Sep): one `render()` took 985 ms, and it runs on every row expand, switch, chip, filter input, parent meta message and auto-sync chunk. One render made **1,345 `getSpeciesMeta()` calls**. Each went through `getSpeciesMetaShared` → `loadSpeciesMeta()`, which parses the ~98 KB `estbirding.speciesMeta.v1` JSON, sanitises ~450 entries and **writes it back to localStorage** (about 0.65 ms per call). The P74 sweep, card build and marker count were not the cause.

P79a: `getSpeciesMeta` memoises the loaded map, keyed on the stored JSON string. It reloads only when the string changes, and the key is re-read after the load because `loadSpeciesMetaShared()` may rewrite it into normalised form. `species-meta.js` is not touched: it is shared with Linnuliigid, and its `loadSpeciesMeta` name collides with the React one. Sequence: the memo was measured live in Kristian's Chrome first (`render()` 783 ms to 29 ms) and applied to the repo afterwards, as the throttled variant: `__euMetaChecked` limits the staleness check (one `getItem` of the stored string) to once per 100 ms, so a changed meta shows up in lookups at most ~100 ms after the write. Re-verified locally (static server, tab in front, 900 pins, seeded 125 KB meta): `render()` 1,340 ms before vs 55-64 ms after, `loadsPerRender` 0, meta `getItem` per render 2,325 before vs 0-1 after; a changed rarity was returned 100 ms after the write, and the restore came back too.

P79b: the new-UI pins no longer use CSS filters. `.bm-pin-tip` drops `filter:blur(1px)` for a radial-gradient shadow. `.bm-pin.is-old .bm-pin-head` drops `filter:grayscale(.75)`, keeps `opacity:.8` and gets `background-color:#b9c4bd`, so an old pin with no avatar still reads grey. The card's `.bm-sc-wash` blur stays, because it is one element per open popup. FPS probe (local static server, tab in front, 900 pins in Riigiti, zoom 6, 1.6 s `flyTo`):

| | fps | worst frame | p95 | frames > 50 ms |
|---|---|---|---|---|
| before (3 runs) | 34 / 34 / 37 | 98 / 78 / 76 ms | 80 / 66 / 62 ms | 25 / 28 / 29 |
| after (3 runs) | 31 / 31 / 30 | 86 / 70 / 93 ms | 67 / 65 / 85 ms | 29 / 27 / 23 |
| same page, A/B with the old filters | 34 / 25 / 27 | 86 / 90 / 90 ms | 82 / 81 / 82 ms | 24 / 26 / 25 |
| same page, A/B without | 26 / 33 / 26 | 89 / 92 / 91 ms | 84 / 80 / 63 ms | 26 / 26 / 27 |

The filters were not the pan bottleneck: the difference is inside run-to-run noise. The change is neutral on frame rate, but it is strictly less compositor work and has no visual regression, so it is kept.

P79c (render list-only, so markers aren't rebuilt on every render) is skipped: after P79a, `render()` is 29 ms, well under the 150 ms threshold.

Open items:
- Linnuliigid's P73 freeze is probably the same path. `linnuliigid/index.html:806` and `rariliin/index.html:303` also load `species-meta.js`, and every `getSpeciesMetaShared` call there still does the parse plus write-back. Fixing it in the shared file would help both pages, but that file is off-limits until the `loadSpeciesMeta` name collision is handled.
- At ~900 pins the pan cost comes from the Leaflet DOM markers themselves. Deferred to a later viewport-culling/cluster phase.
- The P79a memo re-reads the ~98 KB string with `getItem` at most once per 100 ms, to compare it with the memo key. A version counter or storage-event invalidation would remove even that.
