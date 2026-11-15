-- P184c: evidence-based Ennustus lists (Juba Eestis / Lähenemas / Hooaeg) on the daily raport row.
-- Nullable and additive: old rows and the current orchestrator are unaffected. Filled by
-- toenaosus-orchestrator lists.ts (version "v5-evidence"); read by the iframe and OverviewTab
-- through the existing anon SELECT policy on toenaosus_raport.
alter table public.toenaosus_raport add column if not exists evidence_lists jsonb;
comment on column public.toenaosus_raport.evidence_lists is 'P184c v5-evidence lists: {version, as_of, juba_eestis[], lahenemas[], hooaeg[], diag}';
