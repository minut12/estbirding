# n8n silently drops credentials and settings on import, and splits draft from published — three ways a workflow can look correct and not be

Landing `elurikkus-bulk-refresh-scheduler` (`3GQJ9ZokI5tmJgNI`) on 2026-07-13 took four rounds, none of them about the workflow's logic. The logic was right the first time. Every failure was in the gap between the JSON that was authored and the workflow that actually runs — and each one presents as something else, which is why they cost rounds.

**Findings.**

1. **Import drops `credentials` blocks whose `id` does not resolve.** The delivered JSON bound `Fire elurikkus-bulk-refresh` to a placeholder credential id (the real credential did not exist yet, by design — it holds a secret). n8n did not warn, did not error, and did not leave the block in place as a dangling reference. It **deleted the binding entirely**. The node kept `authentication: genericCredentialType, genericAuthType: httpHeaderAuth` and simply had nothing bound.

   The compounding step: with the binding gone, the UI dropdown offered exactly one credential — `J36l6pyvltfpqlJC` ("Header Auth account") — and it got selected. That credential sends `X-Webhook-Secret` = `VAATLUSTE_WEBHOOK_SECRET`. `elurikkus-bulk-refresh` reads `x-refresh-secret` against `ELURIKKUS_REFRESH_SECRET`. **Different header, different secret.**

2. **A wrong header *name* and a wrong header *value* produce a byte-identical 401.** The guard is:

   ```ts
   const secret   = req.headers.get("x-refresh-secret") || "";
   const expected = Deno.env.get("ELURIKKUS_REFRESH_SECRET") || "";
   if (!expected || secret !== expected) return 401 { error: "Unauthorized" };
   ```

   Send the wrong header name and `secret` is `""`; `"" !== expected` → the same `{"error":"Unauthorized"}` you get from a wrong value, and the same one you get from an unset env var. **Three distinct root causes, one indistinguishable symptom.** This sent the investigation into Supabase Secrets — the wrong branch entirely — and nearly produced a destructive fix (delete and re-add a secret whose value may not have been recorded anywhere else).

   Discriminator that actually works: check whether **any** credential of the right type exists in the instance at all. `list_credentials` showed exactly one httpHeaderAuth credential — so the correct one could not possibly have been bound, and the value branch was unreachable. Enumerate what exists before comparing what you cannot see.

3. **Import drops `settings.timezone`.** The delivered JSON carried `"timezone": "Europe/Tallinn"`; the imported workflow's settings came back `{executionOrder, binaryMode, availableInMCP}`. Schedule Triggers then resolve against the **instance default**. Here the default happened to already be Tallinn — proven by execution `3138` on `compute-ennustus-scheduler v2` firing at `16:00:00Z` on cron `0 7,19` (= 19:00 EEST) — so nothing was actually mis-timed. That is luck, not correctness: the same import on a UTC-default instance shifts every cron by three hours and silently reorders the pipeline. `compute-ennustus-scheduler v2` had the same hole and has been fixed the same way.

4. **`active: true` does not mean the current build is what runs.** n8n Cloud splits `versionId` (draft) from `activeVersionId` (published). After the credential fix, the workflow read:

   ```
   versionId:       bda23ea7…   ← the fix
   activeVersionId: 700335ab…   ← what cron would actually execute
   ```

   **Manual runs execute the draft; cron executes the published version.** So a fix can pass by hand, repeatedly and convincingly, while the scheduled run keeps failing on the old build — and the Executions tab shows a green manual run next to a red scheduled one with no visible cause. `publish_workflow` is a required step, not a formality. Node changes bump `versionId`; workflow-**settings** changes do not.

5. **`get_workflow_details` redacts credentials.** The node in the read-back shows **no `credentials` key even when one is correctly bound** — confirmed against `Fire compute-ennustus`, which authenticates successfully (execution `3138`) and still reads back bare. So the absence of a `credentials` block in the API response is **not evidence of anything**. This nearly triggered a second false investigation, immediately after the first.

**Consequences.**

- **Ship n8n JSON with real credential ids, or not at all.** A placeholder id is worse than no `credentials` block: it looks like a binding, imports as nothing, and hands the node to whatever else is in the dropdown. Create the credential first, read its id back with `list_credentials`, then bake it in.
- **Set `timezone` explicitly on every scheduled workflow.** Inheriting the instance default is correct only by coincidence, and the coincidence is invisible.
- **`publish_workflow` after any node-level change to an active workflow**, then verify `versionId == activeVersionId` by reading it back. A manual green run proves the draft, and only the draft.
- **The n8n MCP's own success report is not verification.** `update_workflow` returned `appliedOperations: 2, validationWarnings: []` for a credential binding that the read-back could not confirm either way (finding 5). This is the same rule already established for Lovable's "deployed" and Claude Code's "all checks pass" — n8n now joins the list. Verify against the DB and against executions.
- **The failing-401 triage order is: does the credential exist → is the header *name* right → is the value right.** Not the reverse. The value is the only one you cannot inspect, so it is the last thing to suspect, not the first.

**Lesson.** Every one of these is an artifact that was authored correctly and *silently altered on the way in*. The JSON on disk and the workflow in n8n were different objects, and nothing in the UI, the import, or the MCP surfaced the difference. Reading the workflow back after every write is not paranoia — it is the only way to see what you actually shipped. And when a symptom has multiple root causes that render identically, do not guess between them: find the observation that eliminates whole branches (here, "how many credentials of this type even exist?") rather than the one that confirms a favourite.

Links: [[2026-07-13-elurikkus-refresh-was-never-scheduled]], [[2026-07-13-lovable-auto-commit-sweeps-working-tree]], [[2026-07-05-compute-ennustus-cadence-and-parity-contract]].
