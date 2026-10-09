// redeploy-marker: P105c 2026-10-09
// movebank-refresh (P105c)
// pg_cron -> pg_net -> public.m7_call_ef('movebank-refresh', '{"mode":...}') -> here.
//
// Modes:
//   discover  202 + background: list Movebank studies we can read, keep recent
//             GPS studies in the Europe box, upsert movebank_studies.
//   refresh   202 + background: per study, find recent bird individuals, resolve
//             taxa, read the newest fix via the ANONYMOUS public/json endpoint and
//             upsert gps_tracked_birds. Sensitive taxa are rounded to 0.1 deg.
//   probe     synchronous dry run for one studyId, NO DB access at all.
//
// Movebank etiquette: one request at a time, 400 ms between calls, one retry
// after 5 s on HTTP 429 / "concurrent". Basic auth is sent ONLY on direct-read;
// public/json is always anonymous so only public data can reach the map.
//
// Auth on this function: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import EOU_NAMES from "../_shared/eoy-bird-names.json" with { type: "json" };
import {
  binomial,
  chunk,
  csvToObjects,
  extractNewestFixes,
  inEuropeStudyBox,
  isSensitive,
  parseMovebankTime,
  roundTo01,
} from "./lib.ts";

declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined;

type Mode = "discover" | "refresh" | "probe";
type StudyStatus =
  | "candidate"
  | "public"
  | "empty"
  | "not_birds"
  | "licence_required"
  | "no_access"
  | "error";

interface Creds {
  user: string;
  pass: string;
}

interface TaxonInfo {
  taxon_latin: string; // binomial, PK of movebank_taxa
  is_bird: boolean;
  name_et: string | null;
  sensitive: boolean;
}

interface BirdRow {
  study_id: number;
  individual_local_identifier: string;
  taxon_latin: string;
  lat: number;
  lon: number;
  coords_rounded: boolean;
  fix_at: string;
  fetched_at: string;
}

interface StudyResult {
  status: StudyStatus;
  lastError: string | null;
  individuals: Array<{ local_identifier: string; taxon_canonical_name: string; timestamp_end: string }>;
  taxa: TaxonInfo[];
  newTaxa: TaxonInfo[]; // resolved now, not yet in movebank_taxa (unique by taxon_latin)
  rows: BirdRow[];
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const MB = "https://www.movebank.org/movebank/service";
const GBIF_MATCH = "https://api.gbif.org/v1/species/match?name=";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_MS = 7 * DAY_MS;
const RETENTION_MS = 30 * DAY_MS;
const CALL_TIMEOUT_MS = 45_000;
const PAUSE_MS = 400;
const RETRY_WAIT_MS = 5_000;
const LOOP_BUDGET_MS = 300_000;
const DEFAULT_MAX_STUDIES = 25;
const PUBLIC_CHUNK = 20;
const DB_CHUNK = 200;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// Movebank HTTP: strictly sequential, paced, single retry.

let lastMovebankCallEnd = 0;

interface MbResponse {
  status: number;
  text: string;
  acceptLicense: boolean;
}

async function mbOnce(url: string, creds: Creds | null): Promise<MbResponse> {
  const wait = lastMovebankCallEnd + PAUSE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  const headers: Record<string, string> = {};
  if (creds) headers["Authorization"] = "Basic " + btoa(creds.user + ":" + creds.pass);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    return {
      status: res.status,
      text,
      acceptLicense: res.headers.get("accept-license") !== null,
    };
  } finally {
    clearTimeout(timer);
    lastMovebankCallEnd = Date.now();
  }
}

async function mbFetch(url: string, creds: Creds | null): Promise<MbResponse> {
  const first = await mbOnce(url, creds);
  if (first.status === 429 || /concurrent/i.test(first.text)) {
    await sleep(RETRY_WAIT_MS);
    return await mbOnce(url, creds);
  }
  return first;
}

// direct-read (authenticated, CSV)
function directReadUrl(params: Record<string, string>): string {
  return MB + "/direct-read?" + new URLSearchParams(params).toString();
}

// Classifies a body that is not the expected payload.
function classifyBadBody(r: MbResponse): { status: StudyStatus; lastError: string } {
  if (r.acceptLicense || r.text.includes("License Terms")) {
    return { status: "licence_required", lastError: "licence terms required" };
  }
  if (r.text.includes("No data available")) {
    return { status: "no_access", lastError: "No data available" };
  }
  return { status: "error", lastError: r.text.slice(0, 200) };
}

// ---------------------------------------------------------------------------
// Taxa

const EOU_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const entry of EOU_NAMES as Array<{ et?: string; latin?: string[] }>) {
    if (!entry.et || !Array.isArray(entry.latin)) continue;
    for (const l of entry.latin) {
      const key = binomial(l).toLowerCase();
      if (key !== "" && !m.has(key)) m.set(key, entry.et);
    }
  }
  return m;
})();

async function resolveTaxon(bin: string): Promise<TaxonInfo> {
  const sensitive = isSensitive(bin);
  const et = EOU_INDEX.get(bin.toLowerCase());
  if (et !== undefined) {
    return { taxon_latin: bin, is_bird: true, name_et: et, sensitive };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(GBIF_MATCH + encodeURIComponent(bin), { signal: ctrl.signal });
    if (!res.ok) throw new Error("GBIF match HTTP " + res.status);
    const j = (await res.json()) as Record<string, unknown>;
    return {
      taxon_latin: bin,
      is_bird: j["class"] === "Aves",
      name_et: null,
      sensitive,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// One study, no DB I/O of its own. `loadKnown` returns taxa already stored
// (refresh reads movebank_taxa; probe passes a loader that returns nothing).
// Loader input and returned map are keyed by binomial (taxon_latin).

type KnownTaxaLoader = (binomials: string[]) => Promise<Map<string, TaxonInfo>>;

async function collectStudy(
  studyId: number,
  creds: Creds,
  loadKnown: KnownTaxaLoader,
): Promise<StudyResult> {
  const now = Date.now();
  const result: StudyResult = {
    status: "public",
    lastError: null,
    individuals: [],
    taxa: [],
    newTaxa: [],
    rows: [],
  };

  // 1. individuals (authenticated CSV)
  const indRes = await mbFetch(
    directReadUrl({
      entity_type: "individual",
      study_id: String(studyId),
      attributes: "local_identifier,taxon_canonical_name,timestamp_end",
    }),
    creds,
  );
  const firstLine = indRes.text.split(/\r?\n/, 1)[0] ?? "";
  if (indRes.status !== 200 || !firstLine.includes("local_identifier")) {
    const bad = classifyBadBody(indRes);
    return { ...result, status: bad.status, lastError: "individuals HTTP " + indRes.status + ": " + bad.lastError };
  }
  const individuals = csvToObjects(indRes.text)
    .map((o) => ({
      local_identifier: o.local_identifier ?? "",
      taxon_canonical_name: o.taxon_canonical_name ?? "",
      timestamp_end: o.timestamp_end ?? "",
    }))
    .filter((o) => {
      const t = parseMovebankTime(o.timestamp_end);
      return o.local_identifier !== "" && t !== null && t >= now - RECENT_MS;
    });
  result.individuals = individuals;
  if (individuals.length === 0) return { ...result, status: "empty" };

  // 2. taxa, keyed by binomial (several Movebank names can share one binomial)
  const binomials = [...new Set(individuals.map((i) => binomial(i.taxon_canonical_name)))]
    .filter((b) => b !== "");
  const knownTaxa = await loadKnown(binomials);
  const taxa = new Map<string, TaxonInfo>();
  for (const bin of binomials) {
    const known = knownTaxa.get(bin);
    if (known) {
      taxa.set(bin, known);
    } else {
      const info = await resolveTaxon(bin);
      taxa.set(bin, info);
      result.newTaxa.push(info);
    }
  }
  result.taxa = [...taxa.values()];
  const birds = individuals.filter((i) => taxa.get(binomial(i.taxon_canonical_name))?.is_bird === true);
  if (birds.length === 0) return { ...result, status: "not_birds" };

  // 3. public/json (ANONYMOUS)
  const taxonById = new Map(birds.map((b) => [b.local_identifier, binomial(b.taxon_canonical_name)]));
  const fetchedAt = new Date().toISOString();
  for (const group of chunk(birds.map((b) => b.local_identifier), PUBLIC_CHUNK)) {
    const qs = new URLSearchParams({
      study_id: String(studyId),
      sensor_type: "gps",
      max_events_per_individual: "1",
      timestamp_start: String(now - RECENT_MS),
    });
    for (const id of group) qs.append("individual_local_identifiers", id);
    const pub = await mbFetch(MB + "/public/json?" + qs.toString(), null);
    let payload: unknown;
    try {
      payload = JSON.parse(pub.text);
    } catch {
      const bad = classifyBadBody(pub);
      return { ...result, status: bad.status, lastError: bad.lastError, rows: [] };
    }

    // 4. newest fix per individual -> row
    for (const fix of extractNewestFixes(payload)) {
      const bin = taxonById.get(fix.individualLocalIdentifier);
      if (bin === undefined) continue;
      const info = taxa.get(bin);
      const sensitive = info?.sensitive === true;
      result.rows.push({
        study_id: studyId,
        individual_local_identifier: fix.individualLocalIdentifier,
        taxon_latin: bin,
        lat: sensitive ? roundTo01(fix.lat) : fix.lat,
        lon: sensitive ? roundTo01(fix.lon) : fix.lon,
        coords_rounded: sensitive,
        fix_at: new Date(fix.timestamp).toISOString(),
        fetched_at: fetchedAt,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// DB helpers

function serviceClient() {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}

type Sb = ReturnType<typeof serviceClient>;

// ---------------------------------------------------------------------------
// discover

async function runDiscover(creds: Creds): Promise<void> {
  const started = Date.now();
  const summary = { seen: 0, kept: 0, inserted: 0, error: null as string | null };
  try {
    const sb = serviceClient();
    const r = await mbFetch(
      directReadUrl({
        entity_type: "study",
        i_have_download_access: "true",
        attributes:
          "id,name,license_type,citation,principal_investigator_name,main_location_lat,main_location_long,timestamp_last_deployed_location,sensor_type_ids",
      }),
      creds,
    );
    if (r.status !== 200) throw new Error("studies HTTP " + r.status + ": " + r.text.slice(0, 200));
    const studies = csvToObjects(r.text);
    summary.seen = studies.length;

    const since = Date.now() - RECENT_MS;
    const nowIso = new Date().toISOString();
    const kept = studies.flatMap((s) => {
      const id = Number(s.id);
      const last = parseMovebankTime(s.timestamp_last_deployed_location);
      const lat = s.main_location_lat === "" ? NaN : Number(s.main_location_lat);
      const lon = s.main_location_long === "" ? NaN : Number(s.main_location_long);
      if (!Number.isFinite(id) || !(s.sensor_type_ids ?? "").includes("GPS")) return [];
      if (last === null || last < since || !inEuropeStudyBox(lat, lon)) return [];
      return [{
        study_id: id,
        name: s.name ?? null,
        license_type: s.license_type || null,
        citation: s.citation || null,
        pi_name: s.principal_investigator_name || null,
        last_fix_at: new Date(last).toISOString(),
        updated_at: nowIso,
      }];
    });
    summary.kept = kept.length;

    const existing = new Set<number>();
    for (const ids of chunk(kept.map((k) => k.study_id), DB_CHUNK)) {
      const { data, error } = await sb.from("movebank_studies").select("study_id").in("study_id", ids);
      if (error) throw new Error("select movebank_studies: " + error.message);
      for (const row of (data ?? []) as Array<{ study_id: number }>) existing.add(Number(row.study_id));
    }

    const fresh = kept.filter((k) => !existing.has(k.study_id)).map((k) => ({ ...k, status: "candidate" }));
    const old = kept.filter((k) => existing.has(k.study_id)); // status deliberately absent
    for (const rows of chunk(fresh, DB_CHUNK)) {
      const { error } = await sb.from("movebank_studies").insert(rows);
      if (error) throw new Error("insert movebank_studies: " + error.message);
      summary.inserted += rows.length;
    }
    for (const rows of chunk(old, DB_CHUNK)) {
      const { error } = await sb.from("movebank_studies").upsert(rows, { onConflict: "study_id" });
      if (error) throw new Error("update movebank_studies: " + error.message);
    }
  } catch (e) {
    summary.error = errMsg(e);
  }
  console.log(JSON.stringify({ fn: "movebank-refresh", mode: "discover", ...summary, took_ms: Date.now() - started }));
}

// ---------------------------------------------------------------------------
// refresh

async function loadKnownTaxa(sb: Sb, binomials: string[]): Promise<Map<string, TaxonInfo>> {
  const m = new Map<string, TaxonInfo>();
  for (const group of chunk(binomials, DB_CHUNK)) {
    const { data, error } = await sb
      .from("movebank_taxa")
      .select("taxon_latin,is_bird,name_et,sensitive")
      .in("taxon_latin", group);
    if (error) throw new Error("select movebank_taxa: " + error.message);
    for (const row of (data ?? []) as TaxonInfo[]) m.set(row.taxon_latin, row);
  }
  return m;
}

// Postgres rejects an upsert batch that hits the same key twice: keep one per key.
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const m = new Map<string, T>();
  for (const it of items) m.set(key(it), it);
  return [...m.values()];
}

async function refreshOneStudy(
  sb: Sb,
  studyId: number,
  creds: Creds,
): Promise<{ status: StudyStatus | null; rows: number; error: string | null }> {
  const nowIso = () => new Date().toISOString();
  try {
    const res = await collectStudy(studyId, creds, (names) => loadKnownTaxa(sb, names));

    if (res.newTaxa.length > 0) {
      const checkedAt = nowIso();
      const taxaRows = dedupeBy(res.newTaxa, (t) => t.taxon_latin).map((t) => ({
        taxon_latin: t.taxon_latin,
        is_bird: t.is_bird,
        name_et: t.name_et,
        sensitive: t.sensitive,
        checked_at: checkedAt,
      }));
      const { error } = await sb
        .from("movebank_taxa")
        .upsert(taxaRows, { onConflict: "taxon_latin" });
      if (error) throw new Error("upsert movebank_taxa: " + error.message);
    }
    const birdRows = dedupeBy(res.rows, (r) => r.individual_local_identifier).map((r) => ({
      study_id: r.study_id,
      individual_local_identifier: r.individual_local_identifier,
      taxon_latin: r.taxon_latin,
      lat: r.lat,
      lon: r.lon,
      coords_rounded: r.coords_rounded,
      fix_at: r.fix_at,
      fetched_at: r.fetched_at,
    }));
    for (const rows of chunk(birdRows, DB_CHUNK)) {
      const { error } = await sb
        .from("gps_tracked_birds")
        .upsert(rows, { onConflict: "study_id,individual_local_identifier" });
      if (error) throw new Error("upsert gps_tracked_birds: " + error.message);
    }
    const { error } = await sb
      .from("movebank_studies")
      .update({ status: res.status, last_checked_at: nowIso(), last_error: res.lastError })
      .eq("study_id", studyId);
    if (error) throw new Error("update movebank_studies: " + error.message);
    return { status: res.status, rows: birdRows.length, error: res.lastError };
  } catch (e) {
    // Thrown failure (timeout, network, DB): keep the status so a transient
    // error does not drop the study from the refresh set; record the error.
    const msg = errMsg(e).slice(0, 200);
    const { error } = await sb
      .from("movebank_studies")
      .update({ last_checked_at: nowIso(), last_error: msg })
      .eq("study_id", studyId);
    if (error) console.error("[movebank_studies last_error]", error.message);
    return { status: null, rows: 0, error: msg };
  }
}

async function runRefresh(creds: Creds, maxStudies: number): Promise<void> {
  const started = Date.now();
  const summary = {
    picked: 0,
    processed: 0,
    rows_upserted: 0,
    statuses: {} as Record<string, number>,
    failures: 0,
    stopped_early: false,
    deleted_old: 0,
    error: null as string | null,
  };
  try {
    const sb = serviceClient();
    const { data, error } = await sb
      .from("movebank_studies")
      .select("study_id")
      .in("status", ["candidate", "public"])
      .gte("last_fix_at", new Date(Date.now() - RECENT_MS).toISOString())
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(maxStudies);
    if (error) throw new Error("select movebank_studies: " + error.message);
    const ids = ((data ?? []) as Array<{ study_id: number }>).map((r) => Number(r.study_id));
    summary.picked = ids.length;

    for (const id of ids) {
      if (Date.now() - started > LOOP_BUDGET_MS) {
        summary.stopped_early = true;
        break;
      }
      const r = await refreshOneStudy(sb, id, creds);
      summary.processed++;
      summary.rows_upserted += r.rows;
      const key = r.status ?? "failed";
      summary.statuses[key] = (summary.statuses[key] ?? 0) + 1;
      if (r.status === null) summary.failures++;
    }

    const { error: delErr, count } = await sb
      .from("gps_tracked_birds")
      .delete({ count: "exact" })
      .lt("fix_at", new Date(Date.now() - RETENTION_MS).toISOString());
    if (delErr) throw new Error("delete gps_tracked_birds: " + delErr.message);
    summary.deleted_old = count ?? 0;
  } catch (e) {
    summary.error = errMsg(e);
  }
  console.log(JSON.stringify({ fn: "movebank-refresh", mode: "refresh", ...summary, took_ms: Date.now() - started }));
}

// ---------------------------------------------------------------------------

function readCreds(): Creds | null {
  const user = Deno.env.get("MOVEBANK_USER");
  const pass = Deno.env.get("MOVEBANK_PASS");
  if (!user || !pass) return null;
  return { user, pass };
}

function runInBackground(p: Promise<void>): void {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(p);
  else p.catch((e) => console.error("[movebank-refresh background]", errMsg(e)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json(500, { error: "server_misconfigured", detail: "VAATLUSTE_WEBHOOK_SECRET not set" });
  }
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json(401, { error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json_body" });
  }

  const mode = body.mode;
  if (mode !== "discover" && mode !== "refresh" && mode !== "probe") {
    return json(400, { error: "mode must be discover | refresh | probe" });
  }
  const m: Mode = mode;

  const creds = readCreds();
  if (!creds) return json(500, { error: "MOVEBANK credentials missing" });

  if (m === "discover") {
    runInBackground(runDiscover(creds));
    return json(202, { accepted: true, mode: m });
  }

  if (m === "refresh") {
    const raw = body.maxStudies;
    const maxStudies = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_STUDIES;
    runInBackground(runRefresh(creds, maxStudies));
    return json(202, { accepted: true, mode: m });
  }

  // probe: synchronous, no DB access
  const studyId = body.studyId;
  if (typeof studyId !== "number" || !Number.isInteger(studyId) || studyId <= 0) {
    return json(400, { error: "probe requires a positive integer studyId" });
  }
  const started = Date.now();
  try {
    const res = await collectStudy(studyId, creds, () => Promise.resolve(new Map()));
    return json(200, {
      mode: m,
      study_id: studyId,
      status: res.status,
      last_error: res.lastError,
      individuals: res.individuals,
      taxa: res.taxa,
      rows: res.rows,
      took_ms: Date.now() - started,
    });
  } catch (e) {
    return json(502, { mode: m, study_id: studyId, error: errMsg(e), took_ms: Date.now() - started });
  }
});
