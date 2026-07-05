import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_recent_news",
  title: "List recent birding news",
  description:
    "List recent birding news items ingested by EstBirding, most recent first. Returns Estonian titles when available. Read-only.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(15).describe("Max items to return (1-50)"),
    source_slug: z.string().optional().describe("Filter by source slug (e.g. 'eoy')"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, source_slug }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let q = supabase
      .from("news_items_v")
      .select("id,title,title_et,summary,url,published_at,source_slug,source_name,image_url")
      .eq("archived", false)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (source_slug) q = q.eq("source_slug", source_slug);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
