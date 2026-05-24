# EstBirding

Estonian bird observation and prediction platform. Surfaces eBird, eElurikkus,
and GBIF data through interactive maps, arrival tracking, and migration
prediction, with Estonian-language narrative summaries.

🌐 Live app: https://estbirding.lovable.app

## Features

- **Linnuliigid** — interactive species map with eBird 7-day observation counts and probability estimates
- **Ülevaade** — daily / twice-daily observation reports synthesised from eBird and eElurikkus
- **Saabujad** — spring migrant arrival tracking against historical baselines
- **Tõenäosus** — rare-species probability prediction using neighbouring-country data
- Push notifications for rare and notable observations

## Tech stack

- React + Vite (frontend)
- Leaflet (standalone map HTMLs — Linnuliigid, Europe, Rariliin) + MapLibre GL JS (React events map)
- Supabase — PostgreSQL, Edge Functions (Deno), Storage, Auth
- n8n Cloud — workflow automation and external API relays
- OpenAI + Anthropic Claude — Estonian-language narrative generation and translation

## Data sources

- [eBird](https://ebird.org) — Cornell Lab of Ornithology
- [eElurikkus](https://elurikkus.ee) — Estonian Biodiversity Information System
- [GBIF](https://gbif.org) — Global Biodiversity Information Facility

## Translation endpoint (news translation)

The app translates non-Estonian news into Estonian via a translation HTTP endpoint and local client cache.

### App configuration

- Set `VITE_TRANSLATE_API_URL` to your translation API URL, for example:
  - `VITE_TRANSLATE_API_URL=https://<api-domain>/translate-et`
- Vite only exposes client env vars prefixed with `VITE_`.
- Runtime override is also available in app Settings (`Translation API URL`) and is stored in localStorage.
- The client never calls OpenAI directly.

## Species prediction OpenAI analysis

Species prediction keeps OpenAI server-side only:

- App -> Supabase Edge Function -> n8n -> OpenAI
- Never expose `OPENAI_API_KEY` in client-side code
- Configure `OPENAI_API_KEY` in n8n or another server-side secret store
- Optionally set `OPENAI_MODEL`; species prediction defaults to `gpt-5-mini`
- If the OpenAI stage fails, the app falls back to the deterministic prediction result
- The species prediction edge function reads the n8n webhook target from the Supabase secret `SPECIES_PREDICTION_N8N_WEBHOOK_URL`
- Required production value: `https://estbirds.app.n8n.cloud/webhook/species-prediction-evidence-first`

## CORS Proxy (Supabase Edge Function)

Use the Supabase Edge Function proxy for cross-origin bird data requests.

### Deploy

```sh
supabase functions deploy proxy
```

### Local test

```sh
supabase functions serve proxy --no-verify-jwt
curl "http://localhost:54321/functions/v1/proxy?url=https%3A%2F%2Felurikkus.ee%2Fapp%2Foccurrences%2Fsearch%3Ftext%3DKuldnokk"
```

### Browser self-test

Open:

`https://<PROJECT_REF>.supabase.co/functions/v1/proxy?url=https%3A%2F%2Felurikkus.ee%2F`

- If `401`: `verify_jwt` is still enabled for `proxy`.
- If `403`: update host allow rules in `supabase/functions/proxy/index.ts`.
- If CORS error in browser console: verify CORS headers are present on error responses.

### Allowed upstream hosts

- `elurikkus.ee`
- `www.elurikkus.ee`
- `api.ebird.org`
- Edit allowlist in `supabase/functions/proxy/index.ts` (`ALLOWED_HOSTS`)

### Frontend config

- Env var: `VITE_PROXY_BASE`
- Recommended value:
  - `https://<PROJECT_REF>.supabase.co/functions/v1/proxy?url=`
- Fallback if empty:
  - `https://api.allorigins.win/raw?url=`

### Hosting env setup

- Lovable: Project settings -> Environment variables -> add `VITE_PROXY_BASE`.
- Vercel: Project settings -> Environment Variables -> add `VITE_PROXY_BASE` for the target environments.
- Any static host: set build-time env `VITE_PROXY_BASE` before `npm run build`.

### UI setting

- Open app Settings -> `Proxy Base URL`.
- Paste your proxy base, save, and reopen map if needed.
- The Europe map top bar shows active proxy mode: `Supabase`, `Fallback`, or `Custom`.

## Deploy `ebird_recent` (required for Europe map)

The Europe map uses the dedicated Edge Function `ebird_recent` for eBird data.

Note: Supabase Edge Functions require JWT verification by default. We explicitly set `verify_jwt = false` for this public function in `supabase/config.toml`.

### Deploy

```sh
supabase link --project-ref eenwcyuyugyrjgpivxrq
supabase secrets set EBIRD_API_TOKEN="PASTE_TOKEN_HERE" --project-ref eenwcyuyugyrjgpivxrq
supabase functions deploy ebird_recent --project-ref eenwcyuyugyrjgpivxrq
```

### Verify function exists remotely

```sh
supabase functions list --project-ref eenwcyuyugyrjgpivxrq
```

### Test after deploy

```sh
curl -i "https://eenwcyuyugyrjgpivxrq.supabase.co/functions/v1/ebird_recent?regionCode=EE&back=1&maxResults=1"
```

## News schema contract

- `public.news_items` is the write-table used by ingestion/refresh functions.
- Frontend reads directly from `public.news_items` and resolves source labels from `public.news_sources`.
- News image fields: `image_url`, `cached_image_url`, `cached_image_path`.
- `news-refresh` upserts by `source_id + url` and caches images into `news-images`.

## License

This source is published for transparency. **All rights reserved.** See [LICENSE](./LICENSE).
