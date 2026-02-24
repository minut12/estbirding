interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_TRANSLATION_MODEL?: string;
}

type TranslateInput = {
  id?: unknown;
  title?: unknown;
  body?: unknown;
};

const MAX_TEXT_CHARS = 20_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function normalizePayload(input: TranslateInput): { id: string; title: string; body: string } {
  return {
    id: String(input.id || '').trim(),
    title: String(input.title || '').trim(),
    body: String(input.body || '').trim(),
  };
}

function extractOutputText(data: any): string {
  const direct = String(data?.output_text || '').trim();
  if (direct) return direct;
  const parts: string[] = [];
  const outputs = Array.isArray(data?.output) ? data.output : [];
  for (const output of outputs) {
    const content = Array.isArray(output?.content) ? output.content : [];
    for (const chunk of content) {
      if (chunk?.type === 'output_text' && typeof chunk?.text === 'string') {
        parts.push(chunk.text);
      }
    }
  }
  return parts.join('').trim();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    if (pathname === '/health' && request.method === 'GET') {
      return json(200, { ok: true });
    }

    if (pathname !== '/' && pathname !== '/translate-et') {
      return json(404, { error: 'Not found' });
    }
    if (request.method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    let body: TranslateInput;
    try {
      const raw = await request.text();
      body = JSON.parse(raw || '{}') as TranslateInput;
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const payload = normalizePayload(body);
    if (!payload.id || (!payload.title && !payload.body)) {
      return json(400, { error: 'Invalid payload' });
    }
    if (payload.title.length + payload.body.length > MAX_TEXT_CHARS) {
      return json(413, { error: 'Payload too large' });
    }

    const apiKey = String(env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      return json(503, { error: 'OPENAI_API_KEY missing' });
    }
    const model = String(env.OPENAI_TRANSLATION_MODEL || 'gpt-4.1-mini').trim();

    try {
      const openAiRes = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: 'Translate to Estonian. If already Estonian, return unchanged. Preserve URLs, hashtags, @mentions, numbers, emojis, Latin species names, and paragraph breaks exactly. Return strict JSON only: {"title_et":"...","body_et":"..."}.',
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: `id: ${payload.id}\n\nTitle:\n${payload.title}\n\nBody:\n${payload.body}`,
                },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'et_translation',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title_et: { type: 'string' },
                  body_et: { type: 'string' },
                },
                required: ['title_et', 'body_et'],
              },
            },
          },
        }),
      });

      if (!openAiRes.ok) {
        const raw = (await openAiRes.text()).slice(0, 300);
        return json(502, { error: `OpenAI error HTTP ${openAiRes.status}: ${raw}` });
      }

      const data = await openAiRes.json<any>();
      const outputText = extractOutputText(data);
      if (!outputText) {
        return json(502, { error: 'OpenAI returned empty output' });
      }

      let parsed: { title_et?: unknown; body_et?: unknown };
      try {
        parsed = JSON.parse(outputText);
      } catch {
        return json(502, { error: `OpenAI returned non-JSON output: ${outputText.slice(0, 300)}` });
      }

      return json(200, {
        title_et: String(parsed.title_et || ''),
        body_et: String(parsed.body_et || ''),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json(502, { error: `Translation failed: ${message}` });
    }
  },
};
