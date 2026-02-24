import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function plainText(input: string | null | undefined): string {
  return (input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimForModel(input: string, max = 12000): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max)}...`;
}

async function translateWithOpenAI(params: {
  title: string;
  summary: string;
  content: string;
  sourceLang: string;
  targetLang: string;
}): Promise<{ title: string; summary: string; content: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const model = Deno.env.get("OPENAI_MODEL") || Deno.env.get("OPENAI_TRANSLATION_MODEL") || "gpt-4.1-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Translate title, summary, and content. Return plain text only in JSON keys title, summary, content. No markdown, no code fences.",
        },
        {
          role: "user",
          content:
            `source_lang=${params.sourceLang}\ntarget_lang=${params.targetLang}\n\nTITLE:\n${trimForModel(params.title, 3000)}\n\nSUMMARY:\n${trimForModel(params.summary, 4000)}\n\nCONTENT:\n${trimForModel(params.content, 12000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI translation failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const raw = String(data?.choices?.[0]?.message?.content || "{}");
  const parsed = JSON.parse(raw);

  return {
    title: plainText(String(parsed?.title || "")).trim(),
    summary: plainText(String(parsed?.summary || "")).trim(),
    content: plainText(String(parsed?.content || "")).trim(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number.isFinite(Number(body?.limit)) ? Math.max(1, Math.min(25, Number(body.limit))) : 10;

    const { data: rows, error } = await supabase
      .from("news_items")
      .select(`
        id,
        title,
        summary,
        content,
        source_lang,
        news_sources!inner(target_lang)
      `)
      .order("published_at", { ascending: false })
      .limit(limit * 3);

    if (error) throw error;

    const candidates = (rows || []) as Array<any>;
    let translatedCount = 0;
    let failedCount = 0;
    let processed = 0;

    for (const row of candidates) {
      if (processed >= limit) break;
      const targetLang = row.news_sources?.target_lang as string;
      if (!targetLang || targetLang === row.source_lang) continue;

      const { data: existing } = await supabase
        .from("news_translations")
        .select("status, tries")
        .eq("item_id", row.id)
        .eq("target_lang", targetLang)
        .maybeSingle();

      const status = existing?.status as string | undefined;
      const tries = Number(existing?.tries || 0);
      const needsTranslation = !existing || status === "pending" || (status === "failed" && tries < 5);
      if (!needsTranslation) continue;

      processed++;

      try {
        const translated = await translateWithOpenAI({
          title: plainText(row.title || ""),
          summary: plainText(row.summary || ""),
          content: plainText(row.content || ""),
          sourceLang: row.source_lang || "auto",
          targetLang,
        });

        const { error: upsertError } = await supabase
          .from("news_translations")
          .upsert({
            item_id: row.id,
            target_lang: targetLang,
            title: translated.title || plainText(row.title || ""),
            summary: translated.summary || plainText(row.summary || "") || null,
            content: translated.content || plainText(row.content || "") || null,
            status: "done",
            tries: tries + 1,
            last_error: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "item_id,target_lang" });

        if (upsertError) throw upsertError;
        translatedCount++;
      } catch (error) {
        failedCount++;
        await supabase
          .from("news_translations")
          .upsert({
            item_id: row.id,
            target_lang: targetLang,
            title: plainText(row.title || "") || "(translation failed)",
            summary: plainText(row.summary || "") || null,
            content: plainText(row.content || "") || null,
            status: "failed",
            tries: tries + 1,
            last_error: String((error as Error)?.message || error).slice(0, 1000),
            updated_at: new Date().toISOString(),
          }, { onConflict: "item_id,target_lang" });
      }
    }

    return new Response(JSON.stringify({ success: true, translated_count: translatedCount, failed_count: failedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("cron_translate_news error", error);
    return new Response(JSON.stringify({ error: String((error as Error)?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
