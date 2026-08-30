// ufo-refresh
// M7.2: port of the n8n "UFO Sightings CO+PA+I70 - UFOStalker to Supabase"
// workflow. pg_cron -> pg_net -> public.m7_call_ef('ufo-refresh', '{}') -> here.
//
//   3 x GET ufostalker by-lat-lng-bounds (CO, PA, I-70 corridor)
//   -> concat (the n8n Merge node)
//   -> Filter + normalize (bbox keep + dedupe by id)
//   -> POST insert-ufo-sightings { sightings }
//
// insert-ufo-sightings caps a call at MAX_PER_CALL = 500 and silently counts the
// overflow as `skipped`, so the payload is chunked at 500 here. The freshness
// column on ufo_sightings is `updated_at`, stamped by insert-ufo-sightings.
//
// Auth on this function: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET,
// which is also the secret forwarded to insert-ufo-sightings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const UFOSTALKER =
  "https://ufostalker.com/api/ufostalker/v1/sightings/by-lat-lng-bounds";
const FETCH_TIMEOUT_MS = 30_000; // n8n node timeout
const UPSERT_TIMEOUT_MS = 30_000;
const CHUNK_SIZE = 500; // insert-ufo-sightings MAX_PER_CALL

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// The three bboxes the n8n HTTP nodes queried, verbatim.
const FETCH_BOXES = [
  { name: "CO", swLng: -109.06, swLat: 36.99, neLng: -102.04, neLat: 41.01 },
  { name: "PA", swLng: -80.52, swLat: 39.71, neLng: -74.68, neLat: 42.27 },
  { name: "I70", swLng: -109.06, swLat: 37.00, neLng: -74.68, neLat: 42.30 },
] as const;
const PAGE_SIZE = 75; // the `size` query param on all three nodes

// The filter boxes from the n8n Code node (note: CORRIDOR is a superset of both
// state boxes, so `keep` is effectively "inside the corridor" -- kept verbatim
// so the port stays line-for-line comparable with the original).
interface Box {
  swLat: number;
  neLat: number;
  swLng: number;
  neLng: number;
}
const BOXES: Record<"Colorado" | "Pennsylvania", Box> = {
  Colorado: { swLat: 36.99, neLat: 41.01, swLng: -109.06, neLng: -102.04 },
  Pennsylvania: { swLat: 39.71, neLat: 42.27, swLng: -80.52, neLng: -74.68 },
};
const CORRIDOR: Box = {
  swLat: 37.00,
  neLat: 42.30,
  swLng: -109.06,
  neLng: -74.68,
};

function inBox(b: Box, lat: number, lon: number): boolean {
  return lat >= b.swLat && lat <= b.neLat && lon >= b.swLng && lon <= b.neLng;
}

interface Sighting {
  case_id: string;
  occurred: string | null;
  submitted: string | null;
  lat: number;
  lon: number;
  city: string | null;
  region: string | null;
  shape: string | null;
  summary: string | null;
  source: string | null;
  tags: unknown[];
  url: string;
}

// ---------------------------------------------------------------------------

async function fetchBox(
  box: typeof FETCH_BOXES[number],
): Promise<Record<string, unknown>[]> {
  const url = new URL(UFOSTALKER);
  url.searchParams.set("swLng", String(box.swLng));
  url.searchParams.set("swLat", String(box.swLat));
  url.searchParams.set("neLng", String(box.neLng));
  url.searchParams.set("neLat", String(box.neLat));
  url.searchParams.set("size", String(PAGE_SIZE));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(
        "ufostalker " + box.name + " HTTP " + res.status,
      );
    }
    const j = await res.json();
    return extractRaw(j);
  } finally {
    clearTimeout(timer);
  }
}

// Shape sniffing, straight from the n8n Code node: the endpoint has returned a
// bare array, a {content:[...]} page and a {sightings:[...]} envelope.
function extractRaw(j: unknown): Record<string, unknown>[] {
  if (Array.isArray(j)) return j as Record<string, unknown>[];
  if (j && typeof j === "object") {
    const o = j as Record<string, unknown>;
    if (Array.isArray(o.content)) return o.content as Record<string, unknown>[];
    if (Array.isArray(o.sightings)) {
      return o.sightings as Record<string, unknown>[];
    }
    if (o.id !== undefined && o.latitude !== undefined) return [o];
  }
  return [];
}

function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v as string | number);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function normalize(raw: Record<string, unknown>[]): Sighting[] {
  const out: Sighting[] = [];
  const seen = new Set<string>();

  for (const s of raw) {
    if (!s || s.id === undefined || s.id === null || s.id === "") continue;
    const point = s.point && typeof s.point === "object"
      ? s.point as Record<string, unknown>
      : null;
    const lat = Number(s.latitude ?? point?.y);
    const lon = Number(s.longitude ?? point?.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const keep = inBox(CORRIDOR, lat, lon) ||
      inBox(BOXES.Colorado, lat, lon) ||
      inBox(BOXES.Pennsylvania, lat, lon);
    if (!keep) continue;

    const id = String(s.id);
    if (seen.has(id)) continue;
    seen.add(id);

    // region: trust UFOStalker; fall back to bbox inference for CO/PA so their
    // map filters stay reliable.
    let region = str(s.region);
    if (!region) {
      if (inBox(BOXES.Colorado, lat, lon)) region = "Colorado";
      else if (inBox(BOXES.Pennsylvania, lat, lon)) region = "Pennsylvania";
    }

    out.push({
      case_id: id,
      occurred: isoOrNull(s.occurred),
      submitted: isoOrNull(s.submitted),
      lat,
      lon,
      city: str(s.city),
      region,
      shape: str(s.shape),
      summary: str(s.summary),
      source: str(s.source),
      tags: Array.isArray(s.tags) ? s.tags : [],
      url: "https://ufostalker.com/sighting/" + encodeURIComponent(id),
    });
  }

  return out;
}

async function upsertChunk(
  secret: string,
  sightings: Sighting[],
): Promise<{ upserted: number; skipped: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSERT_TIMEOUT_MS);
  try {
    const res = await fetch(
      SUPABASE_URL + "/functions/v1/insert-ufo-sightings",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-secret": secret,
        },
        body: JSON.stringify({ sightings }),
        signal: ctrl.signal,
      },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        "insert-ufo-sightings HTTP " + res.status + ": " + text.slice(0, 300),
      );
    }
    const j = JSON.parse(text) as Record<string, unknown>;
    return {
      upserted: Number(j.upserted ?? 0),
      skipped: Number(j.skipped ?? 0),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json(500, {
      error: "server_misconfigured",
      detail: "VAATLUSTE_WEBHOOK_SECRET not set",
    });
  }
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json(401, { error: "unauthorized" });
  }

  const started = Date.now();
  const runId = crypto.randomUUID();
  const sb = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let rowId: number | null = null;
  {
    const { data, error } = await sb
      .from("cron_runs")
      .insert({ job: "ufo", run_id: runId, hop: 0, state: {} })
      .select("id")
      .single();
    if (error) console.error("[cron_runs open]", error.message);
    else rowId = (data as { id: number }).id;
  }

  let fetched = 0;
  let kept = 0;
  let upserted = 0;
  let skipped = 0;
  let calls = 0;
  let errorMsg: string | null = null;

  try {
    const raw: Record<string, unknown>[] = [];
    for (const box of FETCH_BOXES) {
      const rows = await fetchBox(box);
      raw.push(...rows);
    }
    fetched = raw.length;

    const sightings = normalize(raw);
    kept = sightings.length;

    // At most 3 x 75 = 225 rows, so a single chunk in practice. Chunking is
    // defensive: over 500 insert-ufo-sightings drops the tail into `skipped`.
    const chunks: Sighting[][] = [];
    for (let i = 0; i < sightings.length; i += CHUNK_SIZE) {
      chunks.push(sightings.slice(i, i + CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push([]); // mirror n8n: always post once

    for (const chunk of chunks) {
      const r = await upsertChunk(expectedSecret, chunk);
      calls++;
      upserted += r.upserted;
      skipped += r.skipped;
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const ok = errorMsg === null;
  const state = { fetched, kept, upserted, skipped };
  const tookMs = Date.now() - started;

  if (rowId !== null) {
    const { error } = await sb
      .from("cron_runs")
      .update({
        finished_at: new Date().toISOString(),
        calls,
        ok,
        state,
        error: errorMsg,
      })
      .eq("id", rowId);
    if (error) console.error("[cron_runs close]", error.message);
  }

  return json(ok ? 200 : 500, {
    ok,
    job: "ufo",
    run_id: runId,
    calls,
    ...state,
    took_ms: tookMs,
    error: errorMsg,
  });
});
