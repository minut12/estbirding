export type TranslateProvider = "openai" | "deepl";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export function isAutoTranslateEnabled(): boolean {
  const raw = Deno.env.get("AUTO_TRANSLATE_TO_ET");
  if (raw == null) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function translate(
  text: string,
  sourceLang: string,
  targetLang = "et",
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || sourceLang.toLowerCase() === targetLang.toLowerCase()) return text;

  const provider = (Deno.env.get("TRANSLATION_PROVIDER") || "openai").toLowerCase() as TranslateProvider;
  if (provider === "deepl") {
    return await translateWithDeepL(trimmed, sourceLang, targetLang);
  }
  return await translateWithOpenAI(trimmed, sourceLang, targetLang);
}

async function translateWithOpenAI(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = Deno.env.get("OPENAI_TRANSLATION_MODEL") || DEFAULT_OPENAI_MODEL;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "You are a translation engine. Return only the translated text with no commentary.",
        },
        {
          role: "user",
          content: `Translate the following text from ${sourceLang} to ${targetLang}. Keep meaning and neutral tone.\n\n${text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI translation failed: HTTP ${res.status} ${body}`);
  }

  const data = await res.json();
  const translated = data?.choices?.[0]?.message?.content;
  if (typeof translated !== "string" || !translated.trim()) {
    throw new Error("OpenAI translation returned empty content");
  }
  return translated.trim();
}

async function translateWithDeepL(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const apiKey = Deno.env.get("DEEPL_API_KEY");
  if (!apiKey) throw new Error("DEEPL_API_KEY is not configured");

  const params = new URLSearchParams();
  params.set("text", text);
  params.set("target_lang", targetLang.toUpperCase());
  if (sourceLang) params.set("source_lang", sourceLang.toUpperCase());

  const res = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepL translation failed: HTTP ${res.status} ${body}`);
  }

  const data = await res.json();
  const translated = data?.translations?.[0]?.text;
  if (typeof translated !== "string" || !translated.trim()) {
    throw new Error("DeepL translation returned empty content");
  }
  return translated.trim();
}
