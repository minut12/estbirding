# n8n Workflow: OpenAI News Translation Cache (`POST /translate`)

## Goal
- Receive `{ id, title?, body?, target: "et" }`
- Reuse cached translations by key: `${id}:${sha256(title + "\n\n" + body)}`
- If cache miss, translate with OpenAI and return `{ title_et, body_et }`

## Prerequisites
- n8n instance reachable from the app.
- n8n Data Store (or equivalent KV) configured.
- OpenAI credentials configured in n8n.

## Workflow Nodes (in order)

1. `Webhook`
- Method: `POST`
- Path: `translate`
- Response mode: `Using Respond to Webhook node`
- Keep `Webhook URL` and set it as `VITE_TRANSLATE_API_URL` (or `TRANSLATE_API_URL`) in the app.

2. `Set` (Normalize Input)
- Keep only:
  - `id` (string)
  - `title` (string, default `""`)
  - `body` (string, default `""`)
  - `target` (string, default `"et"`)

3. `Code` (Build Cache Key)
- JavaScript code:
```js
const crypto = require('crypto');
const id = String($json.id || '').trim();
const title = String($json.title || '');
const body = String($json.body || '');
const payload = `${title}\n\n${body}`;
const hash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
return [{ json: { ...$json, cache_key: `${id}:${hash}` } }];
```

4. `Data Store` (Get Cached Translation)
- Operation: `Get`
- Key: `={{ $json.cache_key }}`
- Store name: e.g. `news_translation_cache`

5. `IF` (Cache Hit?)
- Condition: cached record exists (for example `{{$json.value}}` is not empty, depending on Data Store output shape).

6. `Respond to Webhook` (Cache Hit Branch)
- Response JSON:
```json
{
  "title_et": "={{ $json.value.title_et || '' }}",
  "body_et": "={{ $json.value.body_et || '' }}"
}
```
- Add headers:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization`

7. `OpenAI Chat Model` (Cache Miss Branch)
- Model: e.g. `gpt-4.1-mini`
- System message:
  - `Translate bird-related news to Estonian. Use correct official Estonian bird names (eesti linnunimed) — do NOT literally translate bird common names from the source language. Preserve URLs, hashtags, @mentions, numbers, Latin species names, and emojis. Keep paragraph breaks. Output JSON: {"title_et":"...","body_et":"..."}.`
- User message:
  - Include title and body, for example:
```text
title:
{{$json.title}}

body:
{{$json.body}}
```

8. `Code` (Parse Model JSON)
- Parse model output, fallback safely:
```js
const raw = String($json.text || $json.output || '').trim();
let parsed = { title_et: '', body_et: '' };
try {
  parsed = JSON.parse(raw);
} catch {
  // Optional: extract first JSON object if model wrapped text around it.
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try { parsed = JSON.parse(m[0]); } catch {}
  }
}
return [{
  json: {
    ...$json,
    title_et: String(parsed.title_et || ''),
    body_et: String(parsed.body_et || ''),
  },
}];
```

9. `Data Store` (Write Cache)
- Operation: `Set`
- Key: `={{ $json.cache_key }}`
- Value:
```json
{
  "title_et": "={{ $json.title_et }}",
  "body_et": "={{ $json.body_et }}",
  "updated_at": "={{ $now }}"
}
```

10. `Respond to Webhook` (Cache Miss Branch)
- Response JSON:
```json
{
  "title_et": "={{ $json.title_et }}",
  "body_et": "={{ $json.body_et }}"
}
```
- Add same CORS headers as in step 6.

## CORS + OPTIONS
- In n8n, either:
  - Enable CORS globally, or
  - Add a second `Webhook` for `OPTIONS /translate` that returns status `204` with CORS headers.

## Expected App Request
```json
{
  "id": "news-item-id",
  "title": "Original title",
  "body": "Original body",
  "target": "et"
}
```

## Expected Response
```json
{
  "title_et": "Pealkiri eesti keeles",
  "body_et": "Sisu eesti keeles"
}
```
