import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_upcoming_events",
  title: "List upcoming birding events",
  description: "List upcoming Estonian birding events (talgud, retked, koolitused). Read-only.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Max events (1-50)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { events: data ?? [] },
    };
  },
});
