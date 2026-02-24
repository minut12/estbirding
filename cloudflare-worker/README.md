# Cloudflare Worker: Estonian Translation API

This Worker exposes a translation endpoint for the app:

- `POST /translate-et`
- `POST /` (also supported)

Request JSON:

```json
{
  "id": "news-item-id",
  "title": "Original title",
  "body": "Original body"
}
```

Response JSON:

```json
{
  "title_et": "Translated title",
  "body_et": "Translated body"
}
```

## Deploy with Wrangler

```sh
cd cloudflare-worker
wrangler login
wrangler secret put OPENAI_API_KEY
wrangler deploy
```

Optional model override:

```sh
wrangler secret put OPENAI_TRANSLATION_MODEL
```

## Deploy with Cloudflare Dashboard

1. Go to Workers & Pages.
2. Create Worker.
3. Open editor and paste code from `src/index.ts`.
4. Add secret `OPENAI_API_KEY`.
5. Deploy.

## Enable workers.dev URL

In Worker settings, ensure `workers.dev` is enabled.

Final endpoint example:

`https://<worker-name>.<account>.workers.dev/translate-et`

