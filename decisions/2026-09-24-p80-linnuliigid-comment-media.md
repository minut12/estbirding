# P80 — Linnuliigid cards: eBird comment + media, Elurikkus remark + photos

Commits: `c15976e` (P80-pre fix), `6fcc7b9` (P80a eBird), `7d907d1` (P80b Elurikkus). File: `public/maps/linnuliigid/index.html` only.

Rulings (Kristian, 24 Sep):
1. eBird (EE) card: the comment box shows only for R/SR/MR species (`_rarLevel` in rare/super/mega). The media-counts strip shows for every species. Both come from the checklist call the card already makes. Order: rows, comment, media, 7-day list, buttons.
2. Elurikkus card: the remark shows for every species when it is non-empty (`remarks`, falling back to `identification_remarks`). Up to 3 real thumbnails, with `+N` on the 3rd tile and `© holder · licence` on each tile. Each tile opens `large_url`. A credit line links to the occurrence page. There is no new fetch. The single-observation card (`_eluObsPopupHtml`) is left alone.
3. The row is matched by occurrence id only (the id in `detailUrl`), with no `results[0]` fallback. No match means `remark ''`, `media []`, `mediaN 0`, `occId = id || ''`, so a remark from an earlier occurrence can't linger.

Data sources:
- **eBird:** `_fillChecklistRow(e, subId, code)` caches `{n, min, by:{<speciesCode>:{c, m:{p,a,v}}}}` from `/v2/product/checklist/view` (`obs[].comments`, `obs[].mediaCounts.P/A/V`, the same fields Euroopa reads). `paintExtras()` does nothing if the popup root has left the page. Older cache entries without `by` read as no comment and no media.
- **Elurikkus:** the search HTML that `autoFetchCoords` already downloads embeds the SvelteKit JSON (`data-sveltekit-fetched`, `api/occurrences/search`). Its `body` is a JSON string, so it takes two `JSON.parse` calls. The table has no Remarks column and its Files cell holds no URLs. The server payloads (`linnuliigid-snapshot`, `elurikkus-bulk-refresh`) carry neither remarks nor files.

The Accept-Language finding (P80-pre): Elurikkus picks the page language from `Accept-Language`. An Estonian-language browser got Estonian table headers, `_findEluRecordsTable` matched nothing, and the refresh stopped before the detail page, so there was no `detailUrl` and no coordinates. Every elurikkus.ee fetch now sends `Accept-Language: en-US,en;q=0.9` (`_addEluLangHeader`). This only affects Estonian-language browsers; Kristian's is English. Occurrence hrefs are now relative (`../occurrences/occurrence/<id>`), so 8 matchers that required `/app/...` now rebuild the URL from the id (`_eluOccUrlFromHref`).

Persistence: `_prunePointsForStorage` keeps the whole `eluExtra`, so KEEP didn't change. The cloud merge in `_loadElurikkusCacheFromSupabase` rebuilds `eluExtra` as a fixed object. It now carries `remark`, `occId`, `media` and `mediaN` from the local point only when `p.eluExtra.occId` equals the occurrence id in `merged.openUrl`; otherwise it clears them. Known limitation: `_applySnapshot`, `_eluExtraScore` and the snapshot merge are untouched. When the snapshot's `eluExtra` wins there, the four fields disappear until the next refresh.

Open items:
- In-app check on `main--` is still pending: a rarity EE card with a comment, a card with photos, a real Elurikkus remark and thumbnails, and fields surviving a reload.
- Single-observation card (`_eluObsPopupHtml`): no remark or photos yet.
- eBird escapee flag: not handled.
- Proxy fallback: whether the proxy forwards `Accept-Language` hasn't been observed, because every request went direct.
