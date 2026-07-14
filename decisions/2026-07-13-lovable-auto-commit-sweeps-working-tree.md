# Lovable auto-commits the whole working tree on every agent action — "do not commit" is unenforceable here

Lovable commits to `main` on every agent action, and it stages the **entire working tree** — not just the files its own agent edited. Discovered on 2026-07-13 when commit `b4717eb` ("added a new decision file for the Elurikkus refresh that was never scheduled.") swept up an ADR that Claude Code had just written and **explicitly left uncommitted**. Lovable never touched that file; it committed it anyway. That is the proof of whole-tree staging — a selective `git add <own file>` could not have produced it.

**Finding.**

1. **Lovable stages the whole tree, not its own diff.** `b4717eb` committed `decisions/2026-07-13-elurikkus-refresh-was-never-scheduled.md`, a Claude-Code-authored file Lovable had no part in. The only way that file enters a Lovable commit is `git add -A`-style staging.
2. **The clean commits are clean by timing, not by selection.** Nearby Lovable commits (`ec673b5`, `7576218`, `71b809a`) each show a single file only because at those instants the tree held exactly one changed file — Lovable's own edge-function edit. `b4717eb` has the same shape for the opposite reason: at 20:59 the only uncommitted thing in the tree was the ADR, so that is what got swept.
3. **The generic `Changes` commits are Lovable.** It commits on every agent action; that is why `ec673b5`, `71b809a`, `06ae6c4`, and the run of `Changes` commits are in the history. Expected. Sweeping up an *unrelated* working-tree file is not.

**Consequences.**

- **"Do not commit, I'll review the diff first" is not enforceable in this repo.** Whatever sits uncommitted in the working tree when a Lovable action fires — half-finished edits, debug code, a stray `.env` if it ever escaped `.gitignore` — can land on `main` before it is reviewed. Every phase gate we run (locate → diff → explicit go → commit) has a hole: a Lovable action between "diff shown" and "go" can commit the tree out from under the review.
- **Lovable's own self-reports are unreliable — four times in this one session:** a duplicate `const` block that would not compile; two summaries that contradicted their own diffs; and an error-halt block that reported `outCursor` set for resumability when the committed code omitted it entirely (the halt returned `cursor: null` — silently non-resumable). Combined with tree-sweeping auto-commit, the failure mode compounds: an agent can ship a broken edit, **misreport it as clean, and commit it before the diff is reviewed** — three independent mechanisms lining up into one bad merge to `main`.
- **`get_diff` on every returned SHA is therefore mandatory, not optional.** It is the only gate that actually holds: it reads what was really committed, independent of the agent's self-report and independent of when the commit fired. Across the four misreports the summary was right 0% of the time and the diff carried the truth 100%. But the diff is a gate only if it is read *literally* — line by line against the spec, not skimmed for intent: the missing `outCursor` was present in the diff yet slipped a summary-level read (the reviewer pattern-matched to the code they had specified) and was caught only on an independent close read. The diff is not a formality; it is the only signal — and it must actually be read.
- **Practical converse of an existing invariant.** We already knew `git push` does not deploy edge functions. The other direction is now documented: a Lovable deploy / agent action **does** commit. Two directions, both surprising — deploys and commits are coupled to Lovable's actions, not to git.

**Mitigation.**

- **Commit or stash all Claude Code work before invoking any Lovable action.** Keep the working tree empty of anything you don't want on `main` whenever a Lovable action might fire.
- **Treat "left uncommitted" as provisional whenever both tools are live.** Claude Code reporting a file as untracked is true at the instant it says so; it is not a guarantee the file stays uncommitted.
- **Run `get_diff` on every SHA Lovable returns**, and read the diff — not the summary — before trusting or building on the change.

Note, dryly: this ADR was written by Claude Code and left uncommitted. If it reached `main` via a Lovable commit rather than a deliberate one, that commit is itself an instance of the mechanism it documents.

Links: [[2026-07-13-elurikkus-refresh-was-never-scheduled]], [[2026-07-13-elurikkus-api-is-reachable-via-post]].
