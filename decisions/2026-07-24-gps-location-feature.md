# GPS location feature — architecture & decisions (2026-07-24)

**Request:** Add opt-in GPS positioning. Activate in Settings ("allow gps positioning"); once on, available only on **Linnuliigid (EE)** and **USA maps incl. POI**. On use, zoom in like Google Maps.

**Delivered as:** 3 Claude Code `.md` prompts (locate-first, one concern each). All repo/frontend work — no Supabase/n8n. Mockup delivered before UI change.

## Inferred decisions (user declined the multiple-choice gate; proceeded on intent)
- **Map scope (7):** `linnuliigid`, `usa-co`, `usa-pa`, `usa-i70`, `usa-co-poi`, `usa-pa-poi`, `usa-i70-poi`. Excludes `europe`, `rariliin`. Scoping is enforced by *which maps include the module* — no per-map gate logic.
- **Propagation:** postMessage, mirroring the existing `SUPABASE_CONFIG` channel (respects "I/O flows through the React parent"). Not URL param, not shared localStorage.
- **Behavior:** one-shot locate → `flyTo(Math.max(currentZoom, 16))` (never zooms out) + blue dot + accuracy circle; re-tap re-centers. Not continuous `watchPosition`.
- **Native Android:** web/PWA first. Native WebView geolocation (AndroidManifest `ACCESS_FINE_LOCATION` + `onGeolocationPermissionsShowPrompt`) is a **separate follow-up**, not in these prompts.

## Contract (postMessage)
- Parent → iframe: `{ type: 'GPS_CONFIG', enabled: boolean }`
- iframe → parent on boot: `{ type: 'GPS_CONFIG_REQUEST' }` → parent replies with `GPS_CONFIG`.

## Files / anchors
**Prompt 1 (data+primitive):** `src/lib/settings.ts` (add `gpsEnabled:false` + `isGpsEnabled()`); new `src/config/gpsConfig.ts` (`broadcastGpsConfigToMapIframes()`, mirrors `broadcastSupabaseConfigToMapIframes`).
**Prompt 2 (UI+wiring):** `SettingsTab.tsx` — Switch-row card in `renderSettingsHome()` **outside** `canManageSettings` (user-level), handler saves + broadcasts. `MapTab.tsx` — `sendGpsConfig` useCallback; `GPS_CONFIG_REQUEST` branch next to `SUPABASE_CONFIG_REQUEST` (~L348); `setTimeout(sendGpsConfig, 395)` in `handleLoad` (~L828); add `allow="geolocation"` to `<iframe data-map-iframe>` (~L1123, previously only `sandbox`).
**Prompt 3 (map control):** new `public/maps/shared/gps-locate.js` exposing `window.EstGps.init(map, {mapId})`; per map: one `<script src="/maps/shared/gps-locate.js">` include + one `window.EstGps.init(map, …)` expression right after `L.map(...)`.

## Map structure notes (verified via Lovable read)
- **Species maps** (`linnuliigid`, `usa-co/pa/i70`): `/maps/shared/*.js` block before a top-level classic main `<script>`. `linnuliigid` exposes `window.map` (L883); `usa-co` `const map` (L1735), `usa-pa` (L1727), `usa-i70` (L1752).
- **POI maps** (`*-poi`): Leaflet in `<head>` (JS @ L8) + single IIFE (@ L155); `var map` closure-scoped (@ L206/207/208). `usa-i70-poi` has an inner `drawI70Route` IIFE @ L216 — init targets the **outer** map (@L211, after `setView` @L209, before the inner IIFE). All 3 POI maps init with `attributionControl: true` (bottom-right) — see overlap risk below.
- None had pre-existing geolocation. Each already has a `message` handler switching on `ev.data.type`.

## Footgun compliance
All new logic in the shared file; per-map edits are only an include + an init **expression inside the existing main `<script>`** (no new top-level `let`/`const`, no new `<script>` tag). Does not touch `loadSpeciesMeta`, `window.points`/`__bm_points`/`pt()`, `_applySnapshot`, snapshot keys, cron/cooldown.

## Estonian copy (MCP-verified — spell + morphology)
- Toggle: **Luba GPS-asukoht** · desc **Näita minu asukohta Linnuliigid (EE) ja USA kaartidel.**
- Button: **Minu asukoht** · locating **Otsin asukohta…** · denied **Asukoha luba on keelatud** · error **Asukohta ei õnnestunud tuvastada**
- Toasts: **GPS-asukoht on lubatud** / **GPS-asukoht on välja lülitatud**

## Implementation status (2026-07-24 · branch `feat/gps-location`, pushed to origin)
Commits (4): `56f65ea` P1 (settings+helper) → `d7f8d6e` P2 (toggle+propagation) → `e20eea4` P3 (map control) → `61df499` docs (this note). `origin/feat/gps-location` in sync; branched off `main` @ `a56f958`.
- **Prompt 1:** vitest green (default-off, save→isGpsEnabled round-trip, legacy-blob fallback, broadcast smoke); `tsc --noEmit` clean on changed files.
- **Prompt 2:** `tsc` clean on changed files. Local dev-server runtime **not** obtained — pre-existing `@lovable.dev/mcp-js` missing from `node_modules` breaks `vite.config.ts` (both `vite build` and `vite dev`). Not fabricated.
- **Prompt 3:** `node --check` on the module; headless Chromium over a static `public/` server — all 7 maps: `window.EstGps` present, map inits, FAB `none→flex` on `GPS_CONFIG {enabled:true}`, 0 console errors; **linnuliigid no white-screen**; `usa-i70-poi` outer-map trap cleared; tap → `Otsin asukohta…` toast + button-disabled, no throw. `git status` = only the 7 `index.html` + the shared file; `europe`/`rariliin` untouched. Audited against this note post-commit — all anchors present, line-for-line match.

## Pending verification (real device / Lovable preview — headless can't grant OS geolocation)
- Actual fix → blue dot + accuracy ring + zoom-in to ~z16; re-tap re-centers.
- Denied path shows **Asukoha luba on keelatud**.
- **POI maps FAB-vs-attribution overlap (priority):** the 3 POI maps show Leaflet's `attributionControl` bottom-right; the FAB also sits bottom-right (14px). Species maps don't carry that control, so the risk is POI-only. Check first. Trivial fixes if it overlaps: (a) move attribution to `bottomleft` on those maps, or (b) lift the FAB `bottom` offset in `gps-locate.js`.
- Confirm `europe`/`rariliin` show **no** button; toggle-off clears the dot + hides the button.

## Known pre-existing blocker (unrelated to this feature)
`@lovable.dev/mcp-js` missing from `node_modules` breaks local `vite build`/`dev`. Sole source of the 4 pre-existing `tsc` errors in `src/lib/mcp/*`. Separate one-concern fix if wanted.

## Open follow-up
Native Android geolocation wiring (AndroidManifest permission + WebView `onGeolocationPermissionsShowPrompt`). Tracking issue to be filed on the repo.
