# P90 — Trektellen layer parked (2026-10-02)

**Decision:** No Trektellen (trektellen.nl) data layer for Linnuliigid. Parked, not planned. Kristian ruled not to contact Trektellen/EOU for access.

**Why:** Trektellen sits behind a Cloudflare managed challenge that blocked every automated client tried on 2 Oct 2026, one request each against `/site/totals/1480/2026`:

| Client | Origin | Result |
|---|---|---|
| Supabase pg_net `net.http_get` | Supabase (AWS) | 403 "Just a moment..." |
| Netlify Function `trektellen-probe` | us-east-1 | 403, `cf-mitigated: challenge` |
| `curl.exe`, EstBirds UA | home IP | 403 |
| Playwright headless Chromium | home IP | 403, never cleared |
| Playwright headed, installed Chrome, fresh profile | home IP | 403, never cleared |
| Kristian's own Chrome | home IP | 200 |

Fingerprint-based, not IP-based. Profile/cookie reuse or stealth plugins would be deliberate evasion — declined.

**Kept for a revisit:** no API; robots.txt allows `/site/*` (Crawl-delay 120, Visit-time 02:00-07:00 UTC) and disallows `/count`, `/species`, `/maps`; `/site/totals/{id}/{year}` is the per-species page (monthly totals, year total, S/N, max + date, presence days, first/last; Sorve 2026 = 177 rows); `/site/info/{id}` has lat/lon. Full plan and rulings: Project doc `claude/decisions/2026-10-02-p90-trektellen-layer-plan.md`.

**Lessons:** Netlify MCP `manage-env-vars` upsert with `newVarScopes:["functions"]` reports success but creates nothing (`["all"]` works) — verify with `getAllEnvVars`; branch deploys expose functions only at `/.netlify/functions/<name>`; new env vars reach functions on the next deploy only.

**Cleanup done:** probe removed (28373d1, f6e40ad, c5f213b, 266627e on main); Netlify var `TREKTELLEN_PROBE_SECRET` deleted; `trektellen-fetcher` folder and its Chromium removed.
