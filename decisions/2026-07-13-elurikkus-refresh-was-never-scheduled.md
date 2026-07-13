# eElurikkus's "twice-daily" refresh was never scheduled — the table comment described intent, not reality

`elurikkus_observations` has carried a table comment since May 2026 (`supabase/migrations/20260503075355_5b2b0eec-88b2-411e-a553-93e9df9270aa.sql`, line 37) asserting the table is *"Populated twice daily by elurikkus-bulk-refresh Edge Function."* For two months that sentence was read as fact — including in this session's own reasoning about "the 2×/day refresh." It was never true.

**Finding.**

1. **No scheduler ever invoked `elurikkus-bulk-refresh`.** A repo-wide search turned up no GitHub Action, no `pg_cron` migration, no calling edge function, and no n8n workflow that fires it. A scheduled Action does exist — `.github/workflows/refresh-linnuliigid-snapshot.yml` — but it rebuilds the *map snapshot* and never references this ingest function (confirmed: `elurikkus-bulk-refresh` does not appear in it).
2. **The only caller was a browser button.** `window.__scanEnnAll` in `public/maps/linnuliigid/index.html` POSTed to the function carrying the hard-coded shared secret `elu-refresh-2026` in shipped public HTML. The table advanced **only when a human clicked** the admin "Skaneeri / Värskenda" control — an event-driven, manual trigger masquerading as a schedule.
3. **The "scheduled job" was that click.** A ~449-species sweep observed at **09:00–09:09 UTC on 2026-07-13**, initially read as a cron run, was the button firing. Nothing in the system runs on a clock at that time.

**Consequences.**

- **The secret was public.** Anyone viewing source could replay it and drive 445 species of scraping against elurikkus.ee from their own browser. The secret has been rotated and the client path removed (commit `007cfe4`); the browser now holds no refresh capability at all.
- **A real scheduler now exists.** An n8n workflow owns the forward refresh at **05:30 / 17:30**, with the secret held in an n8n credential — sequenced ahead of the **06:05 / 18:05** report and the **07:00 / 19:00** compute, so each downstream stage reads fresh upstream state.
- **The comment is now true.** It describes reality rather than intent: the table really is populated twice daily by a scheduled invocation of `elurikkus-bulk-refresh`.

**Lesson.** A comment asserted a schedule, and it was believed for two months — nothing ever checked. Freshness of an ingest table is a claim that must be **verified against the data** (max observation/ingest timestamp, row counts over time), not read from a comment. A comment records intent at write time; it does not observe runtime. Treat "populated twice daily" as a hypothesis to test, never as a guarantee.

Links: [[2026-07-13-elurikkus-api-is-reachable-via-post]], [[2026-07-10-hiireviu-coverage-elu-backfill-and-cohistory]], [[2026-07-05-compute-ennustus-cadence-and-parity-contract]].
