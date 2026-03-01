# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Translation endpoint (news translation)

The app translates non-Estonian news into Estonian via a translation HTTP endpoint and local client cache.

### App configuration

- Set `VITE_TRANSLATE_API_URL` to your translation API URL, for example:
  - `VITE_TRANSLATE_API_URL=https://<api-domain>/translate-et`
- Vite only exposes client env vars prefixed with `VITE_`.
- Runtime override is also available in app Settings (`Translation API URL`) and is stored in localStorage.
- The client never calls OpenAI directly.

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
- `public.news_items_v` is the read-view used by frontend queries.
- `news_items_v` must provide: `id`, `source_id`, `source_key`, `source_name`, `title`, `url`, `summary/body`, `published_at`, `created_at`, `image_url`, `cached_image_url`, `cached_image_path`.
- `source_name` is always derived via `COALESCE(news_sources.name, news_sources.key, news_sources.slug, ...)` so UI can render safely.
- Frontend falls back to querying `news_items` directly if `news_items_v` is missing or column-mismatched.
