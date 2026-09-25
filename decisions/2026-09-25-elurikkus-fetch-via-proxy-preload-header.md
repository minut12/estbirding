---
title: Elurikkus page fetches go through elurikkus-proxy (Link rel=preload)
date: 2026-09-25
status: authored-pending-verification
map: Rariliin
file: public/maps/rariliin/index.html
tags: [decision, rariliin, elurikkus, proxy, network]
---

# Elurikkus page fetches go through elurikkus-proxy (Link rel=preload)

**Map:** [[Rariliin]] · `public/maps/rariliin/index.html` (P84g, commit 11477e8)

A direct `fetch()` of an elurikkus.ee search page makes Chrome preload about 45 of the site's CSS/JS files, because the response's `Link: rel=preload` header lists them. This happens even though our code only reads the HTML as text. The Supabase `elurikkus-proxy` drops that header, so Elurikkus page fetches should go through `_fetchHtmlWithFallback`, which tries the proxy first when it has the anon key, rather than straight to the site.

Verified 25 Sep: direct fetch = 46 requests (1 + 45 preloads); the proxy response carries no `Link` header (curl). In-app 1-request count not yet measured.
