---
name: vaatluste-koordinaator pipeline characteristics
description: Real-world behavior of the n8n + Anthropic + Supabase observation report pipeline observed during first end-to-end run on 2026-05-01
type: project
---

The vaatluste-koordinaator pipeline (curl → n8n webhook → eBird → Anthropic Sonnet 4.6 → insert-vaatluste-raport edge function → vaatluste_raport row) is wired end-to-end and produces well-shaped rows. Spec is in docs/vaatluste-koordinaator.md.

**Why:** First successful end-to-end run on 2026-05-01 (`smoke-test-v5e`) surfaced several deviations from the spec's estimates that are worth knowing before changing anything in this pipeline.

**How to apply:** When debugging, costing, or modifying this pipeline, remember:

- **Wallclock per run is ~2 minutes**, not the ~30 s implied by the doc. Anthropic processes ~220k input tokens; polling for a new row should give it at least 150 s before assuming failure.
- **eBird Europe (back=14, detail=full across 7 regions) returns ~1000 observations**, not the ~200 the doc estimates. This drives the high token count.
- **Token usage per run: ~222k input + ~5.6k output** ≈ $0.75/run on Sonnet 4.6. Two cron runs/day ≈ $45/month. The doc's "small daily cost" estimate is off by ~15×.
- **Translation drift exists for less-common species.** First run mistranslated *Vanellus gregarius* as "Kodupartlane" (correct: "stepi-kiivitaja"). If we ship without a canonical Estonian-name dictionary in the prompt, expect occasional bad species_et values on rarities.
- **Direct testing of insert-vaatluste-raport** with a synthetic body and the shared webhook secret is the fastest way to isolate edge-function-side issues from n8n-side issues. Pattern saved a lot of debugging time when the n8n side was failing silently.
