# eBird refresh performance gap — architecture investigation

**Scope:** Read-only investigation. No source files were modified.
**Repo:** `estbirding` (this working copy, branch `main`)
**Date:** 2026-04-17

---

## 1. Executive summary

The hypothesis is **confirmed with an important caveat**. The eBird refresh that the user experiences as "~4 minutes" on the Linnuliigid map is driven by [`refreshEbirdEEAll()`](public/maps/linnuliigid/index.html#L10349), which loops over every Estonian species in `SPECIES_EBIRD_CODES` and calls the **per-species** recent-observations endpoint once per species with an explicit `await new Promise(r => setTimeout(r, 400))` between calls. For ~446 species × (≈300 ms upstream + 400 ms sleep) that is ~310 s worst-case, which matches the observed wall-clock time.

The Europe map [`refreshEuropeAggregated()`](public/maps/europe/index.html#L1895) uses exactly the predicted regional-bulk pattern: 7 calls to `obs/{region}/recent` with `BACK_DAYS=30`, `maxResults=1000`, 250 ms inter-country delay, ~20 s total. All fan-out happens client-side from a single JSON payload per country.

Important caveat: the primary `points[]` store on Linnuliigid is **not populated by the eBird refresh at all** — it is populated by Elurikkus. The eBird EE refresh writes to a **separate** `ebirdEEPoints{}` store (localStorage key `bm_ebird_ee_points`) rendered as a dedicated overlay. There is *also* a dead-code function [`fetchEbirdRecent`](public/maps/linnuliigid/index.html#L12399) in the Ennustus block that already uses the regional bulk endpoint but is never invoked. And there is a second per-species loop inside the Ennustus "Skaneeri" button ([scan block around L12880](public/maps/linnuliigid/index.html#L12880)) that calls `window.__fetchEbirdEEForSpecies` for each species and writes `occ7Ebird` onto `window.points`.

So "switch Linnuliigid to regional bulk" is not a drop-in replacement — it must decide what to do with (a) the 30-day *last-seen location/date* per species that the overlay depends on, (b) the Ennustus `occ7Ebird` badge that is populated by a different per-species loop, and (c) the `__ennEbirdCounts` map that `combinedProb()` reads but nothing currently fills.

---

## 2. Current Linnuliigid flow

All eBird-refresh code on the Linnuliigid map lives in an IIFE `<script>` block at [public/maps/linnuliigid/index.html:10148–10554](public/maps/linnuliigid/index.html#L10148-L10554) titled `<!-- eBird EE Layer -->`. A second, unrelated eBird block lives in the Ennustus IIFE at [lines 12371–12964](public/maps/linnuliigid/index.html#L12371-L12964).

### 2.1 Entry points

| Trigger | Location | Calls |
|---|---|---|
| User clicks "eBird EE" button in controls strip | [L10197](public/maps/linnuliigid/index.html#L10197) (`ebirdEEBtn.addEventListener('click', …)`) when toggling ON | `refreshEbirdEEAll()` |
| 30-min auto-interval (only if layer is on) | [L10532](public/maps/linnuliigid/index.html#L10532) (`setInterval(…, 30*60*1000)`) | `refreshEbirdEEAll()` |
| Cold start with cached layer on | [L10539](public/maps/linnuliigid/index.html#L10539) (`setTimeout(refreshEbirdEEAll, 5000)`) | `refreshEbirdEEAll()` |
| Ennustus "Skaneeri" button loop | [L12880](public/maps/linnuliigid/index.html#L12880) | `window.__fetchEbirdEEForSpecies(name)` per species |

The `MAP_REFRESH_VISIBLE`/`MAP_REFRESH_SELECTED` postMessage handlers on Linnuliigid call `rebuildAllMarkers(); render();` ([L8088–L8089](public/maps/linnuliigid/index.html#L8088-L8089)) — they do **not** trigger any eBird fetch. The main "refresh" from the parent Avatar Manager goes through the Elurikkus/Snapshot path, not eBird.

There is no UI button labelled "Skaneeri" or "Värskenda" that invokes the regional-bulk `fetchEbirdRecent` — grep shows no call sites.

### 2.2 Per-species fetch — [`fetchEbirdEEForSpecies(estName)`](public/maps/linnuliigid/index.html#L10246) (L10246–L10301)

- URL (primary):
  `https://api.ebird.org/v2/data/obs/EE/recent/{encodeURIComponent(code)}?back=30&maxResults=1000&detail=full&_ts={now}`
- URL (proxy fallback on failure):
  `https://eenwcyuyugyrjgpivxrq.supabase.co/functions/v1/ebird_recent?regionCode=EE&back=30&maxResults=1000&detail=full&speciesCode={code}`
- Auth: `X-eBirdApiToken` header with token from `localStorage['bm_ebird_token']` or hardcoded fallback `9s72dc2jcjlq`.
- Retry: tries direct first; on any error (HTTP or parse) falls back to the Supabase Edge Function once. No other retry logic.
- Computes:
  - `occ7` — count of observations within the last 7 days (walks the 30-day payload).
  - `latest` — sort-descending by `obsDt`, take `[0]`.
- Returns (or `null`): `{ lat, lon, t, loc, occ7, howMany, observer, subId, lastFetched, src: 'eBird EE' }`.

### 2.3 Bulk driver — [`refreshEbirdEEAll()`](public/maps/linnuliigid/index.html#L10349) (L10349–L10401)

Sequential loop over `Object.keys(SPECIES_EBIRD_CODES)`:
```
for (var i = 0; i < total; i++) {
  result = await fetchEbirdEEForSpecies(name);     // one HTTP request
  if (result) ebirdEEPoints[name] = result;
  await new Promise(r => setTimeout(r, 400));      // throttle
  if (done % 5 === 0) { saveEbirdEE(); refreshEbirdEEMarkers(); }
}
```
- **Concurrency:** 1. Strictly sequential.
- **Delay:** 400 ms after every species, regardless of success.
- **Abort:** Polls `window.__ebirdEELayerOn` after each iteration — turning the layer off aborts the loop.
- **Persistence:** Every 5 species, writes `localStorage['bm_ebird_ee_points']` and redraws markers.
- **Wall-clock math:** 446 species × (upstream ~200–400 ms + 400 ms sleep) ≈ **300–360 s**. Matches the observed ~4 minutes.

### 2.4 What gets written — separate from `points[]`

The eBird EE refresh writes to a **local** `ebirdEEPoints[name]` object (defined at [L10153](public/maps/linnuliigid/index.html#L10153) inside the IIFE), persisted to `localStorage['bm_ebird_ee_points']`. It renders its own Leaflet marker layer (`ebirdEEMarkers`, L10158). It does **not** write `occ7`, `lat`, `lon`, `t`, `loc`, `src` to the primary `points[]` / `window.points`. The Europe map, by contrast, writes directly to `points[name]`.

The only path that cross-contaminates is the **Ennustus "Skaneeri" loop** ([L12879–L12896](public/maps/linnuliigid/index.html#L12879-L12896)): inside the "Skaneeri" per-species loop it calls `window.__fetchEbirdEEForSpecies(name)` (the same per-species function) and writes `ep.occ7Ebird`, `ep.occ7EbirdUpdated`, and — if live coords exist — `ep.lat`, `ep.lon`, `ep.t`, `ep.src='eBird'` onto `window.points[name]`. That loop also sleeps 150 ms per iteration (L12898) and therefore amplifies the per-species call count whenever the user runs it.

### 2.5 Snapshot / badge interaction

- The `linnuliigid-snapshot` Edge Function ([supabase/functions/linnuliigid-snapshot/index.ts](supabase/functions/linnuliigid-snapshot/index.ts)) does not reference eBird at all — grep for `ebird` in that file returns zero hits.
- `occ7Ebird` **is** preserved client-side through the Elurikkus refresh cycle: it's in the `_PRESERVE` list at [L7119](public/maps/linnuliigid/index.html#L7119) and in the `save()` fields at [L8100](public/maps/linnuliigid/index.html#L8100).
- A **client-side** badge cache `bm_enn_badges_v1` ([L11867](public/maps/linnuliigid/index.html#L11867)) stores `occ7Ebird`/`occ7EbirdUpdated` per species for rehydrate after reload. TTL: `ENN_CACHE_TTL_MS`. This is purely local, not Supabase.
- No `useLiveEbird*` flag exists. The Elurikkus mirror pattern uses `liveElurikkusBySpecies` / `useLiveElurikkusForSpecies`; there is no analogous eBird-live flag. The `clientScannedAt` flag is Elurikkus-scoped.
- [L11557](public/maps/linnuliigid/index.html#L11557): `points[name].occ7` on Linnuliigid is set from `Math.max(eluOcc7, occ7Ebird)` — so once `occ7Ebird` is populated (via the Ennustus Skaneeri loop) it feeds into the primary `occ7` displayed on main markers.

---

## 3. Current Europe flow

### 3.1 Entry points

| Trigger | Location |
|---|---|
| "Refresh data" button | [L2321](public/maps/europe/index.html#L2321) — calls `refreshKeys(keys, true)` |
| `MAP_REFRESH_VISIBLE` / `MAP_REFRESH_SELECTED` postMessage | [L2482–L2485](public/maps/europe/index.html#L2482-L2485) — programmatically clicks the button |
| `startAutoSync()` at load (when snapshot is stale / empty) | [L2423–L2453](public/maps/europe/index.html#L2423-L2453) — chunks `keys` and calls `refreshKeys(chunk, false)` per chunk, 1200 ms apart |

### 3.2 Top-level driver — [`refreshKeys(keys, force)`](public/maps/europe/index.html#L2134) (L2134–L2227)

Performs a health-check against `obs/EE/recent?back=1&maxResults=1` then delegates to `refreshEuropeAggregated`.

### 3.3 Main aggregator — [`refreshEuropeAggregated(keys, onProgress)`](public/maps/europe/index.html#L1895) (L1895–L2083)

- `REGIONS = ["FI","SE","LV","LT","PL","BY","RU"]` ([L399](public/maps/europe/index.html#L399))
- `BACK_DAYS = 30`, `MAX_RESULTS = 1000` ([L765–L766](public/maps/europe/index.html#L765-L766))
- URL (per country): `https://api.ebird.org/v2/data/obs/{region}/recent?back=30&maxResults=1000&key={token}&_ts={now}` — built by [`buildEbirdCountryRecentUrl`](public/maps/europe/index.html#L2130) at L2130.
- Loops `for (const region of REGIONS)`, single `safeFetchText(url, …, 20000, 1)` per country.
- Inter-country delay: `await delayMs(250)` at [L2048](public/maps/europe/index.html#L2048).
- In-memory aggregation per response:
  - `speciesByCode = Map<speciesCode, estName>` (L1896) built from the keys list before the loop.
  - `perSpeciesRegionByCode[speciesCode] = { occ7, latestObs, latestTs, … }`
  - 7-day filter via `isInLastNDaysYmd(ymd, 7)` ([L1115](public/maps/europe/index.html#L1115)) / `isInLastNDaysTs(ts, 7)` ([L1122](public/maps/europe/index.html#L1122)). `occ7` increments only if that check passes.
  - `totalCountsGlobalByCode[speciesCode]` accumulates across all countries.
  - Latest-ever obs (regardless of 7d window) tracked via `latestTs` — but only observations **within the last 30 days** (the `back=30` limit) are ever returned, so "latest" is really "latest within last 30 days".
- Writes to `points[speciesName]` at L2051–L2075:
  - `p.occ7 = totalCountsGlobalByCode[code] ?? agg.total7` — 7-day global total.
  - `p.regions[region] = { lat, lon, t, tMs, loc, occ7, howMany }` — per-country breakdown.
  - `p.t, p.tMs, p.region, p.lat, p.lon, p.loc` — from the single freshest observation across all regions (latest `tMs`).
  - If no 7d/30d hit: `p.t = ""`, `p.lat = p.lon = null`, `p.region = ""`.
- Wall-clock: 7 × (300–500 ms upstream + 250 ms sleep) ≈ **5–6 s network** plus health check plus client aggregation; observed ~20 s is consistent.

### 3.4 Species missing from 7-day window

A species with no observations in the last 7 days in any region ends up with `p.occ7 = 0` and (importantly) the latest-observation fields *will* still be filled if it appeared in the last 30 days (see `isValidDt` path at L1973 that bypasses the 7-day filter). So "last seen" is preserved as long as the species showed up anywhere in the 30-day payload and there was room in `maxResults=1000` for it. That is the same data horizon Linnuliigid currently has per species.

---

## 4. API endpoint comparison

### Linnuliigid (`public/maps/linnuliigid/index.html`)

Every `api.ebird.org` reference in this file:

| Line | URL pattern | Called from |
|---|---|---|
| [L10253](public/maps/linnuliigid/index.html#L10253) | `/v2/data/obs/EE/recent/{speciesCode}?back=30&maxResults=1000&detail=full` | `fetchEbirdEEForSpecies` (per-species) |
| [L12400](public/maps/linnuliigid/index.html#L12400) | `/v2/data/obs/EE/recent?back=30&maxResults=10000` | `fetchEbirdRecent` — **defined but never called** |

Proxy references: [L10254](public/maps/linnuliigid/index.html#L10254) — per-species call via the `ebird_recent` Edge Function fallback. No call to a non-speciesCode `ebird_recent` URL exists on this map. No reference to `ebird-bulk-refresh` exists.

### Europe (`public/maps/europe/index.html`)

| Line | URL pattern | Called from |
|---|---|---|
| [L2131](public/maps/europe/index.html#L2131) | `/v2/data/obs/{regionCode}/recent?back={N}&maxResults={M}&key={token}` | `buildEbirdCountryRecentUrl` → `refreshEuropeAggregated`, `refreshKeys` health check |

No per-species URLs, no `ebird_recent` Edge Function references. Europe calls `api.ebird.org` directly with the token as a query param.

---

## 5. Edge Function audit

### 5.1 `supabase/functions/ebird_recent/index.ts`

Supports **both** modes (`speciesCode` is optional) — confirmed at [index.ts:65–67](supabase/functions/ebird_recent/index.ts#L65-L67):

```ts
const upstreamUrl = speciesCode
  ? `https://api.ebird.org/v2/data/obs/${regionCode}/recent/${speciesCode}?back=${back}&maxResults=${maxResults}&detail=${detail}`
  : `https://api.ebird.org/v2/data/obs/${regionCode}/recent?back=${back}&maxResults=${maxResults}&detail=${detail}`;
```

- Uses secret `EBIRD_API_TOKEN2` (note: not `EBIRD_API_TOKEN` as stated in the prompt).
- Clamps `back` to `[1, 30]`, `maxResults` to `[1, 1000]` ([L60–L61](supabase/functions/ebird_recent/index.ts#L60-L61)).
- Passes through the upstream response body and content-type.
- **Linnuliigid** hits this only as a per-species fallback ([L10254](public/maps/linnuliigid/index.html#L10254)).
- **Europe** does **not** use this Edge Function — it calls `api.ebird.org` directly. Since the deployment works reliably against ~7 countries, the direct-from-browser path is viable for Estonia too, *but* the Edge Function is also verified-working for the speciesCode fallback path, which means datacenter IPs are not blocked on this endpoint.

### 5.2 `supabase/functions/ebird-bulk-refresh/index.ts`

This is a **different** function with a **different purpose** ([index.ts:12–152](supabase/functions/ebird-bulk-refresh/index.ts)):

- Accepts a POST with `{ observations: [...] }` pre-fetched by n8n (the eBird request is done outside Supabase).
- Aggregates by `comName`, upserts rows into the `ebird_cache` table (`species_name, lat, lon, occ7, t, location_name, sub_id, fetched_at`) keyed by `species_name`, in chunks of 500.
- Requires the `x-refresh-secret` header (`EBIRD_REFRESH_SECRET`).
- **No client-side code references it.** grep for `ebird-bulk-refresh` hits only `supabase/migrations/20260410*.sql` and the function itself. The `ebird_cache` table exists in the DB, but nothing in the two maps reads it. This is ingestion-only scaffolding apparently meant to be paired with an n8n scheduled job.

So there are two different "bulk" ideas in the repo:
1. A **client-side** bulk using `obs/EE/recent` (like Europe does) — scaffolded by `fetchEbirdRecent` but never called.
2. A **server-side** bulk ingestion into the `ebird_cache` table — stub only, no reader.

---

## 6. 30-day vs 7-day semantic gap

Both flows currently use `back=30` upstream and filter to 7 days for `occ7`. So moving Linnuliigid to the regional-bulk endpoint does **not** narrow the data window by itself — both would still be 30 days.

The real semantic gap is different: **`maxResults=1000` vs `maxResults=10000`**.

- Europe calls `maxResults=1000` per country. For a 30-day window in large regions (e.g. RU, PL), 1000 observations might be reached in a day or two, and rarities from Day 30 will be silently dropped. The Estonia equivalent ([L12400](public/maps/linnuliigid/index.html#L12400)) of `fetchEbirdRecent` correctly uses `maxResults=10000` because Estonia alone can easily exceed 1000 recent observations.
- eBird documents an endpoint cap of `maxResults` ≤ 10000 for this endpoint; `ebird_recent` Edge Function clamps to 1000 ([supabase/functions/ebird_recent/index.ts:61](supabase/functions/ebird_recent/index.ts#L61)), which is a **hard ceiling** for anyone routing through it.

Features that depend on 30-day per-species eBird data:

| Consumer | Reads from | Would it regress? |
|---|---|---|
| eBird EE overlay markers (layer toggle) | `ebirdEEPoints[name].{lat,lon,t,occ7,howMany,observer,subId}` | **Yes** for very rare species — if they appeared in last 30 days but are not in the top-1000 regional bulk payload, they'll be missing from the bulk response. The per-species endpoint always returns *every* recorded observation for that species in the window, so rarities today get their one blue pin. |
| Ennustus "missing" list | `window.__ennEbirdCounts` (only filled by the unused `fetchEbirdRecent`) → `combinedProb(baseProb, ebCount)` | **No** — currently unused data flow (zero callers). A regional-bulk rewrite would actually *fix* this by making `__ennEbirdCounts` populated for the first time. |
| `occ7Ebird` badge on main rows | `points[name].occ7Ebird`, written only by the Ennustus Skaneeri loop | **Possibly** — if the rewrite replaces the Skaneeri loop with one regional-bulk call, `occ7Ebird` becomes available without running 446 per-species requests, which is a win. The Ennustus loop also mutates `points[name].{lat,lon,t,src='eBird'}` when no Elurikkus coord exists — that fallback would need to be preserved or redesigned. |
| Snapshot (`linnuliigid-snapshot`) | Nothing eBird-related | No impact. |
| Rarity overlay | `getSpeciesMetaShared(key).rarityLevel` (from `speciesMeta`) — static config, not eBird-driven | No impact. |

Key regression risk: the eBird EE overlay needs pins for *rare species that appeared once in 30 days*. A `maxResults=1000` regional-bulk payload may well omit them. Mitigations:
- Raise `maxResults` to `10000` and call `api.ebird.org` directly from the browser (the existing `fetchEbirdRecent` dead code already does this with the hardcoded token).
- Or: keep the per-species endpoint as a **lazy per-row fallback** when the user clicks a row for a species that had no hit in the bulk payload.

---

## 7. Existing regional-bulk scaffolding on Linnuliigid

Already present:

- [`fetchEbirdRecent(callback)`](public/maps/linnuliigid/index.html#L12399) at L12399 — uses `obs/EE/recent?back=30&maxResults=10000` directly via `api.ebird.org`. Builds `countsByCode[code] = { count, lastDate, comName }` and `window.__ennEbirdCounts[code] = count7d`. Not called from anywhere.
- `ebirdRecentCache` at L12396 — module-local cache object, not assigned to `window`.
- `EBIRD_TOKEN` at L12395 — hardcoded fallback, same `9s72dc2jcjlq` as the eBird EE block.
- `__fetchEbirdEEForSpecies` is exposed on `window` at L10301, already used by the Ennustus scan block.

`ebird_recent` and `ebird-bulk-refresh` are not referenced from the Linnuliigid HTML at all (grep confirms). So there is no partial regional-bulk integration wired to `points[]` — `fetchEbirdRecent` is a dangling helper whose consumer (`combinedProb`/`missing`) reads from `window.__ennEbirdCounts` but is never fed.

---

## 8. Scoping constraints for the rewrite

Relevant script blocks (delimited via the `<script>` / `</script>` lines in the file):

| Block | Lines | Contains |
|---|---|---|
| Main A | 277–309 | boot helpers |
| **Main B** (primary) | **311–9510** | `let SPECIES`, `let points`, `var SPECIES_EBIRD_CODES`, `let avatars`, `function updateMarker`, `function save`, `function render`, `refreshAllMarkers`, `_fixMojibake`, `_normText`, Elurikkus refresh, snapshot plumbing |
| Filter wiring | 9989–9994 | filter input |
| postMessage / avatars | 9997–10115 | AVATARS/SPECIES_META sync |
| prediction panel loader | 10116–10132 | dynamic `<script>` src |
| **eBird EE IIFE** | **10148–10554** | `ebirdEEPoints`, `fetchEbirdEEForSpecies`, `refreshEbirdEEAll`, `refreshEbirdEEMarkers`, UI wiring |
| Other blocks | 10557–12317 | scan state, badge cache, misc |
| **Ennustus IIFE** | **12371–12964** | `fetchEbirdRecent` (unused bulk), `combinedProb`, `missing`, local `_fix`, local `render`, `computeProbForSpecies` usage, Skaneeri loop |

Scoping rules the rewrite must honor:

- `SPECIES`, `points`, `avatars`, `springDates`, and inner helpers like `updateMarker`, `save`, `render` are **`let`/`const`** in Main B and are **not on `window`**, with two exceptions: `window.points` is assigned at [L288](public/maps/linnuliigid/index.html#L288) and used alongside `points`; `window.updateMarker`, `window.render`, `window.SPECIES` are explicitly set at various points (see [L800](public/maps/linnuliigid/index.html#L800) `window.__bm_SPECIES = SPECIES`, and the render wrappers around L10543–L10548).
- A new eBird-refresh function that writes to `points[]` must either (a) live inside Main B (preferred; can touch `points`/`updateMarker`/`render`/`save` directly), or (b) live in its own IIFE and go through `window.points`, `window.updateMarker`, `window.render`, and `window.__schedulePersistBadgeCache` — which is the pattern the existing eBird EE block and the Skaneeri loop already use.
- `SPECIES_EBIRD_CODES` is declared with `var` at L850 and is therefore globally accessible from any block. Good.
- The mojibake-fix pattern appears twice: `_fixMojibake` in Main B at L376 and a local `_fix` in the Ennustus block at L12556. Any new code that accepts species names coming back from a bulk payload through `comName` (English common name → Estonian via reverse lookup) does not need mojibake fixing — but code that round-trips names into `speciesByCode`/`codeBySpecies` must use `SPECIES_EBIRD_CODES` post-normalization (the IIFE at L851–L858 already re-keys the map with normalized names).
- `getEbirdCode(estName)` at [L12433](public/maps/linnuliigid/index.html#L12433) is the tolerant lookup helper (handles mojibake + speciesMeta + localStorage fallback). Any new rewrite that maps Estonian name → eBird code should reuse it rather than re-implementing.
- The eBird EE IIFE closes at L10554 — any new function must be *opened* in a fresh `<script>` block or placed inside a still-open IIFE; the eBird EE closure is sealed.

---

## 9. Proposed rewrite plan (architecture only, no code)

**Shape.** Replace `refreshEbirdEEAll()` with a single regional-bulk driver, call it e.g. `refreshEbirdEEBulk()`, that issues **one** request for `obs/EE/recent?back=30&maxResults=10000`, aggregates locally into `{speciesCode: { occ7, latestObs, latestTs }}` using the same inner loop shape as Europe's `refreshEuropeAggregated`, then walks `SPECIES_EBIRD_CODES` to inverse-map code → Estonian name and writes `ebirdEEPoints[estName] = { lat, lon, t, loc, occ7, howMany, observer, subId, lastFetched, src }`. This is a straight copy of the Europe aggregator with `REGIONS = ["EE"]` and a post-processing step that writes to `ebirdEEPoints` instead of `points`. Target wall-clock: 1–3 s.

**Transport — route through `ebird_recent`?** Use `ebird_recent` Edge Function for consistency *only if* the `maxResults=1000` clamp is raised to 10000 first. Reasoning:
- Consistency with the existing per-species fallback path.
- Keeps the eBird API token server-side (currently the token is hardcoded into this HTML file at L10252 and L12395 — a known leak, flagged below).
- Removes the need for `X-eBirdApiToken` in the browser.
- Europe works reliably direct-from-browser, so blocking on datacenter IPs is *not* a problem for this endpoint, but the Edge Function already demonstrably works for the per-species path.
- Drawback: Estonia in 30 days can exceed 1000 observations; the current clamp would silently truncate. Bumping the ceiling on `ebird_recent` is a one-line change in [supabase/functions/ebird_recent/index.ts:61](supabase/functions/ebird_recent/index.ts#L61).

If you don't want to touch the Edge Function, call `api.ebird.org` directly (matching what `fetchEbirdRecent` already does and what Europe does today) — this works, but leaves the token in the HTML.

**Preserving 30-day per-species "last seen" data for species absent from the bulk payload.** Three options, ordered by recommendation:

1. **Rely on the bulk payload's 30-day window with `maxResults=10000`.** For Estonia this should cover virtually all species with at least one recent sighting. Any species still missing is genuinely absent from eBird in the last 30 days, which is the honest answer. Keep `fetchEbirdEEForSpecies` around as the per-row "refresh this species" button handler. Drop the 30-day *bulk* fallback — it was per-species because that was the only way to get data quickly historically; with bulk, it's unnecessary.
2. **Lazy per-row fallback.** When the user clicks a row for a species with no `ebirdEEPoints` entry after the bulk run, fire `fetchEbirdEEForSpecies` on demand. Cheap, zero fixed cost, covers the long tail.
3. **Don't drop it.** Run the bulk first, then loop over species with zero hits and fetch them per-species with a 400 ms delay. For a healthy bulk window, this set is small (tens, not hundreds). Worst case this degrades gracefully to the current behavior.

Recommended: **(1) + (2)**. Bulk for populating the overlay, per-species for manual refresh of a single row.

**Snapshot / badge / Ennustus integration.**
- The `ebird_cache` table and `ebird-bulk-refresh` Edge Function are unused — a rewrite can ignore them unless you want to move eBird caching server-side; in that case they're already half-built.
- `bm_enn_badges_v1` continues to persist `occ7Ebird` client-side. A regional-bulk rewrite should *replace* the per-species Skaneeri loop: once `refreshEbirdEEBulk` runs, fan out the per-code counts into `points[name].occ7Ebird = countsByCode[code].count7d` (and `occ7EbirdUpdated = now`), bypassing the `__fetchEbirdEEForSpecies` path entirely for badge computation. This changes the Skaneeri semantics (it would not need to loop over species for eBird data at all — only for `computeProbForSpecies`).
- The dormant `__ennEbirdCounts` / `combinedProb` path also gets fed for the first time as a side-effect (the bulk function already assigns it at L12417–L12426). That makes the Ennustus "missing" list actually use eBird counts for its prob boost, which was the original intent.

**What to do with the existing per-species function.**
- Keep `fetchEbirdEEForSpecies` as the **per-row** refresh (option 2 above) — rename to make its scope clear if desired.
- Delete `refreshEbirdEEAll` (the 446-call loop), replace with `refreshEbirdEEBulk`.
- Consolidate with `fetchEbirdRecent` (dead bulk function) — either delete `fetchEbirdRecent` entirely and have `refreshEbirdEEBulk` do its job of populating `window.__ennEbirdCounts`, or keep `fetchEbirdRecent` and have `refreshEbirdEEBulk` delegate. Single path is simpler.
- Keep `ebird_recent` Edge Function; raise its `maxResults` ceiling to 10000.
- Leave `ebird-bulk-refresh` + `ebird_cache` alone for now — orthogonal to the map refresh.

---

## 10. Open questions

1. **Rare-species coverage:** Are you OK with dropping the "one per-species fetch per rarity" guarantee? With `back=30, maxResults=10000` in one call, rare species should still appear if they have any observation in Estonia in the last 30 days, but we're trusting eBird's sort order. Do you want the lazy per-row fallback (recommended) or accept that a species with no `ebirdEEPoints` entry simply has no eBird pin?
2. **Token exposure:** The eBird API token `9s72dc2jcjlq` is hardcoded into `public/maps/linnuliigid/index.html` at lines 10252 and 12395 (and is declared in this report's context as intended). Europe also hardcodes `HARDCODED_EBIRD_TOKEN`. If the rewrite routes through `ebird_recent`, the token moves to the Edge Function secret only. Do you want that consolidation as part of this change or as a separate PR?
3. **`ebird_recent` ceiling:** Are you OK bumping `maxResults` clamp from 1000 → 10000 in the Edge Function? This is needed if bulk Estonia goes through the Edge Function instead of direct-to-eBird.
4. **Ennustus Skaneeri semantics:** The Skaneeri loop currently also calls `computeProbForSpecies(name)` per species (that's the actual per-species workload; the eBird call is incidental). Do you want to keep Skaneeri as a prob-scan that *also* triggers a single bulk eBird refresh at the start, instead of per-species eBird calls? That fixes the eBird latency while preserving the prob-scan intent.
5. **30-day vs 7-day consistency:** Europe's `BACK_DAYS = 30` contrasts with the variable name `isInLastNDaysYmd(ymd, 7)`. Both maps conceptually fetch 30 days and filter to 7; keep this, or standardize on one?
6. **Auto-sync on Linnuliigid:** Europe has a `startAutoSync` chunked pre-fill at load. Linnuliigid has no equivalent for eBird (only the Elurikkus auto-refresh). Do you want a bulk eBird auto-sync on cold start after the rewrite, or keep it user-initiated (button click) only?

### Unrelated issues noticed (not fixed — flagged here per the stop conditions)

- `ebird_recent/index.ts:49` reads `EBIRD_API_TOKEN2`, but the investigation prompt states the secret is `EBIRD_API_TOKEN`. Confirm which is actually set in the Supabase project.
- `ebirdRecentCache` in Linnuliigid is defined but read only inside `fetchEbirdRecent` callers (none). In `map-placeholder.html` the cache *is* read — is `map-placeholder.html` an older or alternate build target that still matters?
- `ebird-bulk-refresh` and `ebird_cache` table appear to be half-built (no reader). Worth a separate investigation on whether the n8n job exists.
- The Ennustus block's inner `render()` at L12627 shadows the outer `render()` but is only visible inside the IIFE — this is intentional scoping, not a bug, but a new contributor could trip on it. The same IIFE also defines its own `_fix`, `sp`, `pt`, `sd`, `dn`, `av` helpers.
