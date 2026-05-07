// supabase/functions/get-elurikkus-arrivals-2026/index.ts
//
// Public endpoint returning species that arrived in Estonia in 2026.
// "Arrival" = species with first 2026 observation, excluding year-round residents.
//
// Heuristic for resident filtering:
//   Species with ANY obs in Dec 2025 OR Jan 1-15 2026 = resident, EXCLUDE.
//   Species with NO winter obs AND first 2026 obs after Jan 15 = migrant, INCLUDE.
//
// Manual override (in species_meta_v1.json bird-avatars/meta/):
//   is_migrant: true  → force include even if heuristic says resident
//   is_migrant: false → force exclude even if heuristic says migrant

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const YEAR = 2026;
const YEAR_START = `${YEAR}-01-01`;
const PREV_DEC_START = `${YEAR - 1}-12-01`;
const PREV_DEC_END = `${YEAR - 1}-12-31`;
const EARLY_JAN_END = `${YEAR}-01-15`;

interface ObsRow {
  species_name: string;
  observed_at: string;
  locality: string | null;
  county: string | null;
  observer: string | null;
}

interface SpeciesMetaItem {
  is_migrant?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// RESIDENT_EXCLUSIONS — species that the migrant heuristic misclassifies.
// Treated as `is_migrant: false` unless an explicit per-species override
// in species_meta_v1.json says otherwise (explicit override wins).
//
// Categories:
//   - Year-round residents: present in Estonia all 12 months.
//   - Winter visitors: present Nov–Mar, depart in spring (NOT arrivals).
//
// To override per-species without code change, set is_migrant on the entry
// in storage://bird-avatars/meta/species_meta_v1.json.
// ─────────────────────────────────────────────────────────────────────────
const RESIDENT_EXCLUSIONS: ReadonlySet<string> = new Set([
  // Year-round residents
  "Rabapistrik",          // Falco peregrinus
  "Kassikakk",            // Bubo bubo
  "Kaelus-turteltuvi",    // Streptopelia decaocto
  "Laanerähn",            // Picoides tridactylus
  "Kõrvukräts",           // Asio otus (partial migrant; main pop. resident)
  "Mänsak",               // Nucifraga caryocatactes
  "Pasknäär",             // Garrulus glandarius
  "Habekakk",             // Strix nebulosa
  "Värbkakk",             // Glaucidium passerinum
  "Kodukakk",             // Strix aluco
  "Händkakk",             // Strix uralensis
  "Laanenäär",            // Perisoreus infaustus
  "Musträhn",             // Dryocopus martius

  // Winter visitors (depart, not arrive, in spring)
  "Kirjuhahk",            // Polysticta stelleri
  "Hangelind",            // Plectrophenax nivalis
  "Mägi-kanepilind",      // Linaria flavirostris
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Paginate to bypass Supabase 1000-row default limit.
  const PAGE_SIZE = 1000;
  const rows: ObsRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("elurikkus_observations")
      .select("species_name, observed_at, locality, county, observer")
      .gte("observed_at", PREV_DEC_START)
      .order("observed_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as ObsRow[]));
    if (data.length < PAGE_SIZE) break;
    if (rows.length >= 100000) break; // safety cap
  }

  type SpeciesState = {
    has_winter_obs: boolean;
    first_2026: ObsRow | null;
  };
  const bySpecies = new Map<string, SpeciesState>();

  for (const r of rows) {
    const sp = r.species_name;
    if (!sp) continue;
    const d = String(r.observed_at).slice(0, 10);
    if (!d) continue;

    let s = bySpecies.get(sp);
    if (!s) {
      s = { has_winter_obs: false, first_2026: null };
      bySpecies.set(sp, s);
    }

    if (
      (d >= PREV_DEC_START && d <= PREV_DEC_END) ||
      (d >= YEAR_START && d <= EARLY_JAN_END)
    ) {
      s.has_winter_obs = true;
    }

    if (d >= YEAR_START && !s.first_2026) {
      s.first_2026 = r;
    }
  }

  // Fetch species_meta_v1.json from storage for manual overrides
  let speciesMeta: Record<string, SpeciesMetaItem> = {};
  try {
    const { data: metaFile } = await supabase
      .storage
      .from("bird-avatars")
      .download("meta/species_meta_v1.json");
    if (metaFile) {
      const text = await metaFile.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        // species_meta_v1.json wraps entries under `items`; older format had keys at top level.
        // Defensive: try `items` first, fall back to the parsed object itself.
        speciesMeta = (parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items))
          ? parsed.items
          : parsed;
      }
    }
  } catch (_e) {
    // Storage fetch optional — heuristic alone is fine fallback
  }

  const arrivals: Array<{
    species_et: string;
    first_obs_date: string;
    locality: string | null;
    county: string | null;
    observer: string | null;
    filter_source: "manual" | "heuristic";
    is_migrant_override: boolean | null;
  }> = [];

  for (const [species_et, state] of bySpecies) {
    if (!state.first_2026) continue;

    const meta = speciesMeta[species_et];
    // Explicit species_meta override always wins. If absent, fall back to
    // hardcoded RESIDENT_EXCLUSIONS (treated as is_migrant: false).
    const explicitOverride = meta?.is_migrant;
    const manualOverride: boolean | undefined =
      explicitOverride !== undefined
        ? explicitOverride
        : (RESIDENT_EXCLUSIONS.has(species_et) ? false : undefined);

    let isArrival: boolean;
    if (manualOverride === true) {
      isArrival = true;
    } else if (manualOverride === false) {
      isArrival = false;
    } else {
      isArrival = !state.has_winter_obs;
    }

    if (!isArrival) continue;

    arrivals.push({
      species_et,
      first_obs_date: state.first_2026.observed_at,
      locality: state.first_2026.locality,
      county: state.first_2026.county,
      observer: state.first_2026.observer,
      filter_source: manualOverride !== undefined ? "manual" : "heuristic",
      is_migrant_override: typeof manualOverride === "boolean" ? manualOverride : null,
    });
  }

  arrivals.sort((a, b) =>
    String(a.first_obs_date).localeCompare(String(b.first_obs_date))
  );

  return new Response(
    JSON.stringify({
      arrivals,
      meta: {
        year: YEAR,
        baseline: YEAR_START,
        winter_window: `${PREV_DEC_START} to ${EARLY_JAN_END}`,
        total_obs_scanned: rows.length,
        species_evaluated: bySpecies.size,
        arrivals_returned: arrivals.length,
        manual_overrides_applied: arrivals.filter((a) => a.filter_source === "manual").length,
      },
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
      },
    },
  );
});
