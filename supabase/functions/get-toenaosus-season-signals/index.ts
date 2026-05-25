// get-toenaosus-season-signals
// Public endpoint used by the n8n toenaosus-koordinaator workflow.
// Computes per-species season_signal from 10 years of elurikkus_observations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekValue(weeks: Map<number, number>, w: number): number {
  const nw = ((w - 1) % 53 + 53) % 53 + 1;
  return weeks.get(nw) ?? 0;
}

function rollingSum(weeks: Map<number, number>, center: number): number {
  let sum = 0;
  for (let offset = -2; offset <= 2; offset++) {
    sum += getWeekValue(weeks, center + offset);
  }
  return sum;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const speciesNames: string[] = Array.isArray(body?.species_names)
      ? body.species_names.filter((s: unknown) => typeof s === "string" && s.length > 0)
      : [];

    if (speciesNames.length === 0) {
      return new Response(
        JSON.stringify({ results: [], error: "species_names must be a non-empty string array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (speciesNames.length > 200) {
      return new Response(
        JSON.stringify({ results: [], error: "species_names exceeds 200 limit" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tenYearsAgo = new Date();
    tenYearsAgo.setUTCFullYear(tenYearsAgo.getUTCFullYear() - 10);
    const sinceIso = tenYearsAgo.toISOString();

    const PAGE_SIZE = 1000;
    const SAFETY_CAP = 50000;
    const allRows: { species_name: string; observed_at: string }[] = [];
    let from = 0;
    while (from < SAFETY_CAP) {
      const { data, error } = await supabase
        .from("elurikkus_observations")
        .select("species_name, observed_at")
        .in("species_name", speciesNames)
        .gte("observed_at", sinceIso)
        .order("observed_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return new Response(
          JSON.stringify({ results: [], error: `db error: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const stats = new Map<string, { total: number; weeks: Map<number, number> }>();
    for (const row of allRows) {
      const sn = row.species_name;
      if (!stats.has(sn)) stats.set(sn, { total: 0, weeks: new Map() });
      const s = stats.get(sn)!;
      s.total += 1;
      const w = getISOWeek(new Date(row.observed_at));
      s.weeks.set(w, (s.weeks.get(w) || 0) + 1);
    }

    const currentWeek = getISOWeek(new Date());

    const results = speciesNames.map((sn) => {
      const s = stats.get(sn) ?? { total: 0, weeks: new Map<number, number>() };

      const currentWeekObs = s.weeks.get(currentWeek) ?? 0;
      let peakWeekObs = 0;
      for (const v of s.weeks.values()) if (v > peakWeekObs) peakWeekObs = v;

      const currentSmoothed = rollingSum(s.weeks, currentWeek);
      let peakSmoothed = 0;
      for (let w = 1; w <= 53; w++) {
        const v = rollingSum(s.weeks, w);
        if (v > peakSmoothed) peakSmoothed = v;
      }

      let season_signal: number;
      if (s.total < 5 || peakSmoothed === 0) {
        season_signal = 0.5;
      } else {
        const rawRatio = Math.max(0, Math.min(1, currentSmoothed / peakSmoothed));
        const confidence = Math.min(1, s.total / 30);
        season_signal = confidence * rawRatio + (1 - confidence) * 0.5;
      }

      return {
        species_name: sn,
        total_obs: s.total,
        current_week_obs: currentWeekObs,
        peak_week_obs: peakWeekObs,
        current_smoothed: currentSmoothed,
        peak_smoothed: peakSmoothed,
        confidence: Math.round(Math.min(1, s.total / 30) * 1000) / 1000,
        season_signal: Math.round(season_signal * 1000) / 1000,
      };
    });

    return new Response(
      JSON.stringify({
        results,
        page_count: Math.ceil(allRows.length / PAGE_SIZE),
        total_rows: allRows.length,
        current_week: currentWeek,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ results: [], error: `unhandled: ${(err as Error)?.message ?? "unknown"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
