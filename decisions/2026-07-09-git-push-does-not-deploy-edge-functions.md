# git push does NOT deploy Supabase edge functions (this project)

> **SUPERSEDED 2026-09-10.** Edge Functions are now deployed by CI:
> `.github/workflows/deploy-edge-functions.yml` runs `supabase functions deploy`
> on every push to `main` that touches `supabase/functions/**` or
> `supabase/config.toml` (all functions, `verify_jwt` from config.toml).
> Measured: `toenaosus-orchestrator` v25 → v29 across pushes 3818f37, c60a5c7,
> 7750a5f, 7fba550. A Lovable redeploy is no longer required after an EF-source
> push. A push that does not touch those paths still deploys nothing. Kept for
> history only; the 2026-07-09 proof below was correct at the time.

In this Lovable-managed project, a GitHub push to `main` updates the repo but does **not** deploy Supabase edge functions — the running bundle stays stale until an explicit Lovable deploy (`send_message` → supabase deploy) or the Supabase CLI.

**Proven 2026-07-09:** commits `4cfa42a` (v7 fold-in) and `0891411` (dbg instrumentation) sat on `main` but weren't live; a Põldvutt recompute folded **0** elu — the fold-in never ran — until an explicit Lovable deploy, after which the response `build` marker appeared and the fold-in worked.

**Rule:** EF changes require an explicit Lovable/Supabase deploy step **plus** independent runtime verification (a build/version marker in the response and/or `query_database`) — never assume a push shipped a function. (Lovable's own "success" messages are also unreliable; verify against the DB.)

Links: [[2026-07-09-compute-ennustus-v7-history-folds-elu-lag-tail]].
