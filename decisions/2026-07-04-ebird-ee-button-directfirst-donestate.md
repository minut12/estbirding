---
title: eBird EE button — direct-first fetch + done-state signal
date: 2026-07-04
status: authored-pending-verification
map: Linnuliigid
file: public/maps/linnuliigid/index.html
tags: [decision, linnuliigid, ebird, maps, ui]
asana: https://app.asana.com/1/1216197979547166/project/1216202142625052/task/1216275206660432
---

# eBird EE button — direct-first fetch + done-state signal

**Map:** [[Linnuliigid]] · `public/maps/linnuliigid/index.html`
**Status:** authored, pending verification — not treated as fixed until a post-push console capture confirms it.

## Symptom (reported)
1. eBird EE load "takes too much time".
2. Pressing the eBird button shows loading but never signals whether it's done or mid-scan.

## Diagnosis (from runtime console)
- The bulk load actually completes fast: `[eBird EE bulk] done total=217 codes=217 written=191 in 693ms`.
- Data comes from the **direct** `api.ebird.org` fallback (the iframe CSP allows it), not a proxy — the earlier `proxy?url=` assumption was wrong.
- A redundant `ebird_recent` proxy attempt fires first and dies on a CORS preflight (`X-eBirdApiToken` not in the Edge Function's `Access-Control-Allow-Headers`) — two red errors per load, wasted round-trip. Fails fast, so it is *not* a 30s stall.
- Real bug behind both complaints: `refreshEbirdEEBulk()` is called fire-and-forget and never resets the button; only the deprecated `refreshEbirdEEAll` ever did. So the load finishes in ~0.7s but the button sits on `Loading…` forever — which is very likely the entire "slow" perception.

## Decisions
- **Done-state style:** silent — button reverts via `syncEbirdEEBtn()`, count lives in the progress line.
- **Redundant proxy attempt:** direct-first — drop it (Claude Code iframe edit). Architecturally the proxy was doomed anyway: even with the header allowed, the Edge Function would 418 from Supabase IPs.
- **Wording:** switch to Estonian.

## Edits (3, gated; Claude Code)
1. **Edit 1 — direct-first fetch.** Dropped the broken `ebird_recent` proxy attempt; go direct to `api.ebird.org`. Removed dead `proxyUrl`/`SUPABASE_REF`. Return shape preserved: `{ ok, total, written, durationMs }` / `{ ok:false, reason, durationMs }`. ✅ approved & applied.
2. **Edit 1.5 — progress message honoring.** `_updateEbirdEEProgress` now shows a non-empty passed `msg` on the `done`/`error` states, else falls back to the exact existing English default (non-breaking; the deprecated caller passes `''`). ✅ approved & applied.
3. **Edit 2 — button done-state.** Wire `syncEbirdEEBtn()` + progress on resolve; Estonian strings; failure branches use the `error` state; inner `refreshEbirdEEMarkers()` dropped (bulk already renders). ✅ applied — pending verification.

### Estonian strings (verified via estonian-mcp)
- loading: `eBird EE: laadin…`
- running: `Laadin eBird EE vaatlusi…`
- done: `valmis · N vaatlust · S s`
- error: `eBird EE laadimine ebaõnnestus`
- Morphology confirmed: `vaatlust` = partitive singular (correct after a number), `vaatlusi` = partitive plural. Spelling clean on all.

## Acceptance criteria (post-push)
- [ ] No CORS / `ebird_recent` errors in console.
- [ ] Button reverts to its normal on-label (not stuck on `laadin…`).
- [ ] Progress line reads `valmis · N vaatlust · S s`.
- [ ] True wall-clock is sane. If ~1s, complaint #1 was only ever the missing signal; if genuinely slow, open a separate marker-render pass.

## Parked (separate concerns)
- 24 duplicate eBird codes in `SPECIES_EBIRD_CODES` (first-wins; data hygiene).
- `fetchEbirdEEForSpecies` per-species proxy path — likely 418s silently.

## Invariant reinforced
eBird 418s from Supabase/Deno IPs and React CSP blocks direct `api.ebird.org`; the **iframe** may call eBird directly. Server-side eBird must relay via n8n. This fix leans on the iframe-direct path, consistent with that invariant.
