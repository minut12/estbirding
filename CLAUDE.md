## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Project memory — decision notes

At the start of each session, before making code changes, read any notes in
`C:\Users\Kasutaja\Obsidian\EstBirding\decisions\` (skip silently if the folder
is absent or empty). These hold architecture invariants and rationale the code
graph cannot infer — treat them as binding constraints, not suggestions.

When we establish an architecture decision, a load-bearing invariant, or a
non-obvious fix during a session, offer to capture it as an atomic note in that
`decisions\` folder before the session ends: propose a descriptive filename and a
2–3 sentence body, and write it only after I confirm. One idea per note; record
the *why*, not exhaustive documentation. If a note on that topic already exists,
update it rather than create a duplicate. Create the folder if it doesn't exist.

## Obsidian vault access (MCP)

The `obsidian` MCP server (project-scoped, `.mcp.json`) reaches the local vault via the
Local REST API plugin on `http://127.0.0.1:27123`. Tools are **vault-relative** and only
work while Obsidian is open with the EstBirding vault.

Layout note: this repo is nested inside the vault at `EstBirding/estbirding/`. Therefore:

- Repo files — `decisions/`, `memory/`, `graphify-out/`, source — are already in your
  native working directory. Read and write them with normal file tools. **Do NOT use the
  Obsidian MCP for anything inside the repo**; via MCP they'd need an `estbirding/` prefix
  and it only duplicates native access.
- `decisions/` lives IN the repo (`estbirding/decisions/`): create-if-absent, read at
  session start as binding constraints — all native, no MCP.
- `graphify-out/` is Graphify-owned. Read-only. Never write or delete.

**Use the Obsidian MCP only for vault-root notes OUTSIDE the repo** — the daily notes
(e.g. `2026-06-30.md`) and hand-written planning notes — to pull that context into a
session.

**Read-only by default.** Use the read/search tools only. Do not append, patch, create,
delete, or move any vault file unless Kristian explicitly says so in that session. Never
call the delete tool anywhere in the vault. Never commit the bearer token or `.mcp.json`.
