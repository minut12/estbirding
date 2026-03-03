const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Cache-Control": "no-store",
};

type OccItem = {
  observedAt: string | null;
  lat: number | null;
  lon: number | null;
  coordsStatus: "public" | "restricted_or_missing";
  municipality: string | null;
};

function parseObservedAt(value: unknown): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const isoLike = raw.includes("T") ? raw : raw.replace(" ", "T");
  const t = Date.parse(isoLike);
  if (Number.isFinite(t)) return t;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const fallback = Date.parse(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return Number.isFinite(fallback) ? fallback : 0;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = String(obj?.[key] || "").trim();
    if (value) return value;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, stage: "request", message: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const reqUrl = new URL(req.url);
    const species = String(reqUrl.searchParams.get("text") || "").trim();
    const days = Math.max(1, Number(reqUrl.searchParams.get("days") || 7) || 7);
    const limit = Math.max(1, Math.min(500, Number(reqUrl.searchParams.get("limit") || 200) || 200));
    if (!species) {
      return new Response(JSON.stringify({ ok: false, stage: "request", message: "Missing text query parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstreamUrl = `https://elurikkus.ee/app/occurrences/search?text=${encodeURIComponent(species)}&_ts=${Date.now()}`;
    const startedAt = Date.now();
    let upstreamRes: Response;
    let upstreamText = "";
    let durationMs = 0;
    let upstreamBytes = 0;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "User-Agent": "EstBirding/1.0",
        },
      });
      upstreamText = await upstreamRes.text();
      durationMs = Date.now() - startedAt;
      upstreamBytes = new TextEncoder().encode(upstreamText).length;
    } catch (e) {
      durationMs = Date.now() - startedAt;
      return new Response(JSON.stringify({
        ok: false,
        stage: "upstream",
        status: 0,
        message: String((e as Error)?.message || e),
        sourceUrl: upstreamUrl,
        upstreamStatus: 0,
        upstreamBytes: 0,
        durationMs,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!upstreamRes.ok) {
      return new Response(JSON.stringify({
        ok: false,
        stage: "upstream",
        status: upstreamRes.status,
        message: `Upstream HTTP ${upstreamRes.status}`,
        species,
        fetchedAt: new Date().toISOString(),
        sourceUrl: upstreamUrl,
        upstreamStatus: upstreamRes.status,
        upstreamBytes,
        durationMs,
        trace: {
          upstreamStatus: upstreamRes.status,
          upstreamBytes,
          upstreamDurationMs: durationMs,
          upstreamCacheBusterUsed: true,
        },
      }), {
        status: upstreamRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = upstreamText ? JSON.parse(upstreamText) : {};
    } catch {
      parsed = {};
    }

    const candidates = (parsed?.occurrences || parsed?.results || parsed?.items || []) as unknown[];
    const cutoffTs = Date.now() - (days * 24 * 60 * 60 * 1000);
    const normalized: { item: OccItem; ts: number }[] = [];
    for (const raw of candidates) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const ts = parseObservedAt(
        obj.eventDate || obj.observedAt || obj.observed_at || obj.datetime || obj.occurrenceDate || obj.date,
      );
      const lat = Number.parseFloat(String(obj.decimalLatitude ?? obj.lat ?? ""));
      const lon = Number.parseFloat(String(obj.decimalLongitude ?? obj.lon ?? ""));
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
      const observedAt = ts > 0 ? new Date(ts).toISOString() : null;
      if (ts > 0 && ts < cutoffTs) continue;
      normalized.push({
        ts,
        item: {
          observedAt,
          lat: hasCoords ? lat : null,
          lon: hasCoords ? lon : null,
          coordsStatus: hasCoords ? "public" : "restricted_or_missing",
          municipality: firstString(obj, ["municipality", "county", "stateProvince"]),
        },
      });
      if (normalized.length >= limit) break;
    }
    normalized.sort((a, b) => b.ts - a.ts);
    const latestTs = normalized.length ? normalized[0].ts : 0;

    return new Response(JSON.stringify({
      ok: true,
      species,
      fetchedAt: new Date().toISOString(),
      sourceUrl: upstreamUrl,
      latestOccurrenceAt: latestTs > 0 ? new Date(latestTs).toISOString() : null,
      upstreamStatus: upstreamRes.status,
      upstreamBytes,
      durationMs,
      items: normalized.slice(0, limit).map((x) => x.item),
      trace: {
        upstreamStatus: upstreamRes.status,
        upstreamBytes,
        upstreamDurationMs: durationMs,
        upstreamCacheBusterUsed: true,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      stage: "parse",
      message: String((error as Error)?.message || error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
