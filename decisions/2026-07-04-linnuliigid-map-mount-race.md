# Linnuliigid map -- narrow-at-mount race, desktop chrome hide, mobile revert (2026-07-04)

Scope: public/maps/linnuliigid/index.html only. All edits inside the existing main <script>; no footguns touched (loadSpeciesMeta, pt()/points, snapshot, coords guard all untouched).

## Shipped to main
- c4aa3d3  guard map against narrow-at-mount race (strip + zoom placement)
- 9815210  "fixed the map of birds" -- desktop-only hide of mobile drawer chrome. NOTE: also accidentally committed a .bak (see cb2d2c7).
- cb2d2c7  drop accidental .bak, ignore public/maps/**/*.bak
- fc67e5a  restore original mobile map behavior (UA-gated zoom + no resize guard on phones)

## Root cause
Linnuliigid is the landing view. The iframe initialises Leaflet (L.map('map'), ~line 878) before the parent flex width settles. On loads where the frame is <=900px at that instant:
- IS_MOBILE_DEVICE (one-shot const, ~line 876) latches true -> zoom pinned top-right.
- Leaflet caches a tiny container _size -> map paints as a right-hand strip even though #mapWrap is already ~1560px.
Intermittent (a race). Self-heals on ANY resize, which is why opening DevTools "fixed" it and masked every probe. Standalone (un-iframed) it is always healthy at 1920.

## Fixes
1. Sizing: map created with zoomControl:false; ResizeObserver on #mapWrap -> invalidateSize() (fires once on observe AND on every later settle) + late timers 700/1500ms. This is the piece the existing handlers lacked -- window-resize listeners and the <=260ms one-shot timers miss the layout-settle case where the element is already wide but Leaflet cached 0.
2. Zoom: reactive placeZoom() owns the single control; matchMedia-based (desktop top-left, narrow top-right).
3. Desktop chrome hide, @media (min-width:901px): "#sidebar .sidebar-header{display:none}" (close-x + empty band) and ".map-hamburger-leaflet{display:none !important}" (hamburger from shared /maps/shared/map-hamburger-control.js). Mobile untouched (901 vs 900 split).
4. Mobile revert (UA-gated): want() returns 'topright' when UA matches /Android|iPhone|iPad|iPod/ (restores original); sizing IIFE early-returns on mobile UA so phones do not invalidateSize on URL-bar scroll. Desktop path unchanged.

## Durable learnings
- Leaflet in a flex/iframe container that is not sized at init, with no window-resize to correct, keeps a stale _size and paints a strip. Fix pattern = ResizeObserver on the map container -> invalidateSize. Reusable across all public/maps/* iframes. Opening DevTools masks the bug (fires a resize -> heals), so measure with DevTools closed / in a separate window.
- The chat<->Claude Code paste channel corrupts fenced code and large literals; prose self-reports ("all checks pass", prettified diffs) are unreliable. Ship edits as self-contained Python apply-scripts: base64 payloads + embedded expected SHA256 of the edited region + auto-restore on mismatch. The region hash is the only un-foolable gate -- it is computed from real file bytes vs embedded truth and cannot be pattern-matched from chat. Do not reveal the expected hash before asking for the computed one.
- Cross-origin iframe (Supabase proxy) cannot be introspected from the parent. Use "Open Frame in New Tab" and self-identify context (log location.href) before trusting a console probe -- two early probes silently ran in the top page and returned misleading data.
- git add -A / git add . swept a script's .bak into a commit -> tracked ~690KB public dead weight, deployable at /maps/linnuliigid/index.html.chrome.bak. Rule: gitignore public/maps/**/*.bak; stage narrowly (git add <file>), never -A.
- Manual Lovable Publish republishes ALL of main -- ships every pending commit and drops removed files in the same pass (the accidental .bak self-heals on the next publish).
- An iframe cannot move the parent nav bar: no height postMessage, and the map document is overflow:hidden fixed-viewport. A perceived nav shift after publish is a fresh-build re-render, not the iframe edit.

## Open / backlog (surfaced this session, not fixed)
- Avatar .webp 404s on the relative /maps/linnuliigid/avatars/ path; working avatars resolve to the Supabase bird-avatars bucket -- something still emits legacy relative URLs. Locate the emitter.
- [NETTA-TRACE] render-decision instrumentation still in index.html (~line 9249) -- cleanup prompt pending.
- __cf_bm cookie "rejected for invalid domain" warnings on avatar fetches -- cosmetic (Cloudflare bot cookie), low priority.
