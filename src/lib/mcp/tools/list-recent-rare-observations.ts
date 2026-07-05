import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_recent_rare_observations",
  title: "List recent rare bird observations",
  description:
    "List recent rare bird observations relevant to Estonia (from eBird), most recent first. Read-only.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Max rows to return (1-100)"),
    country_code: z.string().length(2).optional().describe("ISO country code filter, e.g. EE, LV, FI"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, country_code }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let q = supabase
      .from("ebird_rare_observations")
      .select("species_et_name,species_lat_name,species_code,rarity_level,country_code,region,location,lat,lng,obs_date,obs_count,distance_to_ee_km")
      .order("obs_date", { ascending: false })
      .limit(limit);
    if (country_code) q = q.eq("country_code", country_code.toUpperCase());
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
