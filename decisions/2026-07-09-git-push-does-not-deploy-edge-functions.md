# git push does NOT deploy Supabase edge functions (this project)

In this Lovable-managed project, a GitHub push to `main` updates the repo but does **not** deploy Supabase edge functions — the running bundle stays stale until an explicit Lovable deploy (`send_message` → supabase deploy) or the Supabase CLI.

**Proven 2026-07-09:** commits `4cfa42a` (v7 fold-in) and `0891411` (dbg instrumentation) sat on `main` but weren't live; a Põldvutt recompute folded **0** elu — the fold-in never ran — until an explicit Lovable deploy, after which the response `build` marker appeared and the fold-in worked.

**Rule:** EF changes require an explicit Lovable/Supabase deploy step **plus** independent runtime verification (a build/version marker in the response and/or `query_database`) — never assume a push shipped a function. (Lovable's own "success" messages are also unreliable; verify against the DB.)

Links: [[2026-07-09-compute-ennustus-v7-history-folds-elu-lag-tail]].
