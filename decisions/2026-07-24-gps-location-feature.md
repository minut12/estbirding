# GPS location feature — implementation status

**Branch:** `feat/gps-location` (3 stacked commits off `main`) · **Date:** 2026-07-24

Opt-in "show my location" control for the 7 in-app maps. Built in three surgical layers.

## Architecture / contract

- **Setting:** `gpsEnabled` (default `false`) in `src/lib/settings.ts`; reader `isGpsEnabled()`. Backward-compatible (loaded via `{...defaults, ...parsed}`).
- **postMessage contract:** parent → iframe `{type:'GPS_CONFIG', enabled}`; iframe → parent on boot `{type:'GPS_CONFIG_REQUEST'}`, parent replies with `GPS_CONFIG`.
- **Broadcaster:** `src/config/gpsConfig.ts` `broadcastGpsConfigToMapIframes()` mirrors `broadcastSupabaseConfigToMapIframes` (selector `iframe[data-map-iframe="true"]`).
- **MapTab.tsx:** `sendGpsConfig`, a `GPS_CONFIG_REQUEST` reply branch, a push in the `handleLoad` stagger (`setTimeout(sendGpsConfig, 395)`), and `allow="geolocation"` on the iframe (sandbox unchanged).
- **SettingsTab.tsx:** user-level "Luba GPS-asukoht" switch placed **outside** `canManageSettings` (every role sees it).
- **Shared control:** `public/maps/shared/gps-locate.js` — self-contained `window.EstGps.init(map, {mapId})`. Gate-driven FAB (hidden until `GPS_CONFIG enabled:true`), one-shot `getCurrentPosition` → `flyTo(max(zoom,16))` + dot/accuracy ring. Idempotent; never throws on parent broadcasts.

**Wired maps (7):** `linnuliigid`, `usa-co`, `usa-pa`, `usa-i70`, `usa-co-poi`, `usa-pa-poi`, `usa-i70-poi`. `europe`/`rariliin` untouched.

## Load-bearing invariants (footguns)

- **linnuliigid:** init MUST be an expression statement — `try { if (window.EstGps) window.EstGps.init(window.map, {…}); } catch (e) {}` on the line after `const map` — never a new `let`/`const`/`<script>` (TDZ / closure-scope crash → white-screen).
- **usa-i70-poi:** init must reference the **outer** `map` after the full `var map = …setView(…)` statement and **before** the `drawI70Route` IIFE.
- All logic lives in the shared file; per-map edits are only one `<script src>` include + one `init()` call.

## Verification done (2026-07-24)

- `tsc --noEmit -p tsconfig.app.json`: 0 errors in changed TS (only pre-existing `@lovable.dev/mcp-js` module-not-found remain).
- `node --check` on the shared module: parses.
- Headless-browser static-server sweep of all 7 maps: `typeof window.EstGps === 'object'`, map initializes, FAB `display:none` when gate off → `flex` on `GPS_CONFIG enabled:true`, tap → toast `Otsin asukohta…` + button disabled while busy, **0 console errors**, linnuliigid no white-screen.

## Deferred / out of scope

- **Real runtime confirmation on the Lovable preview** — local `vite`/`npm run dev` is blocked by the pre-existing missing `@lovable.dev/mcp-js` package (imported by `vite.config.ts`). Confirm on the deployed preview.
- **Actual GPS fix + zoom + denied-path toast** (`Asukoha luba on keelatud`) need a real device/permission prompt; headless can't grant/deny OS geolocation.
- **Native Android WebView geolocation is a separate follow-up** — WebView needs `onGeolocationPermissionsShowPrompt` + runtime location permission; the iframe `allow="geolocation"` only covers the browser/PWA path.

Estonian UI copy is MCP-verified — do not paraphrase.
