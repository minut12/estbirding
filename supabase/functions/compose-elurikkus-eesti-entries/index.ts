// supabase/functions/compose-elurikkus-eesti-entries/index.ts
//
// Composes the Eesti tab entries for the elurikkus_raport.
// Replaces the cap+rank logic that was inside the n8n Code node.
//
// Auth: X-Webhook-Secret header (shared with insert-elurikkus-raport).
//
// Input:  POST { period_start: "YYYY-MM-DD", period_end: "YYYY-MM-DD" }
// Output: {
//   entries: Array<{
//     species_et, species_lat, date, location, sub_region, lat, lng,
//     count, observer, rarity_level, observers,
//     sights_stats: { total_obs, observer_count, first_date, last_date }
//   }>,
//   stats: { raw_in_period, after_dedup, rare_kept, none_kept, total_returned, dict_coverage }
// }
//
// Logic:
//   1. Fetch all elurikkus_observations in [period_start, period_end].
//   2. Look up species_meta_v1.json rarity per species_name (authoritative).
//   3. Group by species_name, build per-species summary (top 1 representative obs + sights_stats).
//   4. Sort: rare-tier desc, then total_obs desc, then earliest date asc.
//   5. Cap: keep ALL species with rarity_level ∈ {rare, super, mega}, then fill remaining
//      slots up to 200 total with rarity_level=none species sorted by obs count desc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("N8N_VAATLUSTE_WEBHOOK_SECRET") ?? "";

const TOTAL_CAP = 200;
const SPECIES_META_URL_PATH = "/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json";

const RARITY_TIERS = ["mega", "super", "rare", "none"] as const;
type RarityTier = typeof RARITY_TIERS[number];
const TIER_RANK: Record<RarityTier, number> = { mega: 3, super: 2, rare: 1, none: 0 };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-webhook-secret, content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ObsRow {
  species_name: string;
  species_lat: string | null;
  observed_at: string;        // YYYY-MM-DD
  locality: string | null;
  county: string | null;
  lat: number | null;
  lon: number | null;
  observer: string | null;
  individual_count: number | null;
  sub_id: string | null;
}

interface SpeciesMetaItem {
  rarityLevel?: string;
  scientificName?: string;
  ebirdCode?: string;
}

function normalizeRarity(raw: unknown): RarityTier {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === "mega" || s === "super" || s === "rare") return s as RarityTier;
  return "none";
}

async function loadSpeciesMeta(): Promise<Record<string, SpeciesMetaItem>> {
  const url = `${SUPABASE_URL}${SPECIES_META_URL_PATH}?_=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`species_meta fetch failed: HTTP ${res.status}`);
  const data = await res.json() as { items?: Record<string, SpeciesMetaItem> };
  return (data && typeof data === "object" ? data.items : null) ?? {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
    return json({ error: "server_misconfigured" }, 500);
  }
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!provided || provided !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);

  let body: { period_start?: unknown; period_end?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const periodStart = typeof body.period_start === "string" ? body.period_start : "";
  const periodEnd = typeof body.period_end === "string" ? body.period_end : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return json({ error: "missing_or_invalid_period" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Load rarity dictionary.
  let meta: Record<string, SpeciesMetaItem>;
  try {
    meta = await loadSpeciesMeta();
  } catch (err) {
    console.warn("[compose-elurikkus-eesti-entries] species_meta load failed:", err);
    meta = {};
  }
  const dictCoverage = Object.values(meta).filter((m) => normalizeRarity(m?.rarityLevel) !== "none").length;

  // Fetch all observations in period.
  // Use pagination — Supabase SDK default limit is 1000.
  const allRows: ObsRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("elurikkus_observations")
      .select("species_name, species_lat, observed_at, locality, county, lat, lon, observer, individual_count, sub_id")
      .gte("observed_at", periodStart)
      .lte("observed_at", periodEnd)
      .order("observed_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn("[compose-elurikkus-eesti-entries] fetch error:", error.message);
      return json({ error: "fetch_failed", detail: error.message }, 500);
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as ObsRow[]));
    if (data.length < PAGE) break;
  }

  const rawCount = allRows.length;

  // Dedup observation rows on sub_id (per project notes, sub_id is the natural key with NULLS NOT DISTINCT).
  const seenSubIds = new Set<string>();
  const dedupedRows: ObsRow[] = [];
  for (const row of allRows) {
    const k = row.sub_id ?? `${row.species_name}|${row.observed_at}|${row.locality ?? ""}`;
    if (seenSubIds.has(k)) continue;
    seenSubIds.add(k);
    dedupedRows.push(row);
  }

  // Group by species.
  type SpeciesAgg = {
    species_name: string;
    species_lat: string | null;
    rarity_level: RarityTier;
    rows: ObsRow[];
    representative: ObsRow;     // earliest observation
    observer_set: Set<string>;
    first_date: string;
    last_date: string;
  };
  const bySpecies = new Map<string, SpeciesAgg>();
  for (const row of dedupedRows) {
    const sciFromMeta = meta[row.species_name]?.scientificName;
    const speciesLat = row.species_lat || sciFromMeta || null;
    const rarity = normalizeRarity(meta[row.species_name]?.rarityLevel);

    let agg = bySpecies.get(row.species_name);
    if (!agg) {
      agg = {
        species_name: row.species_name,
        species_lat: speciesLat,
        rarity_level: rarity,
        rows: [],
        representative: row,
        observer_set: new Set<string>(),
        first_date: row.observed_at,
        last_date: row.observed_at,
      };
      bySpecies.set(row.species_name, agg);
    }
    agg.rows.push(row);
    if (row.observer && row.observer.trim()) {
      // Split comma-separated observer strings as well.
      for (const obs of row.observer.split(",").map((s) => s.trim()).filter(Boolean)) {
        agg.observer_set.add(obs);
      }
    }
    if (row.observed_at < agg.first_date) {
      agg.first_date = row.observed_at;
      agg.representative = row;
    }
    if (row.observed_at > agg.last_date) {
      agg.last_date = row.observed_at;
    }
  }

  // Build entries.
  const entries = Array.from(bySpecies.values()).map((agg) => {
    const rep = agg.representative;
    return {
      species_et: agg.species_name,
      species_lat: agg.species_lat,
      date: rep.observed_at,
      location: rep.locality ?? "",
      sub_region: rep.county,
      country_code: "EE",
      lat: rep.lat,
      lng: rep.lon,
      count: rep.individual_count ?? 1,
      observer: rep.observer ?? "",
      rarity_level: agg.rarity_level,
      observers: Array.from(agg.observer_set),
      source: "elurikkus" as const,
      sights_stats: {
        total_obs: agg.rows.length,
        observer_count: agg.observer_set.size,
        first_date: agg.first_date,
        last_date: agg.last_date,
      },
    };
  });

  // Sort: rarity tier desc, then total_obs desc, then first_date asc.
  entries.sort((a, b) => {
    const tierDiff = TIER_RANK[b.rarity_level] - TIER_RANK[a.rarity_level];
    if (tierDiff !== 0) return tierDiff;
    const obsDiff = b.sights_stats.total_obs - a.sights_stats.total_obs;
    if (obsDiff !== 0) return obsDiff;
    return a.sights_stats.first_date.localeCompare(b.sights_stats.first_date);
  });

  // Cap: keep ALL rarities first, then fill with non-rare up to TOTAL_CAP.
  const rarities = entries.filter((e) => e.rarity_level !== "none");
  const commons = entries.filter((e) => e.rarity_level === "none");
  const capped = rarities.concat(commons).slice(0, TOTAL_CAP);
  const rareKept = rarities.length;
  const noneKept = capped.length - rareKept;

  return json({
    entries: capped,
    stats: {
      raw_in_period: rawCount,
      after_dedup: dedupedRows.length,
      species_count: bySpecies.size,
      rare_kept: rareKept,
      none_kept: noneKept,
      total_returned: capped.length,
      dict_coverage: dictCoverage,
      period_start: periodStart,
      period_end: periodEnd,
    },
  });
});
