# P71 — ee_map crossouts reset per Tallinn year; "Peida nähtud liigid" is list-only

ee_map crossouts reset each Europe/Tallinn year with no DB change and no row deletes: `loadCloudHidden` keeps a hidden row only if its `updated_at` falls in the current Tallinn year (the upsert bumps `updated_at` via the trigger), and `loadLocalHidden` returns an empty set when the cache's `.ts` stamp is from an earlier year. Only scopes in `YEAR_BOUND_SCOPES` do this.

"Peida nähtud liigid" (`bm_hide_seen`) only filters the sidebar list in `render()`; map markers keep following `visible===false`.

Signed-out users: the iframe's own points cache keeps visible=false across the year boundary. That's accepted, because crossouts are an account feature.
