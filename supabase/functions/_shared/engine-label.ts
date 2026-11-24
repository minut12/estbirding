// engine-label.ts -- P188: which model family really wrote a news translation.
// news-translate-v2 stores it in news_items.translation_engine and uses it as the
// error prefix. llm.ts tags a backup answer with llm_provider; a real Claude
// response has none. Pure, no Deno (imported under vitest too).

export type EngineLabel = "sonnet" | "gemini" | "mistral";

export type EngineTagged = { llm_provider?: string };

/** "gemini" / "mistral" when a backup answered, otherwise "sonnet". */
export function engineLabel(resp: EngineTagged | null | undefined): EngineLabel {
  const p = resp ? resp.llm_provider : undefined;
  return p === "gemini" || p === "mistral" ? p : "sonnet";
}
