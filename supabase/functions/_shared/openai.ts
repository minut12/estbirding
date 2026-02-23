export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export function getOpenAIConfig(): OpenAIConfig | null {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim() || "";
  if (!apiKey) return null;
  const model = Deno.env.get("OPENAI_MODEL") || Deno.env.get("OPENAI_TRANSLATION_MODEL") || "gpt-4.1-mini";
  return { apiKey, model };
}

export async function translateToEstonian(input: {
  title: string;
  body: string;
  sourceLang: string;
}): Promise<{ title_et: string; body_et: string }> {
  const cfg = getOpenAIConfig();
  if (!cfg) throw new Error("Translation not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Translate title and body to Estonian. Preserve URLs, hashtags, @mentions, numbers, Latin species names, proper names, emojis, and line breaks exactly as-is. Return JSON only with keys title_et and body_et.",
        },
        {
          role: "user",
          content:
            `source_lang=${input.sourceLang}\ntarget_lang=et\n\nTITLE:\n${input.title || ""}\n\nBODY:\n${input.body || ""}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI translation failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    title_et: typeof parsed?.title_et === "string" ? parsed.title_et : "",
    body_et: typeof parsed?.body_et === "string" ? parsed.body_et : "",
  };
}
