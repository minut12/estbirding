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
