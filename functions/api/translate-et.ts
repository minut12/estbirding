interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_TRANSLATION_MODEL?: string;
}

type TranslateRequestBody = {
  text?: unknown;
  targetLang?: unknown;
  sourceLang?: unknown;
};

const MAX_TEXT_CHARS = 20_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function normalizePayload(input: TranslateRequestBody): { text: string; targetLang: string; sourceLang: string } {
  return {
    text: String(input.text || '').trim(),
    targetLang: String(input.targetLang || 'et').trim() || 'et',
    sourceLang: String(input.sourceLang || 'auto').trim() || 'auto',
  };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const raw = await request.text();
  let body: TranslateRequestBody = {};
  try {
    body = raw ? JSON.parse(raw) as TranslateRequestBody : {};
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON payload' });
  }

  const payload = normalizePayload(body);
  if (!payload.text) {
    return json(400, { ok: false, error: 'text is required' });
  }

  if (payload.text.length > MAX_TEXT_CHARS) {
    return json(413, { ok: false, error: 'Payload too large' });
  }

  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return json(503, { ok: false, error: 'OPENAI_API_KEY missing' });
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
                text: `Translate from ${payload.sourceLang} to ${payload.targetLang}. Preserve URLs, hashtags, @mentions, numbers, emojis, Latin species names, and paragraph breaks exactly. Return strict JSON only: {"translatedText":"..."}`,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: payload.text,
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
                translatedText: { type: 'string' },
              },
              required: ['translatedText'],
            },
          },
        },
      }),
    });

    if (!openAiRes.ok) {
      const raw = (await openAiRes.text()).slice(0, 300);
      return json(502, { ok: false, error: `OpenAI error HTTP ${openAiRes.status}: ${raw}` });
    }

    const data = await openAiRes.json<any>();
    const outputText = String(data?.output_text || '').trim();
    if (!outputText) {
      return json(502, { ok: false, error: 'OpenAI returned empty output' });
    }

    let parsed: { translatedText?: unknown };
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return json(502, { ok: false, error: `OpenAI returned non-JSON output: ${outputText.slice(0, 300)}` });
    }

    return json(200, {
      ok: true,
      translatedText: String(parsed.translatedText || ''),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(502, { ok: false, error: `Translation failed: ${message}` });
  }
};
