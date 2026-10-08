---
title: species_meta server writer must never shrink the file
date: 2026-10-08
status: shipped
file: supabase/functions/europe-new-species/index.ts
tags: [decision, invariant, species-meta, storage, p104]
---

# species_meta server writer must never shrink the file

europe-new-species is the only server-side writer of `meta/species_meta_v1.json` and
`meta/custom_species_v1.json`. It must re-read right before writing and abort if either file
is missing or has fewer items than the first read, because a missing or empty read would
otherwise upload a near-empty file and wipe every species.

P104c, b667d39.
