# eElurikkus occurrences API is reachable via POST — request contract and the 404 correction

`elurikkus-bulk-refresh` is **page-1 / forward-only**: it fetches the `/app/occurrences/search?text=<name>` HTML page once and parses the embedded SvelteKit hydration payload. For Hiireviu this yields **993 rows** spanning only 2026-04-30 → 2026-07-12, against **~47,000** upstream ([[2026-07-10-hiireviu-coverage-elu-backfill-and-cohistory]]). Backfilling needs a way to **page** and **window** the source, so the underlying API was probed directly from the Supabase edge. Every finding below is verified against raw probe output from Supabase edge IPs.

**Findings.**

1. **The "elurikkus JSON API is unreachable" invariant is wrong — and it was never stated in `decisions/`.** No note in this repo ever recorded a literal "biocache JSON API returns 404 externally / is unreachable" claim; that invariant lived **outside the repo**, in the project's Architecture-invariants instructions, and is being corrected there separately. The fact of the matter: `GET https://elurikkus.ee/api/occurrences/search?...` returns **404**, but **`POST`** to the *same* URL with a JSON body returns **200**. The 404 was a **method mismatch**, not an IP block and not a missing route — the endpoint is **fully reachable from Supabase edge IPs**. (Contrast eBird, which genuinely *does* block Supabase IPs with HTTP 418 — that invariant is distinct, correct, and unaffected.) What `decisions/` *does* carry is the equivalent stale **framing** in [[2026-07-10-hiireviu-coverage-elu-backfill-and-cohistory]] lines 6 and 11, which this note corrects precisely:
   - Its **~10,000 cap is correct** — confirmed as `offset + limit <= 10000` (see finding 5).
   - Its **error code is wrong**: exceeding the cap returns **HTTP 400** with the literal body `Pagination limit exceeded, max offset+limit is 10000`, **not** HTTP 500.
   - Its **reasoning is wrong**: it treats the API as *unpageable* and infers date-window slicing as a *workaround forced by that limitation*. In fact the API pages fine via POST; date-window slicing is the right approach, but because it is the **supported mechanism** (`q` Lucene ranges, finding 4), not because paging is broken.
   - The interesting part — and the reason the correction matters — is that **the conclusion survived but the reasons did not**: "use date-window slicing" was right; every premise offered for it was wrong.

2. **Request contract.** The endpoint takes a structured JSON body (Rust/serde-backed), **not** ALA-style GET query params:

   ```json
   {
     "q": "_text_:\"Hiireviu\"",
     "fq": {},
     "pagination": { "offset": 0, "limit": 50,
                     "order": { "by": "event_datetime_point", "ascending": false } },
     "facets": [],
     "fields": null
   }
   ```

   - `facets` **must be an array**. Passing `{}` fails with `Json deserialize error: invalid type: map, expected a sequence` — even though the server *echoes it back* as `{}` in the response's `query` field. That asymmetry (rejected on input, mirrored on output) is the trap.
   - The response envelope keys are `count`, `query`, `results`, `facets`. The total is **`count`**, **not** `totalRecords`.

3. **`fq` is silently ignored.** `fq: { year: { values: [2024] } }` returns HTTP 200 but the count is unchanged (`47065` = unfiltered). It **fails open**, with no error. **Never filter via `fq`** — a filter that appears applied but does nothing is a silent-corruption bug.

4. **Filter via `q` instead (Lucene syntax).** Both of these work and agree exactly:
   - `_text_:"Hiireviu" AND year:2024` → count **3620**
   - `_text_:"Hiireviu" AND event_date:[2024-01-01 TO 2024-12-31]` → count **3620**

   Date-range windowing via `q` is therefore the supported mechanism.

5. **Hard pagination cap, server-stated.** `offset + limit <= 10000`. Exceeding it returns **HTTP 400** with the literal body `Pagination limit exceeded, max offset+limit is 10000`. Any species with more than 10k records in a window **cannot** be reached by offset paging alone — the window must be **sub-split by date** until each slice is under the cap.

6. **`limit` is honored up to at least 500** (`limit: 500` → 500 rows in one response), so pages should be pulled at **500**, not the UI default of 50.

7. **`order.ascending: true`** works and reaches the far tail of history (oldest Hiireviu record: **1857-08-27**).

8. **The JSON is richer than the HTML scrape.** Each result carries `id`, `event_date`, exact `latitude`/`longitude`, `locality`, `municipality`, `county`, `individual_count`, `behavior`, `recorded_by`, `year`, `month`. Backfill needs **no HTML parsing at all**.

9. **`id` shares the existing `sub_id` space.** Verified: the API's newest Hiireviu `id` (`66713419`) is already present as a `sub_id` in `elurikkus_observations`. The existing `upsert(..., { onConflict: "sub_id" })` therefore dedupes correctly against rows written by the HTML scraper — **no schema change is required** for backfill.

**Consequences.**

- **Ticket A (historical backfill) is unblocked** and its design is fully determined: window by `event_date` range via `q`, check `count` **before** paging, sub-split any window whose count approaches the 10k cap, page at `limit=500`, and upsert on `sub_id`.
- The `/app/` HTML page forwards **only** `text` — it hardcodes `fq:{}`, `offset:0`, `limit:50` — so it can **never** be used for paging. Any future work must go through the POST API.
- Anything asserting the eElurikkus JSON API is externally unreachable must be corrected — that belief is what produced the earlier (mistaken) conclusion that only HTML scraping was viable. That assertion lived in the out-of-repo Architecture-invariants instructions (being corrected there separately), **not** in `decisions/`.

**Supersedes.**

- [[2026-07-10-hiireviu-coverage-elu-backfill-and-cohistory]] — the **reasoning** of its lines 6 and 11 (the "no offset paging" framing and the "offset API caps at ~10,000, HTTP 500 beyond, so use date-window slicing" chain) is **superseded** by finding 1. Its ~10k cap and its date-window-slicing *conclusion* stand; only the stated error code and the "unpageable" premise are wrong. That note is left **unedited** — this note is the correction of record.
- eBird's HTTP-418-from-Supabase-IPs invariant is **distinct and unaffected**; it is not touched here.

Links: [[2026-07-10-hiireviu-coverage-elu-backfill-and-cohistory]], [[2026-07-09-compute-ennustus-v7-history-folds-elu-lag-tail]].
