// functions/api/translate-et.ts
export default async function handler(req: Request): Promise<Response> {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

  try {
    const url = new URL(req.url);

    if (req.method === "GET" && url.searchParams.get("ping") === "1") {
      return json({ ok: true, fn: "api/translate-et" });
    }

    if (req.method !== "POST") {
      return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    const body = await req.json().catch(() => ({} as any));
    const text = typeof body.text === "string" ? body.text : "";
    const targetLang = typeof body.targetLang === "string" ? body.targetLang : "et";
    const sourceLang = typeof body.sourceLang === "string" ? body.sourceLang : "";

    if (!text.trim()) return json({ ok: false, error: "MISSING_TEXT" }, 400);
    if (text.length > 12000) return json({ ok: false, error: "TEXT_TOO_LARGE" }, 413);

    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) return json({ ok: false, error: "OPENAI_API_KEY_MISSING" }, 500);

    const sys =
      `You are a translation engine. Translate the user text to ${targetLang}. ` +
      `Return ONLY the translation. Preserve paragraphs. No commentary.`;

    const user = sourceLang
      ? `Source language: ${sourceLang}\n\nText:\n${text}`
      : `Text:\n${text}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return json(
        { ok: false, error: "OPENAI_ERROR", status: r.status, details: errText.slice(0, 400) },
        502
      );
    }

    const data = await r.json();
    const translatedText = (data?.choices?.[0]?.message?.content || "").trim();
    return json({ ok: true, translatedText });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: "UNHANDLED", message: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
