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

An `obsidian` MCP server is registered project-scoped (`.mcp.json`). It reaches the
local EstBirding vault via the Local REST API plugin over `http://127.0.0.1:27123`.
Tools are only live when the vault is open in Obsidian; if calls fail, the vault is
probably closed — say so rather than working around it.

Expected tool capabilities (exact names come from the server at runtime): list files,
read a file, full-text search, append content, patch content, delete file.

**Read**
- The existing session-start rule stands: read `decisions/` as binding constraints.
  Pull them with the read tools (read-file / search / list) instead of assuming
  contents.
- Any hand-written note in the vault root may be read for context.

**Write — only after Kristian's explicit go. Never write unprompted.**
- New atomic decision notes: append to `decisions/`, one decision per note.
- Prefer append / patch over rewriting whole files.

**Never**
- Never write to or delete anything under `graphify/` — Graphify owns it
  (auto-generated). Read-only at most.
- Never call the delete-file tool anywhere in the vault.
- Never commit the bearer token or `.mcp.json`.
