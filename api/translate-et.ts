import OpenAI from 'openai';

type TranslateInput = {
  id?: unknown;
  title?: unknown;
  body?: unknown;
};

const MAX_TEXT_CHARS = 20_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function json(res: any, status: number, payload: Record<string, unknown>): void {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(payload));
}

function readClientIp(req: any): string {
  const fromHeader = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return fromHeader || String(req.socket?.remoteAddress || 'unknown');
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const current = rateLimit.get(ip);
  if (!current || current.resetAt < now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function normalizePayload(input: TranslateInput): { id: string; title: string; body: string } {
  return {
    id: String(input.id || '').trim(),
    title: String(input.title || '').trim(),
    body: String(input.body || '').trim(),
  };
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const ip = readClientIp(req);
  if (!checkRateLimit(ip)) {
    json(res, 429, { error: 'Too many requests' });
    return;
  }

  const payload = normalizePayload(req.body || {});
  if (!payload.id || (!payload.title && !payload.body)) {
    json(res, 400, { error: 'Invalid payload' });
    return;
  }
  if (payload.title.length + payload.body.length > MAX_TEXT_CHARS) {
    json(res, 413, { error: 'Payload too large' });
    return;
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    json(res, 503, { error: 'OPENAI_API_KEY missing' });
    return;
  }

  try {
    const model = String(process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4.1-mini').trim();
    const client = new OpenAI({ apiKey });

    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Translate to Estonian. Preserve URLs, hashtags, @mentions, numbers, emojis, Latin species names, and paragraph breaks. Return strict JSON only with keys "title_et" and "body_et".',
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
    });

    const raw = String(response.output_text || '').trim();
    const parsed = JSON.parse(raw) as { title_et?: unknown; body_et?: unknown };
    json(res, 200, {
      title_et: String(parsed.title_et || ''),
      body_et: String(parsed.body_et || ''),
    });
  } catch (error) {
    json(res, 502, { error: 'Translation failed' });
  }
}
