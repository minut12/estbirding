// get-ee-species-presence
// Exposes which species are already in Estonia so the rare-bird arrival
// predictor (Tõenäosus) can avoid predicting "arrival" for species already
// recorded here.
//
// Response shape:
//   {
//     ok: true,
//     window_days: number,
//     generated_at: ISO,
//     exclusion: string[],              // scientific names to exclude
//     ebird_ee_present: string[],       // scientific names recently observed in EE
//     elurikkus_counts: Record<string, number>,  // sci name -> observation count
//     meta: { updatedAt, mapped, unmapped_et_count }
//   }
//
// Option B: ET->Latin mapping is loaded from
// storage://bird-avatars/meta/species_meta_v1.json on each cold start (5 min in-memory cache).
//
// redeploy-marker: 2026-06-09T03:30
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_URL = `${SUPABASE_URL}/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json`;

type MetaItem = { scientificName?: string };
type MetaDoc = { updatedAt?: string; items: Record<string, MetaItem> };

let metaCache: { fetchedAt: number; et2lat: Map<string, string>; updatedAt?: string } | null = null;
const META_TTL_MS = 5 * 60 * 1000;

async function loadMeta(): Promise<{ et2lat: Map<string, string>; updatedAt?: string }> {
  if (metaCache && Date.now() - metaCache.fetchedAt < META_TTL_MS) return metaCache;
  const r = await fetch(META_URL, { headers: { "cache-control": "no-cache" } });
  if (!r.ok) throw new Error(`meta fetch failed: ${r.status}`);
  const doc = (await r.json()) as MetaDoc;
  const et2lat = new Map<string, string>();
  for (const [etName, item] of Object.entries(doc.items ?? {})) {
    const sci = item?.scientificName?.trim();
    if (sci) et2lat.set(etName.trim().toLowerCase(), sci);
  }
  metaCache = { fetchedAt: Date.now(), et2lat, updatedAt: doc.updatedAt };
  return metaCache;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(60, Number(url.searchParams.get("days") ?? "14") || 14));
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
    const sinceDate = sinceIso.slice(0, 10);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { et2lat, updatedAt: metaUpdatedAt } = await loadMeta();

    // 1) vaatluste_raport: scientific names already populated.
    const vaat = await supabase
      .from("vaatluste_raport")
      .select("estonia_entries, generated_at")
      .gte("generated_at", sinceIso)
      .order("generated_at", { ascending: false });
    if (vaat.error) throw vaat.error;

    const vaatSci = new Set<string>();
    for (const row of vaat.data ?? []) {
      const entries = Array.isArray((row as any).estonia_entries) ? (row as any).estonia_entries : [];
      for (const e of entries) {
        const s = (e?.species_lat ?? "").toString().trim();
        if (s) vaatSci.add(s);
      }
    }

    // 2) elurikkus_observations: ET names. Aggregate counts and translate.
    // Page through to bypass 1k default limit.
    const counts = new Map<string, number>();
    const unmappedEt = new Set<string>();
    const PAGE = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("elurikkus_observations")
        .select("species_name")
        .gte("observed_at", sinceDate)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const r of rows) {
        const et = ((r as any).species_name ?? "").toString().trim();
        if (!et) continue;
        const sci = et2lat.get(et.toLowerCase());
        if (!sci) {
          unmappedEt.add(et);
          continue;
        }
        counts.set(sci, (counts.get(sci) ?? 0) + 1);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
      if (from > 200_000) break; // safety
    }

    const elurikkusSci = new Set<string>(counts.keys());
    const present = new Set<string>([...vaatSci, ...elurikkusSci]);

    return jsonResponse({
      ok: true,
      window_days: days,
      generated_at: new Date().toISOString(),
      exclusion: [...present].sort(),
      ebird_ee_present: [...present].sort(),
      elurikkus_counts: Object.fromEntries(
        [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
      meta: {
        updatedAt: metaUpdatedAt ?? null,
        mapped: et2lat.size,
        unmapped_et_count: unmappedEt.size,
      },
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
