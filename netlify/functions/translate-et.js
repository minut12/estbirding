const fetch = globalThis.fetch || require("node-fetch");

exports.handler = async function (event) {
  const json = (obj, statusCode = 200) => ({
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  });

  try {
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      if (params.ping === "1") return json({ ok: true, fn: "netlify/translate-et" });
      return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    if (event.httpMethod !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

    const body = event.body ? JSON.parse(event.body) : {};
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
      return json({ ok: false, error: "OPENAI_ERROR", status: r.status, details: errText.slice(0, 300) }, 502);
    }

    const data = await r.json();
    const translatedText = (data.choices?.[0]?.message?.content || "").trim();

    return json({ ok: true, translatedText });
  } catch (e) {
    return json({ ok: false, error: "UNHANDLED", message: String(e) }, 500);
  }
};
