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

## Server secrets (news translation)

Set secrets only in Supabase Edge Functions environment (never in client code or DB):

- `OPENAI_API_KEY`
- Optional: `OPENAI_MODEL` (default `gpt-4.1-mini`)
- Optional: `AUTO_TRANSLATE_TO_ET` (`true` by default)

## Client env vars (web + mobile builds)

The client requires a cloud Supabase URL and anon key at build time.

- Required (Vite/Lovable): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Alternative fallbacks supported in runtime config:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Rules validated at runtime:

- URL must be `https://...`
- URL must be `.supabase.co` or another non-localhost HTTPS custom domain
- Anon key length must be `> 20`

If invalid, app startup throws:

`Supabase URL/Key missing or invalid in this build. SUPABASE_URL=<value>`

For Lovable/mobile pipelines, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in project/build environment settings, not only in local `.env.local`.
