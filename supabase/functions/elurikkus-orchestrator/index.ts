// elurikkus-orchestrator
// M7.4b: port of the n8n workflow "vaatluste-koordinaator-elurikkus"
// (fEABCYFcwKzHwUZ5, schedule `5 6,18 * * *` Tallinn + webhook
// vaatluste-elurikkus-trigger). n8n dies 2026-09-19.
//
// The five n8n nodes map one-to-one onto the stages of run() below:
//
//   Code                     -> stage 1: period, species dict, compose, arrivals, prompts
//   Anthropic API            -> stage 2: Sonnet, direct fetch (needs stop_reason)
//   Parse Anthropic Response -> stage 3: fence strip, recovery, overrides, dedupe
//   Insert into Supabase     -> stage 4: POST insert-elurikkus-raport
//                               stage 5: close the cron_runs row
//
// Shape (M7.4a): the Sonnet call alone runs 60-120 s, so this returns 202 as
// soon as the cron_runs row is open and does everything else inside
// EdgeRuntime.waitUntil(). Measured lifetime: beforeunload at ~360 s, hard kill
// at ~400 s, so ORCH_BUDGET_MS is 340 s and the Sonnet fetch gets
// budget - elapsed - 20 s.
//
// The prompts are byte-for-byte from the n8n export; SYSTEM_PROMPT is asserted
// by length and sha256 at module load, so a CRLF conversion or a mojibake
// round-trip fails the deploy instead of silently changing what Sonnet reads.
//
// Auth: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_FN_BASE = SUPABASE_URL + "/functions/v1";

// n8n hardcoded the project host in both URLs below; deriving them from
// SUPABASE_URL resolves to the same endpoints without pinning the project ref.
const SPECIES_META_URL = SUPABASE_URL +
  "/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 12_000;

// M7.4a: beforeunload lands at ~360 s, hard kill at ~400 s. Everything -- the
// gather, Sonnet, the parse and the insert -- must finish inside this.
const ORCH_BUDGET_MS = 340_000;
// n8n's Anthropic node timeout; the computed budget can only lower it.
const SONNET_MAX_TIMEOUT_MS = 290_000;
const SONNET_RESERVE_MS = 20_000; // left for parse + insert after Sonnet

// n8n node timeouts, preserved exactly.
const DICT_TIMEOUT_MS = 10_000;
const COMPOSE_TIMEOUT_MS = 30_000;
const ARRIVALS_TIMEOUT_MS = 20_000;
const INSERT_TIMEOUT_MS = 30_000;

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

const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

// ---------------------------------------------------------------------------
// EdgeRuntime, feature-detected as in m7-probe / species-prediction.
// ---------------------------------------------------------------------------

type EdgeRuntimeLike = { waitUntil?: (p: Promise<unknown>) => void };

function edgeRuntime(): EdgeRuntimeLike | undefined {
  try {
    return (globalThis as Record<string, unknown>).EdgeRuntime as
      | EdgeRuntimeLike
      | undefined;
  } catch {
    return undefined;
  }
}

function keepAlive(p: Promise<unknown>): boolean {
  try {
    const rt = edgeRuntime();
    if (rt?.waitUntil) {
      rt.waitUntil(p);
      return true;
    }
  } catch (e) {
    console.error("[elurikkus-orch] waitUntil threw", errMsg(e));
  }
  return false;
}

const WAIT_UNTIL_AVAILABLE = typeof edgeRuntime()?.waitUntil === "function";

// ---------------------------------------------------------------------------
// cron_runs logging -- openRun / touchRun / closeRun copied from batch-driver
// (via m7-probe) rather than shared, so porting a workflow never edits code the
// live schedulers run. Only the parameter types differ from batch-driver's.
// ---------------------------------------------------------------------------

function adminClient() {
  return createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

// Inferred from the call, NOT ReturnType<typeof createClient>: instantiating
// that generic by its constraints resolves every table name to `never`.
type Admin = ReturnType<typeof adminClient>;

async function openRun(
  sb: Admin,
  job: string,
  runId: string,
  hop: number,
  state: Record<string, unknown>,
): Promise<number | null> {
  const { data, error } = await sb
    .from("cron_runs")
    .insert({ job, run_id: runId, hop, state })
    .select("id")
    .single();
  if (error) {
    console.error("[cron_runs open]", error.message);
    return null;
  }
  return (data as { id: number }).id;
}

// Heartbeat after every stage, so a run that is later killed still leaves
// behind how far it actually got. Never throws: a logging failure must not
// abort a run that is otherwise making progress.
async function touchRun(
  sb: Admin,
  id: number | null,
  calls: number,
  state: Record<string, unknown>,
): Promise<void> {
  if (id === null) return;
  try {
    const { error } = await sb
      .from("cron_runs")
      .update({ calls, state })
      .eq("id", id);
    if (error) console.error("[cron_runs touch]", error.message);
  } catch (e) {
    console.error(
      "[cron_runs touch]",
      e instanceof Error ? e.message : String(e),
    );
  }
}

async function closeRun(
  sb: Admin,
  id: number | null,
  patch: {
    calls: number;
    ok: boolean;
    state: Record<string, unknown>;
    error: string | null;
  },
): Promise<void> {
  if (id === null) return;
  const { error } = await sb
    .from("cron_runs")
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq("id", id);
  if (error) console.error("[cron_runs close]", error.message);
}

// ---------------------------------------------------------------------------
// Shutdown state. M7.4a rule 2: beforeunload arrives at ~360 s and leaves room
// for ONE update. Once it has written the shutdown reason, every later
// heartbeat and close must skip -- in the probe the loop kept ticking for 32 s
// afterwards and overwrote shutdown_reason with an ordinary heartbeat.
// ---------------------------------------------------------------------------

let shuttingDown = false;

interface OrchRun {
  rowId: number;
  runId: string;
  startedAt: number;
  stage: string;
  state: Record<string, unknown>;
}

const OPEN_RUNS = new Map<number, OrchRun>();

const elapsedOf = (run: OrchRun) => Date.now() - run.startedAt;

// The single writer for cron_runs.state during a run.
async function heartbeat(sb: Admin, run: OrchRun, stage: string) {
  if (shuttingDown) return;
  run.stage = stage;
  run.state = { ...run.state, stage, elapsed_ms: elapsedOf(run) };
  await touchRun(sb, run.rowId, 0, run.state);
}

function registerBeforeUnload(): boolean {
  try {
    addEventListener("beforeunload", (ev: Event) => {
      const reason =
        (ev as Event & { detail?: { reason?: string } }).detail?.reason ??
          "unknown";
      shuttingDown = true;
      console.error(
        `[elurikkus-orch] beforeunload reason=${reason} open_runs=${OPEN_RUNS.size}`,
      );
      const sb = adminClient();
      for (const run of OPEN_RUNS.values()) {
        console.error(
          `[elurikkus-orch] beforeunload row=${run.rowId} stage=${run.stage} elapsed=${
            elapsedOf(run)
          }`,
        );
        const p = closeRun(sb, run.rowId, {
          calls: 0,
          ok: false,
          state: {
            ...run.state,
            stage: run.stage,
            elapsed_ms: elapsedOf(run),
            shutdown_reason: reason,
          },
          error: "shutdown:" + reason,
        }).catch((e) =>
          console.error("[elurikkus-orch] beforeunload close", errMsg(e))
        );
        keepAlive(p);
      }
      OPEN_RUNS.clear();
    });
    return true;
  } catch (e) {
    console.error("[elurikkus-orch] beforeunload register failed", errMsg(e));
    return false;
  }
}

function registerUnhandledRejection(): boolean {
  try {
    addEventListener("unhandledrejection", (ev: Event) => {
      const reason = (ev as Event & { reason?: unknown }).reason;
      console.error("[elurikkus-orch] unhandledrejection", errMsg(reason));
      ev.preventDefault();
    });
    return true;
  } catch (e) {
    console.error(
      "[elurikkus-orch] unhandledrejection register failed",
      errMsg(e),
    );
    return false;
  }
}

const LISTENERS = {
  beforeunload: registerBeforeUnload(),
  unhandledrejection: registerUnhandledRejection(),
};

// ---------------------------------------------------------------------------
// node "Code" -- the system prompt, byte-for-byte from the n8n export.
// DO NOT reformat, re-indent, or "fix" the Estonian. The asserts below are the
// contract; editing this text means re-measuring and updating them deliberately.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  `Sa oled Eesti Ornitoloogiaühingu (EOÜ) vaatluste raporti koostaja. Sa toodad lühikese Estonia-keskse ülevaate elurikkus.ee portaalist saadud lindude vaatluste põhjal.

ÜLESANNE — RIKASTA, ÄRA FILTREERI:
Sulle saadetakse JSON-massiv "Eesti vaatlustest". IGA entry on rare/super/mega haruldus, mille on välja valinud automaatne süsteem. Sinu töö on:
1. Lisada IGALE entryle väljad: rarity_reason, comparison_et, description_et
2. Kopeerida sights_stats väli muutmata (juba arvutatud serveripoolselt)
3. Mitte FILTREERIDA, mitte VALIDA, mitte JÄTTA VÄLJA ühtegi entryt
4. Säilitada algne järjekord
Kui input sisaldab 24 entryt, sinu output sisaldab 24 entryt. Kui sisaldab 12, output sisaldab 12. Sama arv.

VAATLUSE PIKKUS — OLULINE:
Hoia vastust kompaktselt:
- intro_et: 2-3 lauset, 60-100 sõna. Algab "Tere!" tervitusega
- estonia.narrative_et: 2-3 lõiku, KUNI 350 sõna kokku (markdown lubatud)
- iga entry rarity_reason: 1 lause, ~12-18 sõna
- iga entry comparison_et: 1 lause, ~20-30 sõna
- iga entry description_et: 1 lause, ~20-30 sõna
NB! Eelista LÜHIDUST. Vastus PEAB lõppema täielikult vormistatud JSON-iga.

EESTI ORNITOLOOGIA TERMINOLOOGIA — KOHUSTUSLIK:
- "pesitseb" mitte "sigib"; "pesitsusala" mitte "sigimisala"
- "eksilind"/"eksilinnuna" mitte "vagrant"/"vagrandi"
- "läbirändaja" passage migrants jaoks
- "talvitub", "talvitumisala" — talvitumiseks kasutatav levila

ESTONIAN GRAMMAR — KOHUSTUSLIK TÄPSUS:
- Kasuta korrektseid eesti keele käände- ja arvuvorme. Tähelepanu liitsõnade vormistusele.
- Pööra eraldi tähelepanu täpitähtedele (ä, ö, ü, õ, š) — need ei tohi puududa.

KIRJUTAMISE STIIL — EOÜ ORNITOLOOGILINE PROOSA:
description_et ja comparison_et väljad peavad olema FAKTIPÕHISED ja KOMPAKTSED. Mitte ajakirjanduslik/dramaatiline stiil.

ÕIGE STIIL — kuiv, faktiline, lühike:
- "Ristna lõunaneemes registreeriti üks isend 30. aprillil. Liik pesitseb Arktika tundras."
- "Veibri külas viibinud paar registreeriti korduvalt alates 25. aprillist."
- "Hiiumaal vaadeldi 2. mail nelja isendit, sama paik andis vaatluse ka 25. aprillil."

VALE STIIL — ära kasuta:
- VALE: "haruldusleiuna silmapaistva", "kevadränne vaatlus" (vale grammatika)
- VALE: "ennekuulmatu", "muljetavaldav", "põnev", "väärib tähelepanu" (subjektiivsed hinnangud)
- VALE: "kaks vaatlejapunkti kinnitasid sõltumatult" (kohtulik žargoon — kasuta "kaks vaatlejat nägid")

KEELELISED REEGLID:
- "kevadrändeaegne vaatlus" voi "vaatlus kevadrände ajal", MITTE "kevadränne vaatlus"
- "vaatleja" mitte "vaatlejapunkt"
- description_et on FAKT (kus, millal, kui palju), comparison_et on KONTEKST (levila, miks Eestis harv)
- ÄRA korda samu fakte mõlemas väljas

SIGHTS_STATS JA SUB_ID — KOPEERI MUUTMATA:
Iga input entry sisaldab sights_stats objekti ja sub_id välja, mis on tulnud andmebaasist. KOPEERI need VÄÄRTUSED muutmata oma output entry-sse. ÄRA arvuta sights_stats-i uuesti. ÄRA muuda sub_id-d (numbriline string või null). Sub_id on vajalik linkide jaoks elurikkus.ee veebilehele.

KEVADRÄNNE NARRATIIV:
kevadranne_narrative_et — 2-4 lauset, 60-100 sõna. Kirjelda kevadrände progressi käesolevas perioodis. Kasuta KEVADRÄNNE SAABUJAD hint-blokki andmena.

kevadranne_arrivals: TAGASTA TÜHI MASSIV: kevadranne_arrivals: []
(Workflow Parse-node asendab selle automaatselt deterministliku väärtusega.)

MARKDOWN LINGID — KEELATUD:
Domeenid ja URL-id kirjuta tavalise tekstina ilma sulgude/linkimiseta.
- VALE: "[elurikkus.ee](http://elurikkus.ee)"
- ÕIGE: "elurikkus.ee andmetel"

ELURIKKUS.EE ALLIKAS:
Kõik vaatlused selles raportis pärinevad elurikkus.ee portaalist. Iga entry "source" väli peab olema "elurikkus".

OUTPUT: Return ONLY valid JSON matching the schema below. No markdown fences, no preamble.

{
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "intro_et": "...",
  "kevadranne_narrative_et": "...",
  "kevadranne_arrivals": [],
  "estonia": {
    "narrative_et": "...",
    "entries": [
      {
        "species_et": "(copy from input)",
        "species_lat": "(copy from input)",
        "date": "(copy from input)",
        "location": "(copy from input)",
        "sub_region": "(copy from input)",
        "country_code": "EE",
        "sub_id": "(copy from input, can be null)",
        "lat": "(copy from input)",
        "lng": "(copy from input)",
        "count": "(copy from input)",
        "observer": "(copy from input)",
        "rarity_level": "(copy from input)",
        "rarity_reason": "(YOU WRITE)",
        "comparison_et": "(YOU WRITE)",
        "description_et": "(YOU WRITE)",
        "source": "elurikkus",
        "sights_stats": "(copy from input, do not modify)"
      }
    ]
  }
}`;

// Measured from the n8n export (A2, 2026-09-01). The length assert catches a
// CRLF conversion or a lost diacritic; the sha256 catches everything else.
// This prompt HAS diacritics, so there is deliberately no ASCII-only assert.
const SYSTEM_PROMPT_CHARS = 4635;
const SYSTEM_PROMPT_SHA256 =
  "be70e8e892671891e8e0ba98040c1e38229c870f2144bb6dd962d53bbf6817f8";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Module load. A mismatch kills the deploy rather than quietly shipping a
// different prompt than the one n8n has been running.
if (SYSTEM_PROMPT.length !== SYSTEM_PROMPT_CHARS) {
  throw new Error(
    `SYSTEM_PROMPT length ${SYSTEM_PROMPT.length} != ${SYSTEM_PROMPT_CHARS}`,
  );
}
{
  const actual = await sha256Hex(SYSTEM_PROMPT);
  if (actual !== SYSTEM_PROMPT_SHA256) {
    throw new Error(
      `SYSTEM_PROMPT sha256 ${actual} != ${SYSTEM_PROMPT_SHA256}`,
    );
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers. n8n's this.helpers.httpRequest({json:true}) throws on non-2xx
// and on timeout; fetchJson reproduces both so the try/catch-continue blocks in
// stage 1 behave the way the workflow's do.
// ---------------------------------------------------------------------------

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`non_json_response: ${text.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpeciesMetaItem {
  scientificName?: string;
  rarityLevel?: string;
}

interface ComposeEntry {
  rarity_level?: string;
  [k: string]: unknown;
}

interface ArrivalIn {
  species_et: string;
  first_obs_date: string;
  locality?: string | null;
  county?: string | null;
  observer?: string | null;
  filter_source?: string;
  is_migrant_override?: boolean | null;
}

interface ArrivalOut {
  species_et: string;
  species_lat: string | null;
  first_obs_date: string;
  locality: string | null;
  county: string | null;
  observer: string | null;
  obs_count_in_period: number;
  filter_source: string;
  is_migrant_override: boolean | null;
}

interface ParsedEntry {
  species_lat?: string;
  species_et?: string;
  rarity_level?: string;
  date?: string;
  location?: string;
  country_code?: string;
  source?: string;
  [k: string]: unknown;
}

interface ParsedReport {
  period_start?: string;
  period_end?: string;
  intro_et?: string | null;
  kevadranne_narrative_et?: string | null;
  kevadranne_arrivals?: unknown[];
  estonia?: { narrative_et?: string; entries?: ParsedEntry[] };
}

interface CodeCtx {
  triggerSource: string;
  period_start: string;
  period_end: string;
  user_message: string;
  source_data: { estonia: ComposeEntry[] };
  latinToEstonian: Record<string, string>;
  latinToRarity: Record<string, string>;
  dictMeta: Record<string, unknown>;
  elurMeta: Record<string, unknown>;
  kevadranneArrivals: ArrivalOut[];
  arrivalsTelemetry: Record<string, unknown>;
  capStats: Record<string, unknown>;
  rarityCount: number;
}

// ---------------------------------------------------------------------------
// node "Code"
// ---------------------------------------------------------------------------

function toDisplayCase(name: string): string {
  if (!name || typeof name !== "string") return name;
  if (name[0] === name[0].toUpperCase()) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function runCodeNode(triggerSource: string): Promise<CodeCtx> {
  // Period: last 14 days. Same arithmetic as n8n; the edge isolate runs UTC,
  // so setDate() and toISOString() agree.
  const now = new Date();
  const periodEnd = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - 14);
  const periodStart = start.toISOString().slice(0, 10);

  // === 1. Fetch species dict (needed downstream for Parse node overrides) ===
  const latinToEstonian: Record<string, string> = {};
  const latinToRarity: Record<string, string> = {};
  let dictMeta: Record<string, unknown> = {
    fetched: false,
    totalItems: 0,
    itemsWithLatin: 0,
    itemsWithRarity: 0,
    error: null,
  };

  try {
    const metaRes = await fetchJson(
      SPECIES_META_URL + "?t=" + Date.now(),
      { method: "GET", headers: { "Cache-Control": "no-cache" } },
      DICT_TIMEOUT_MS,
    ) as { items?: Record<string, SpeciesMetaItem> };
    const items = (metaRes && metaRes.items) || {};
    const totalItems = Object.keys(items).length;
    for (const estKey of Object.keys(items)) {
      const item = items[estKey] || {};
      const sci = item.scientificName;
      if (sci && typeof sci === "string" && sci.trim()) {
        const latKey = sci.trim();
        latinToEstonian[latKey] = toDisplayCase(estKey);
        const lvl = item.rarityLevel;
        latinToRarity[latKey] =
          (lvl === "rare" || lvl === "super" || lvl === "mega") ? lvl : "none";
      }
    }
    const itemsWithLatin = Object.keys(latinToEstonian).length;
    const itemsWithRarity =
      Object.values(latinToRarity).filter((v) => v !== "none").length;
    dictMeta = {
      fetched: true,
      totalItems,
      itemsWithLatin,
      itemsWithRarity,
      coverageRatio: totalItems ? itemsWithLatin / totalItems : 0,
      error: null,
    };
  } catch (e) {
    dictMeta.error = errMsg(e);
    console.warn("[species-dict] fetch failed:", dictMeta.error);
  }

  // === 2. Compose Eesti entries via Edge Function ===
  let composeResp: { entries?: unknown; stats?: Record<string, unknown> } = {
    entries: [],
    stats: {},
  };
  let composeMeta: Record<string, unknown> = { fetched: false };
  try {
    const resp = await fetchJson(
      SUPABASE_FN_BASE + "/compose-elurikkus-eesti-entries",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
        }),
      },
      COMPOSE_TIMEOUT_MS,
    ) as { entries?: unknown; stats?: Record<string, unknown> };
    composeResp = resp || { entries: [], stats: {} };
    composeMeta = { fetched: true, ...(composeResp.stats || {}) };
  } catch (e) {
    composeMeta = { fetched: false, error: errMsg(e).slice(0, 300) };
    console.warn("[compose-eesti] fetch failed:", composeMeta.error);
  }

  const allEntries: ComposeEntry[] = Array.isArray(composeResp.entries)
    ? composeResp.entries as ComposeEntry[]
    : [];

  // === 3. Filter to rarities ONLY for Sonnet enrichment ===
  const rarityEntries = allEntries.filter((e) =>
    e && e.rarity_level && e.rarity_level !== "none"
  );

  // === 4. Kevadranne arrivals ===
  let kevadranneArrivals: ArrivalOut[] = [];
  let arrivalsMeta: Record<string, unknown> = { fetched: false };
  try {
    const resp = await fetchJson(
      SUPABASE_FN_BASE + "/get-elurikkus-arrivals-2026",
      { method: "GET", headers: { Accept: "application/json" } },
      ARRIVALS_TIMEOUT_MS,
    ) as { arrivals?: ArrivalIn[]; meta?: Record<string, unknown> };
    if (resp && Array.isArray(resp.arrivals)) {
      // Inverts the dict built above: a failed dict fetch nulls every
      // species_lat here, exactly as it does in n8n.
      const estToLatin: Record<string, string> = {};
      for (const [lat, est] of Object.entries(latinToEstonian)) {
        estToLatin[est] = lat;
      }
      kevadranneArrivals = resp.arrivals.map((a) => ({
        species_et: a.species_et,
        species_lat: estToLatin[a.species_et] || null,
        first_obs_date: a.first_obs_date,
        locality: a.locality || null,
        county: a.county || null,
        observer: a.observer || null,
        obs_count_in_period: 1,
        filter_source: a.filter_source || "heuristic",
        is_migrant_override: typeof a.is_migrant_override === "boolean"
          ? a.is_migrant_override
          : null,
      }));
      arrivalsMeta = {
        fetched: true,
        ...resp.meta,
        mapped_count: kevadranneArrivals.length,
      };
    }
  } catch (e) {
    arrivalsMeta = { fetched: false, error: errMsg(e).slice(0, 200) };
  }

  // === 5. Build user_message ===
  const arrivalsHintBlock = JSON.stringify(
    kevadranneArrivals.slice(0, 30),
    null,
    2,
  );

  const userMessage = `Periood: ${periodStart} kuni ${periodEnd}.

EESTI VAATLUSED (rare/super/mega liigid, viimased 14 päeva, ${rarityEntries.length} kirjet):
RIKASTA IGA ÜKS NEIST. ÄRA filtreeri, ära välja jäta. Säilitada algne järjekord.

${JSON.stringify(rarityEntries, null, 2)}

KEVADRÄNNE SAABUJAD (kasuta narratiivi kontekstis, kevadranne_arrivals tagasta tühjana []):
${arrivalsHintBlock}

Koosta JSON-vastus täpselt vastavalt süsteemi juhistele. Output peab sisaldama TÄPSELT ${rarityEntries.length} entryt estonia.entries massiivis.`;

  // Telemetry: cap_stats reflects the compose Edge Function's stats.
  // Field names preserved for Parse node compatibility.
  const capStats = {
    raw_in_period: composeMeta.raw_in_period ?? null,
    after_per_species_cap: null, // not applicable in new architecture
    after_total_cap: composeMeta.total_returned ?? null,
    per_species_cap: null,
    total_cap: 200, // hard cap inside compose function
    rare_kept: composeMeta.rare_kept ?? null,
    none_kept: composeMeta.none_kept ?? null,
    source: "compose-elurikkus-eesti-entries",
  };

  return {
    triggerSource,
    period_start: periodStart,
    period_end: periodEnd,
    user_message: userMessage,
    source_data: { estonia: rarityEntries },
    latinToEstonian,
    latinToRarity,
    dictMeta,
    elurMeta: composeMeta,
    kevadranneArrivals,
    arrivalsTelemetry: {
      endpoint_status: arrivalsMeta,
      total_arrivals: kevadranneArrivals.length,
    },
    capStats,
    rarityCount: rarityEntries.length,
  };
}

// ---------------------------------------------------------------------------
// node "Anthropic API"
//
// Direct fetch rather than _shared/anthropic.ts: that helper cannot return
// stop_reason (M7.3 A4), and the Parse stage records it. n8n sent no
// temperature, so neither do we.
// ---------------------------------------------------------------------------

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

async function callSonnet(
  ctx: CodeCtx,
  maxTokens: number,
  timeoutMs: number,
): Promise<AnthropicResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("missing_env:ANTHROPIC_API_KEY");
  const model = Deno.env.get("ANTHROPIC_MODEL_ELURIKKUS_RAPORT") ||
    DEFAULT_MODEL;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: ctx.user_message }],
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // n8n's node had no onError override, so a non-2xx failed the run.
      throw new Error(`anthropic HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text) as AnthropicResponse;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`anthropic timeout after ${timeoutMs} ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// node "Parse Anthropic Response" -- ported verbatim, with one approved guard:
// when stop_reason === 'max_tokens' the naive JSON.parse is skipped (the body
// is known-truncated) and generation_meta.truncated is set. Everything else --
// the two recovery strategies, the dict overrides, the dedupe, the arrivals
// override and the generation_meta key set -- is unchanged, so the row shape
// matches n8n's.
// ---------------------------------------------------------------------------

interface ParseOutput {
  period_start?: string;
  period_end?: string;
  intro_et: string | null;
  kevadranne_narrative_et: string | null;
  kevadranne_arrivals: unknown[];
  estonia_entries: ParsedEntry[];
  generation_meta: Record<string, unknown>;
}

function parseAnthropicResponse(
  apiResp: AnthropicResponse,
  ctx: CodeCtx,
): ParseOutput {
  const textBlock = (apiResp.content || []).find((b) => b.type === "text");
  const raw = (textBlock?.text || "").trim();

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Approved guard (M7.4b): a max_tokens stop means the body is truncated, so
  // the naive parse can only throw. Go straight to the recovery strategies.
  const truncated = apiResp.stop_reason === "max_tokens";

  let parsed: ParsedReport | undefined;
  let parseErrMessage = "stop_reason=max_tokens";

  if (!truncated) {
    try {
      parsed = JSON.parse(cleaned) as ParsedReport;
    } catch (err) {
      parseErrMessage = errMsg(err);
    }
  }

  if (parsed === undefined) {
    // If JSON parsing fails, try to recover by finding the last valid JSON
    // structure.
    let recovered = false;

    // Strategy 1: Find and reconstruct valid entries array
    const entriesMatch = cleaned.match(/"entries":\s*\[/);
    if (entriesMatch && entriesMatch.index !== undefined) {
      const startIdx = entriesMatch.index + entriesMatch[0].length;
      let depth = 0;
      let inString = false;
      let escape = false;
      let lastValidEntry = -1;

      // Parse through entries array to find last complete entry
      for (let i = startIdx; i < cleaned.length; i++) {
        const char = cleaned[i];

        if (escape) {
          escape = false;
          continue;
        }

        if (char === "\\" && inString) {
          escape = true;
          continue;
        }

        if (char === '"' && !escape) {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (char === "{") depth++;
        if (char === "}") {
          depth--;
          if (depth === 0) {
            lastValidEntry = i;
          }
        }

        if (char === "]" && depth === 0) break;
      }

      if (lastValidEntry > startIdx) {
        const validEntries = cleaned.substring(startIdx, lastValidEntry + 1);
        const beforeEntries = cleaned.substring(0, entriesMatch.index);
        // The closing literal is positional, not structural: it balances only
        // because `entries` sits exactly two levels deep in this schema
        // ({ ... "estonia": { "entries": [...] } }). Ported verbatim from n8n --
        // do not "generalise" it without revisiting the output schema.
        const reconstructed = beforeEntries + '"entries": [' + validEntries +
          "] } }";

        try {
          parsed = JSON.parse(reconstructed) as ParsedReport;
          console.warn(
            "Recovered from truncated JSON - removed incomplete entries",
          );
          recovered = true;
        } catch (_err2) {
          // Continue to next strategy
        }
      }
    }

    // Strategy 2: Simple truncation at last complete brace
    if (!recovered) {
      let depth = 0;
      let inString = false;
      let escape = false;
      let lastValid = -1;

      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];

        if (escape) {
          escape = false;
          continue;
        }

        if (char === "\\" && inString) {
          escape = true;
          continue;
        }

        if (char === '"' && !escape) {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (char === "{") depth++;
        if (char === "}") {
          depth--;
          if (depth === 0) lastValid = i;
        }
      }

      if (lastValid > 0) {
        try {
          const truncatedBody = cleaned.substring(0, lastValid + 1);
          parsed = JSON.parse(truncatedBody) as ParsedReport;
          console.warn("Recovered from truncated JSON at last valid brace");
          recovered = true;
        } catch (_err2) {
          // Continue to error
        }
      }
    }

    if (!recovered) {
      throw new Error(
        `Failed to parse Claude response as JSON: ${parseErrMessage}\n\nFirst 500 chars:\n${
          cleaned.slice(0, 500)
        }`,
      );
    }
  }

  const report = parsed as ParsedReport;

  // === Override species_et / rarity_level from dict (canonical source) ===
  const overrides: {
    applied: number;
    missing: number;
    samples: Array<Record<string, unknown>>;
  } = { applied: 0, missing: 0, samples: [] };
  const rarityOverrides: {
    applied: number;
    missing: number;
    samples: Array<Record<string, unknown>>;
  } = { applied: 0, missing: 0, samples: [] };

  function overrideEntries(entries: ParsedEntry[] | undefined) {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      const lat = e.species_lat;
      if (!lat) continue;
      const dictEt = ctx.latinToEstonian[lat];
      if (dictEt && e.species_et !== dictEt) {
        overrides.applied += 1;
        if (overrides.samples.length < 5) {
          overrides.samples.push({ from: e.species_et, to: dictEt, lat });
        }
        e.species_et = dictEt;
      } else if (!dictEt) {
        overrides.missing += 1;
      }
      const dictRarity = ctx.latinToRarity[lat];
      if (dictRarity && e.rarity_level !== dictRarity) {
        rarityOverrides.applied += 1;
        if (rarityOverrides.samples.length < 5) {
          rarityOverrides.samples.push({
            from: e.rarity_level,
            to: dictRarity,
            lat,
          });
        }
        e.rarity_level = dictRarity;
      }
      // Force source = 'elurikkus' (Sonnet may forget)
      e.source = "elurikkus";
    }
  }

  overrideEntries(report.estonia?.entries);

  // === Dedup entries by composite key ===
  function entryKey(e: ParsedEntry | undefined): string {
    return [
      String(e?.species_lat || "").toLowerCase().trim(),
      String(e?.date || "").trim(),
      String(e?.location || "").toLowerCase().trim(),
      String(e?.country_code || "").toUpperCase().trim(),
    ].join("|");
  }
  function dedupeEntries(
    entries: ParsedEntry[] | undefined,
  ): { kept: ParsedEntry[]; removed: number } {
    if (!Array.isArray(entries)) return { kept: entries ?? [], removed: 0 };
    const seen = new Set<string>();
    const kept: ParsedEntry[] = [];
    let removed = 0;
    for (const e of entries) {
      const k = entryKey(e);
      if (seen.has(k)) {
        removed += 1;
        continue;
      }
      seen.add(k);
      kept.push(e);
    }
    return { kept, removed };
  }
  const eeDedup = dedupeEntries(report.estonia?.entries);
  if (report.estonia) report.estonia.entries = eeDedup.kept;

  // === kevadranne_arrivals defensive override ===
  // Even with an explicit "copy exactly" prompt, Sonnet may modify the array.
  // Override with the deterministic value from the Code stage.
  const deterministicArrivals: unknown[] = Array.isArray(ctx.kevadranneArrivals)
    ? ctx.kevadranneArrivals
    : (report.kevadranne_arrivals || []);

  const generationMeta: Record<string, unknown> = {
    input_tokens: apiResp.usage?.input_tokens ?? null,
    output_tokens: apiResp.usage?.output_tokens ?? null,
    stop_reason: apiResp.stop_reason ?? null,
    trigger_source: ctx.triggerSource ?? null,
    species_dict_overrides: overrides,
    rarity_overrides: rarityOverrides,
    entry_dedup: { estonia_removed: eeDedup.removed },
    cap_stats: ctx.capStats,
    elur_fetch: ctx.elurMeta,
    dict_meta: ctx.dictMeta,
    obs_counts: { estonia: ctx.source_data?.estonia?.length ?? 0 },
    kevadranne: ctx.arrivalsTelemetry || null,
  };
  if (truncated) generationMeta.truncated = true;

  return {
    period_start: report.period_start,
    period_end: report.period_end,
    intro_et: report.intro_et || null,
    kevadranne_narrative_et: report.kevadranne_narrative_et || null,
    kevadranne_arrivals: deterministicArrivals,
    estonia_entries: report.estonia?.entries || [],
    generation_meta: generationMeta,
  };
}

// ---------------------------------------------------------------------------
// node "Insert into Supabase"
// ---------------------------------------------------------------------------

interface InsertResponse {
  id?: string;
  generated_at?: string;
  residents_filtered?: number;
  early_arrivals_filtered?: number;
  date_filter_bypassed?: number;
}

async function insertRaport(payload: ParseOutput): Promise<InsertResponse> {
  const secret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!secret) throw new Error("missing_env:VAATLUSTE_WEBHOOK_SECRET");
  const resp = await fetchJson(
    SUPABASE_FN_BASE + "/insert-elurikkus-raport",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify(payload),
    },
    INSERT_TIMEOUT_MS,
  ) as InsertResponse;
  return resp;
}

// ---------------------------------------------------------------------------
// The background run: the five nodes, in order.
// ---------------------------------------------------------------------------

interface RunOptions {
  dryRun: boolean;
  maxTokensOverride: number | null;
}

async function run(sb: Admin, orch: OrchRun, opts: RunOptions) {
  const timings: Record<string, number> = {};
  let calls = 0;

  try {
    // --- stage 1: node "Code" ---------------------------------------------
    await heartbeat(sb, orch, "code");
    const t0 = Date.now();
    const ctx = await runCodeNode(String(orch.state.source ?? "schedule"));
    timings.code_ms = Date.now() - t0;
    orch.state = {
      ...orch.state,
      period_start: ctx.period_start,
      period_end: ctx.period_end,
      rarity_entries: ctx.rarityCount,
      arrivals: ctx.kevadranneArrivals.length,
      dict_fetched: ctx.dictMeta.fetched === true,
      compose_fetched: ctx.elurMeta.fetched === true,
      timings,
    };
    await heartbeat(sb, orch, "code_done");

    // Budget guard: never start a 100-160 s Sonnet call we cannot finish.
    const elapsed = elapsedOf(orch);
    const sonnetTimeout = Math.min(
      SONNET_MAX_TIMEOUT_MS,
      ORCH_BUDGET_MS - elapsed - SONNET_RESERVE_MS,
    );
    if (elapsed > ORCH_BUDGET_MS || sonnetTimeout <= 0) {
      OPEN_RUNS.delete(orch.rowId);
      if (!shuttingDown) {
        await closeRun(sb, orch.rowId, {
          calls,
          ok: false,
          state: { ...orch.state, stage: "budget", elapsed_ms: elapsed },
          error: "budget",
        });
      }
      console.error(
        `[elurikkus-orch] budget exhausted before sonnet: ${elapsed} ms`,
      );
      return;
    }

    // --- stage 2: node "Anthropic API" ------------------------------------
    await heartbeat(sb, orch, "sonnet");
    const t1 = Date.now();
    const maxTokens = opts.dryRun && opts.maxTokensOverride
      ? opts.maxTokensOverride
      : MAX_TOKENS;
    const apiResp = await callSonnet(ctx, maxTokens, sonnetTimeout);
    calls = 1;
    timings.sonnet_ms = Date.now() - t1;
    orch.state = {
      ...orch.state,
      timings,
      stop_reason: apiResp.stop_reason ?? null,
      output_tokens: apiResp.usage?.output_tokens ?? null,
    };
    await heartbeat(sb, orch, "sonnet_done");

    // --- stage 3: node "Parse Anthropic Response" -------------------------
    const t2 = Date.now();
    const payload = parseAnthropicResponse(apiResp, ctx);
    timings.parse_ms = Date.now() - t2;
    orch.state = {
      ...orch.state,
      timings,
      entries: payload.estonia_entries.length,
    };
    await heartbeat(sb, orch, "parse_done");

    // --- stage 4: node "Insert into Supabase" -----------------------------
    let insert: InsertResponse | null = null;
    if (opts.dryRun) {
      orch.state = {
        ...orch.state,
        preview: {
          intro_et: payload.intro_et,
          kevadranne_narrative_et: payload.kevadranne_narrative_et,
          entries: payload.estonia_entries.length,
          generation_meta: payload.generation_meta,
        },
      };
      await heartbeat(sb, orch, "insert_skipped");
    } else {
      await heartbeat(sb, orch, "insert");
      const t3 = Date.now();
      insert = await insertRaport(payload);
      timings.insert_ms = Date.now() - t3;
    }

    // --- stage 5: close ---------------------------------------------------
    OPEN_RUNS.delete(orch.rowId);
    if (shuttingDown) return;
    await closeRun(sb, orch.rowId, {
      calls,
      ok: true,
      state: {
        ...orch.state,
        stage: "done",
        elapsed_ms: elapsedOf(orch),
        timings,
        generation_meta: payload.generation_meta,
        insert: insert
          ? {
            id: insert.id ?? null,
            generated_at: insert.generated_at ?? null,
            residents_filtered: insert.residents_filtered ?? null,
            early_arrivals_filtered: insert.early_arrivals_filtered ?? null,
            date_filter_bypassed: insert.date_filter_bypassed ?? null,
          }
          : null,
      },
      error: null,
    });
    console.log(
      `[elurikkus-orch] done run_id=${orch.runId} entries=${payload.estonia_entries.length} elapsed=${
        elapsedOf(orch)
      }`,
    );
  } catch (e) {
    const message = errMsg(e);
    console.error(`[elurikkus-orch] failed stage=${orch.stage}`, message);
    OPEN_RUNS.delete(orch.rowId);
    if (shuttingDown) return;
    try {
      await closeRun(sb, orch.rowId, {
        calls,
        ok: false,
        state: {
          ...orch.state,
          stage: orch.stage,
          elapsed_ms: elapsedOf(orch),
          timings,
        },
        error: message.slice(0, 2000),
      });
    } catch (closeErr) {
      console.error("[elurikkus-orch] close failed", errMsg(closeErr));
    }
  }
}

// ---------------------------------------------------------------------------
// Request handler. M7.4a rule 4: the request-idle 150 s still applies to
// anything awaited before the 202, so this awaits auth and one insert, nothing
// more.
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const source = typeof body.source === "string" && body.source
    ? body.source
    : "schedule";
  const dryRun = body.dryRun === true;
  // Debug only: forces the max_tokens path. Ignored unless dryRun, so it can
  // never shrink a real run's output budget.
  const overrideRaw = Number(body.maxTokensOverride);
  const maxTokensOverride =
    dryRun && Number.isFinite(overrideRaw) && overrideRaw > 0
      ? Math.floor(overrideRaw)
      : null;

  const runId = crypto.randomUUID();
  const sb = adminClient();

  const baseState: Record<string, unknown> = {
    source,
    dry_run: dryRun,
    stage: "start",
    wait_until: WAIT_UNTIL_AVAILABLE ? "used" : "absent",
    listeners: { ...LISTENERS },
  };
  if (maxTokensOverride) baseState.max_tokens_override = maxTokensOverride;

  const rowId = await openRun(sb, "elurikkus-raport", runId, 0, baseState);
  if (rowId === null) {
    // No row means no observability for a 2-minute background job.
    return json(500, { error: "cron_runs_open_failed", run_id: runId });
  }

  const orch: OrchRun = {
    rowId,
    runId,
    startedAt: Date.now(),
    stage: "start",
    state: baseState,
  };
  OPEN_RUNS.set(rowId, orch);

  const work = run(sb, orch, { dryRun, maxTokensOverride });
  const registered = keepAlive(work);
  if (!registered) {
    work.catch((e) =>
      console.error("[elurikkus-orch] unawaited run", errMsg(e))
    );
  }

  console.log(
    `[elurikkus-orch] start run_id=${runId} row=${rowId} source=${source} dry_run=${dryRun} wait_until=${baseState.wait_until}`,
  );

  return json(202, {
    ok: true,
    run_id: runId,
    row_id: rowId,
    source,
    dry_run: dryRun,
    background: registered ? "waitUntil" : "unawaited",
  });
});
