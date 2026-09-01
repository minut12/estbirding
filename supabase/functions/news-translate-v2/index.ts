// news-translate-v2
// M7.3: port of the n8n workflow "estbirding-news-ingest-translate-v13"
// (id 5KvMxoDgMlc2nJcL, daily 08:00 Tallinn). One Edge Function replaces the
// whole node chain; each stage below carries its n8n node name as a comment so
// the diff against the export stays reviewable:
//
//   Schedule (daily 08:00 EET) -> pg_cron  m7-news        (10 5 * * * UTC)
//   Ingest (news-refresh)      -> pg_cron  m7-news-ingest ( 0 5 * * * UTC)
//   Get pending                -> get-news-untranslated-v2 { limit }
//   Build Sonnet request       -> SYSTEM_PROMPT + user message, byte-for-byte
//   Sonnet call                -> api.anthropic.com/v1/messages
//   Parse Sonnet               -> ###TITLE### / ###BODY### split + guards
//   Correct + patch            -> Linnud.txt latin->ET map, CALQUES, de-dup, Cyrillic
//   Write v2                   -> update-news-translation-v2 { id, patch }
//
// Auth on this function: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET.
//
// Wall clock: the edge gateway 504s at 150 s and kills the isolate. Ingest is
// therefore NOT run here by cron -- pg_cron calls news-refresh as its own job
// 10 min earlier, and skipIngest defaults to true. The item loop stops taking
// new work after BUDGET_MS and reports partial + remaining; leftovers are
// picked up by the next tick or a manual run. Measured 2026-09-01: one Sonnet
// call ~15 s, so ~5-6 items per tick against a typical daily pending of 1-3.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// Worst case: the budget check passes at 74.9 s, then one Sonnet call runs the
// full 50 s -> 125 s, plus the write. Under the 150 s gateway cutoff.
const BUDGET_MS = 75_000;
const SONNET_TIMEOUT_MS = 50_000;
// n8n's Ingest node allowed 300 s. Only reachable via {skipIngest:false} on a
// manual run -- under cron this EF never ingests. A slow ingest WILL get the
// isolate killed by the gateway; that is the documented cost of the manual path.
const INGEST_TIMEOUT_MS = 300_000;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const LINNUD_URL =
  "https://rfjhrosxbaihyrnbmmbl.supabase.co/storage/v1/object/public/bird-avatars/meta/Linnud.txt";

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
// n8n node: Build Sonnet request
// ---------------------------------------------------------------------------

// Copied byte-for-byte from the export's `Build Sonnet request` jsCode.
// 2633 chars, sha256 901625ac098740e373f24bb767034a9bc7ecfa35cd3eca91f4f403761781ce73.
// v13 folded every Estonian diacritic on purpose -- do not "fix" the spelling.
const SYSTEM_PROMPT =
  `Tolgid linnuteemalisi uudiseid eesti keelde Eesti linnuhuviliste lugejaskonnale. Kirjuta LOOMULIKKU, SUJUVAT eesti keelt ametlikus, asjalikus ornitoloogilises registris (EOU-stiilis uudistekeel) - mitte sona-sona haaval tolget.

STRUKTUURIREEGLID (rakenda ENNE liiginimede tolkimist):

1) LADINAKEELSED BINOOMID (nt "Vanellus gregarius", "Pelecanus crispus") - sailita TAPSELT nimetavas vormis. Ara kunagi tolgi neid. Ara lisa eesti kaandeloppe (MITTE "Pelecanus crispust", "Vanellus spinosus'e" - need on VALED). Kohtle ladinakeelseid nimesid inertsete markidena. Valjasta PUHTA TEKSTINA - ilma markdown-kaldkirjata (*X* voi _X_), ilma <i>-siltideta. Kui lause vajab liiki muus kaandes, sonasta umber nii, et ladina nimi jaab nimetavasse (nt "lindu (Vanellus spinosus) nahti", mitte "Vanellus spinosust nahti").

1b) IGAL linnuliigi mainimisel lisa ladinakeelne binoom sulgudes vahetult nime jarele (nt piiritaja (Apus apus)), et jarelkorrektor saaks iga nime kontrollida. Kasuta liigi kohta labivalt SAMA eestikeelset nime. KAANA eestikeelset linnunime loomulikult vastavalt lausele (nt hobehauka, hobehaugast, piiritajat) - see ei ole muutumatu mark. AINULT ladina binoom jaab nimetavasse. Korduvad ladina binoomid eemaldab jarelkorrektor automaatselt.

2) ARA KUNAGI KALGI LINNUNIMESID. Eesti linnunimed EI teki lahtekeele nimede tolkimisel ja sageli ei sarnane lahtekeele nimega uldse. Naited valedest kalkidest: "Dalmaatsia pelikan" -> kaharpelikan; "rabakonnakotkas" -> vaike-konnakotkas. Kui liik EI ole sulle kindel, JATA ALLES LADINA NIMI, mitte ara leiuta eesti nime.

3) EESTI LIITNIMED on ebajarjekindlad: osa sidekriipsuga (vaike-konnakotkas, must-toonekurg), osa kokku (stepikiivitaja, kaharpelikan, kalakotkas). Kahtluse korral kasuta ladina nime.

4) KOHANIMED - sailita algne kirjapilt. Ara eestista voorkohanimesid ("Zarszyn" jaab "Zarszyn"). Kasuta eesti vorme vaid tuntud eksonuumidele: Helsinki->Helsingi, Riga->Riia, Warszawa->Varssavi.

5) LAHTEKEELE MORFOLOOGIA: soome tuvedele mitte lasta lekkida ("lintu-"->"lind-/linnu-", "Suomi"->"Soome"); lati loppe mitte kasutada; poola liitsonu mitte kalkida, diakriitikud sailitada.

6) TRUUDUS - tolgi iga lause, ara luhenda ega jata detaile valja. Erand: truudus EI luba leiutada eesti liiginimesid - kui liiki pole, kasuta ladina binoomi.

7) TOON - loomulik eesti linnu-uudiste proosa, olevik, standardsed verbivormid ("nahti", "leiti", "jaadvustati").

VALJUND: vasta TAPSELT jargmises vormis, ilma muu teksti, kommentaaride ega markdownita. Kasuta neid kahte eraldajat tapselt nii nagu naidatud:
###TITLE###
(eestikeelne pealkiri)
###BODY###
(eestikeelne sisu)`;

// Fail at module load rather than ship a silently mangled prompt. The ASCII
// test is the one the port was specified against; the length test additionally
// catches a CRLF checkout (2633 -> 2657), which no ASCII test would notice.
if (/[^\x00-\x7F]/.test(SYSTEM_PROMPT)) {
  throw new Error("SYSTEM_PROMPT contains non-ASCII characters");
}
if (SYSTEM_PROMPT.length !== 2633) {
  throw new Error(
    "SYSTEM_PROMPT length " + SYSTEM_PROMPT.length + " != 2633 (line endings?)",
  );
}

// ---------------------------------------------------------------------------
// n8n node: Correct + patch  (ran as runOnceForAllItems, so the dictionary was
// fetched once per execution -- kept that way here, cached for the invocation)
// ---------------------------------------------------------------------------

// Deterministic bird-name correction (ported from _shared/bird-names-et.ts) + build PATCH.
// Dictionary = Linnud.txt (EOU checklist) hosted in Storage.

function parseLinnud(tsv: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = String(tsv || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(
    Boolean,
  );
  if (lines.length < 2) return map;
  const header = lines[0].split("\t").map(function (c) {
    return c.trim();
  });
  const li = header.indexOf("nimi_lk");
  const ei = header.indexOf("nimi_ek");
  if (li < 0 || ei < 0) return map;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const est = String(cells[ei] || "").replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!est) continue;
    const aliases = String(cells[li] || "").split(",");
    for (let a = 0; a < aliases.length; a++) {
      const key = aliases[a].toLowerCase().replace(/\*/g, "")
        .replace(/[()\[\]]/g, "").replace(/\s+/g, " ").trim();
      if (key && !map[key]) map[key] = est;
    }
  }
  return map;
}

const CALQUES: Array<[RegExp, string]> = [
  [/\bDalmaatsia\s+pelikan(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "käharpelikan$1"],
  [/\bDalmaatia\s+pelikan(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "käharpelikan$1"],
  [/\bSabatiigli\s+kiivitaja(t|le|s|st|ks|ga|na)?\b/gi, "stepikiivitaja$1"],
  [
    /\bkannusvästrik(u|ut|ule|us|ust|uks|uga|una|ud|ute|uid|utes|utega|uteta)?\b/gi,
    "valgekael-kiivitaja$1",
  ],
  [/\btuttvart-koiras(t|tega|le|s|st|ks|ina)?\b/gi, "tutka-isane$1"],
  [/\btuttvart-koirased(?=\b)/gi, "tutka-isased"],
  [/\bkoirased\b/gi, "isased"],
  [/\bkoirastega\b/gi, "isastega"],
  [/\bkoirast\b/gi, "isast"],
  [/\bkoiraste\b/gi, "isaste"],
  [/\btuttvartidel\b/gi, "tutkadel"],
  [/\btuttvartid\b/gi, "tutkad"],
  [/\bvappubukett(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "kevadlille$1"],
  [/\bvappuõis(t|tega|le|s|st|ks|ed)?\b/gi, "kevadlille$1"],
];

function fixCalques(t: string): string {
  if (!t) return t;
  let r = t;
  for (let i = 0; i < CALQUES.length; i++) {
    r = r.replace(CALQUES[i][0], CALQUES[i][1]);
  }
  return r;
}

function sameSpecies(a: string, b: string): boolean {
  a = String(a || "").toLowerCase().trim();
  b = String(b || "").toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i >= 4 && i >= 0.5 * n;
}

function fixBirdNames(text: string, latinToEt: Record<string, string>): string {
  if (!text) return text;
  const normalized = String(text)
    .replace(/\(\s*\*\s*([A-Z][a-z]+\s+[a-z]+)\s*\*\s*\)/g, "($1)")
    .replace(/\(\s*_\s*([A-Z][a-z]+\s+[a-z]+)\s*_\s*\)/g, "($1)")
    .replace(/\(\s*<i>\s*([A-Z][a-z]+\s+[a-z]+)\s*<\/i>\s*\)/gi, "($1)");
  let result = normalized.replace(
    /([\p{L}\-]+(?:\s+[\p{L}\-]+){0,3})\s*\(([A-Z][a-z]+\s+[a-z]+)\)/gu,
    function (m: string, _e: string, latin: string) {
      const c = latinToEt[latin.toLowerCase()];
      if (!c) return m;
      const words = _e.split(/\s+/);
      const name = words[words.length - 1];
      if (sameSpecies(name, c)) return m;
      const pre = words.slice(0, -1).join(" ");
      return (pre ? pre + " " : "") + c + " (" + latin + ")";
    },
  );
  result = result.replace(
    /(?<!\()(?<!\w)\b([A-Z][a-z]+\s+[a-z]+)\b(?!\))/g,
    function (m: string, latin: string) {
      const c = latinToEt[latin.toLowerCase()];
      return c ? (c + " (" + latin + ")") : m;
    },
  );
  const seen: Record<string, boolean> = {};
  result = result.replace(
    /\s*\(([A-Z][a-z]+\s+[a-z]+)\)/g,
    function (m: string, latin: string) {
      const key = latin.toLowerCase();
      if (!latinToEt[key]) return m;
      if (seen[key]) return "";
      seen[key] = true;
      return m;
    },
  );
  return fixCalques(result);
}

const CYR: Record<string, string> = {
  "а": "a",
  "б": "b",
  "в": "v",
  "г": "g",
  "д": "d",
  "е": "e",
  "ё": "jo",
  "ж": "zh",
  "з": "z",
  "и": "i",
  "й": "j",
  "к": "k",
  "л": "l",
  "м": "m",
  "н": "n",
  "о": "o",
  "п": "p",
  "р": "r",
  "с": "s",
  "т": "t",
  "у": "u",
  "ф": "f",
  "х": "h",
  "ц": "ts",
  "ч": "ch",
  "ш": "sh",
  "щ": "sch",
  "ъ": "",
  "ы": "y",
  "ь": "",
  "э": "e",
  "ю": "ju",
  "я": "ja",
};

function deCyrillic(s: string): string {
  if (!s) return s;
  return String(s).replace(/[\u0400-\u04FF]/g, function (ch: string) {
    const low = ch.toLowerCase();
    const r = CYR[low];
    if (r === undefined) return "";
    if (ch !== low && r) return r.charAt(0).toUpperCase() + r.slice(1);
    return r;
  });
}

// Fetched once per invocation (n8n: once per execution). 1.68 MB, no CDN cache.
let linnudCache: Record<string, string> | null = null;

async function loadLinnud(): Promise<Record<string, string>> {
  if (linnudCache) return linnudCache;
  const res = await fetch(LINNUD_URL, { method: "GET" });
  if (!res.ok) throw new Error("linnud_fetch HTTP " + res.status);
  const map = parseLinnud(await res.text());
  // Approved deviation from n8n: v13 degraded silently to a no-op corrector
  // when the header row changed, writing uncorrected names. Fail before any
  // write instead.
  if (Object.keys(map).length === 0) {
    throw new Error(
      "linnud_empty_map: Linnud.txt parsed to 0 entries (nimi_lk/nimi_ek header missing?)",
    );
  }
  linnudCache = map;
  return map;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingItem {
  id: string;
  source_slug: string | null;
  source_lang: string | null;
  title: string | null;
  body: string | null;
}

// The shape n8n's `Parse Sonnet` produced.
interface ParsedItem {
  id: string;
  source_slug: string | null;
  title: string | null;
  body: string | null;
  title_raw?: string;
  body_raw?: string;
  translation_engine?: string;
  _error?: string;
}

type Patch = Record<string, unknown>;

interface AnthropicResponse {
  error?: { message?: string };
  stop_reason?: string;
  content?: Array<{ text?: string }>;
  usage?: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// ---------------------------------------------------------------------------
// n8n node: Parse Sonnet  (ported verbatim -- every failure path ends in
// _error, which the corrector turns into a written 'error' patch, NOT a skip)
// ---------------------------------------------------------------------------

function parseSonnet(src: PendingItem, resp: AnthropicResponse): ParsedItem {
  const out: ParsedItem = {
    id: src.id,
    source_slug: src.source_slug,
    title: src.title,
    body: src.body,
  };
  try {
    if (resp && resp.error) {
      throw new Error(
        (resp.error && resp.error.message)
          ? resp.error.message
          : "anthropic error",
      );
    }
    if (resp && resp.stop_reason === "max_tokens") {
      throw new Error("max_tokens hit");
    }
    const block = (resp && resp.content && resp.content[0])
      ? resp.content[0]
      : null;
    const txt = (block && block.text) ? block.text : "";
    const T = "###TITLE###", B = "###BODY###";
    const ti = txt.indexOf(T), bi = txt.indexOf(B);
    if (ti < 0 || bi < 0) throw new Error("missing delimiters in response");
    out.title_raw = txt.slice(ti + T.length, bi).trim();
    out.body_raw = txt.slice(bi + B.length).trim();
    out.translation_engine = "sonnet";
  } catch (e) {
    out._error = "sonnet: " + errMsg(e).slice(0, 300);
  }
  return out;
}

// n8n node: Correct + patch (the per-item half; dictionary load is hoisted)
function buildPatch(it: ParsedItem, latinToEt: Record<string, string>): Patch {
  if (it._error || (!it.title_raw && !it.body_raw)) {
    return {
      translation_v2_status: "error",
      translation_v2_error: String(it._error || "empty translation").slice(0, 500),
    };
  }
  return {
    title_et_v2:
      fixBirdNames(deCyrillic(String(it.title_raw || "")), latinToEt) || null,
    body_et_v2:
      fixBirdNames(deCyrillic(String(it.body_raw || "")), latinToEt) || null,
    translation_engine: it.translation_engine || null,
    translation_v2_status: "done",
    translation_v2_error: null,
    translated_v2_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Calls out
// ---------------------------------------------------------------------------

function webhookSecret(): string {
  const s = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!s) throw new Error("missing_env:VAATLUSTE_WEBHOOK_SECRET");
  return s;
}

// n8n node: Ingest (news-refresh) -- body verbatim from the export, onError
// continueRegularOutput. Only the summary fields are logged: the real response
// carries per-source arrays and is far too large for cron_runs.state.
async function runIngest(): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INGEST_TIMEOUT_MS);
  try {
    const res = await fetch(SUPABASE_URL + "/functions/v1/news-refresh", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": webhookSecret(),
      },
      body: JSON.stringify({
        reason: "scheduled",
        cache_images: true,
        cache_limit: 10,
        translateForeignNews: true,
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 300) };
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      ok: parsed.ok === true,
      inserted: Number(parsed.inserted ?? 0),
      updated: Number(parsed.updated ?? 0),
      errors: Array.isArray(parsed.errors) ? parsed.errors.length : 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

// n8n node: Get pending
async function getPending(limit: number): Promise<PendingItem[]> {
  const res = await fetch(
    SUPABASE_URL + "/functions/v1/get-news-untranslated-v2",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": webhookSecret(),
      },
      body: JSON.stringify({ limit }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      "get-news-untranslated-v2 HTTP " + res.status + ": " + text.slice(0, 300),
    );
  }
  const data = JSON.parse(text);
  return Array.isArray(data) ? data as PendingItem[] : [];
}

// n8n node: Sonnet call. A non-2xx is not thrown: n8n's onError
// continueRegularOutput fed the error body straight into Parse Sonnet, so the
// item still gets an 'error' patch written and leaves `pending`.
async function callSonnet(
  item: PendingItem,
  model: string,
  maxTokens: number,
): Promise<AnthropicResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) throw new Error("missing_env:ANTHROPIC_API_KEY");

  // n8n node: Build Sonnet request -- user message verbatim, String(x || '')
  // included so null/undefined become '' and not "null".
  const userMsg =
    "Tolgi jargnev uudis eesti keelde. Vasta TAPSELT vormis ###TITLE### ja ###BODY###, ilma muu tekstita.\n\nPEALKIRI:\n" +
    String(item.title || "") + "\n\nSISU:\n" + String(item.body || "");

  const areq = {
    model,
    max_tokens: maxTokens,
    temperature: 0.1,
    // The prompt is ~700 tokens, below Sonnet's 1024-token cache minimum, so
    // creation/read will read 0. Kept because it is free and pays off if the
    // prompt grows; nothing gates on the figures.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SONNET_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(areq),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        error: { message: "HTTP " + res.status + ": " + text.slice(0, 300) },
      };
    }
    return JSON.parse(text) as AnthropicResponse;
  } catch (e) {
    // A thrown call (timeout abort, network failure, non-JSON body) becomes an
    // error response rather than a throw, so Parse Sonnet writes the 'error'
    // patch -- n8n's onError: continueRegularOutput did exactly this.
    const detail = (e instanceof Error && e.name === "AbortError")
      ? "timeout after " + SONNET_TIMEOUT_MS + " ms"
      : errMsg(e);
    return { error: { message: detail.slice(0, 300) } };
  } finally {
    clearTimeout(timer);
  }
}

// n8n node: Write v2
async function writeV2(id: string, patch: Patch): Promise<void> {
  const res = await fetch(
    SUPABASE_URL + "/functions/v1/update-news-translation-v2",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": webhookSecret(),
      },
      body: JSON.stringify({ id, patch }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      "update-news-translation-v2 HTTP " + res.status + ": " +
        text.slice(0, 300),
    );
  }
}

// ---------------------------------------------------------------------------
// cron_runs logging (best effort -- a logging failure must not fail the job)
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

async function openRun(sb: Admin, runId: string): Promise<number | null> {
  const { data, error } = await sb
    .from("cron_runs")
    .insert({ job: "news", run_id: runId, hop: 0, state: {} })
    .select("id")
    .single();
  if (error) {
    console.error("[cron_runs open]", error.message);
    return null;
  }
  return (data as { id: number }).id;
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
  const rawLimit = Number(body.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(50, Math.floor(rawLimit)))
    : 10;
  // Defaults to true: under cron the ingest is its own job (m7-news-ingest).
  const skipIngest = body.skipIngest !== false;
  const dryRun = body.dryRun === true;
  // Debug-only (C6): forces the max_tokens guard. Ignored unless dryRun, so it
  // can never truncate a translation that would actually be written.
  const rawOverride = Number(body.maxTokensOverride);
  const maxTokens = dryRun && Number.isFinite(rawOverride) && rawOverride > 0
    ? Math.floor(rawOverride)
    : 4096;
  const model = Deno.env.get("ANTHROPIC_MODEL_NEWS") || "claude-sonnet-4-6";

  const started = Date.now();
  const runId = crypto.randomUUID();
  const sb = adminClient();
  const rowId = await openRun(sb, runId);

  let ingest: Record<string, unknown> = { skipped: true };
  let pending = 0;
  let translated = 0;
  let calls = 0;
  let partial = false;
  let remaining = 0;
  const skipped: Array<{ id: string; reason: string }> = [];
  const errors: Array<Record<string, unknown>> = [];
  const cache = { creation_tokens: 0, read_tokens: 0 };
  let fatal: string | null = null;

  try {
    // --- n8n node: Ingest (news-refresh) -- onError continue ---------------
    if (!skipIngest) {
      try {
        ingest = await runIngest();
      } catch (e) {
        ingest = { ok: false, error: errMsg(e).slice(0, 300) };
        console.error("[news-translate-v2]", {
          stage: "ingest",
          error: ingest.error,
        });
      }
    }

    // --- n8n node: Get pending --------------------------------------------
    const items = await getPending(limit);
    pending = items.length;

    // --- n8n node: Correct + patch (dictionary, once per run) --------------
    const latinToEt = items.length > 0
      ? await loadLinnud()
      : {} as Record<string, string>;

    // --- per item, sequentially (n8n ran items one after another) ----------
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (Date.now() - started > BUDGET_MS) {
        partial = true;
        remaining = items.length - i;
        for (let k = i; k < items.length; k++) {
          skipped.push({ id: items[k].id, reason: "budget" });
        }
        break;
      }

      const resp = await callSonnet(item, model, maxTokens);
      calls++;
      cache.creation_tokens += Number(
        resp.usage?.cache_creation_input_tokens ?? 0,
      );
      cache.read_tokens += Number(resp.usage?.cache_read_input_tokens ?? 0);

      const parsed = parseSonnet(item, resp);
      const patch = buildPatch(parsed, latinToEt);

      if (!dryRun) {
        try {
          await writeV2(item.id, patch);
        } catch (e) {
          errors.push({
            id: item.id,
            stage: "write",
            error: errMsg(e).slice(0, 300),
          });
          continue;
        }
      }

      if (parsed._error) {
        // max_tokens / anthropic error / missing delimiters: the 'error' patch
        // was written, so the item leaves `pending`. Reported here, not skipped.
        errors.push({
          id: item.id,
          stage: "sonnet",
          error: parsed._error,
          patch,
        });
      } else {
        translated++;
      }
    }
  } catch (e) {
    fatal = errMsg(e);
    console.error("[news-translate-v2]", { stage: "run", error: fatal });
  }

  const ok = fatal === null;
  const payload = {
    ok,
    run_id: runId,
    ingest,
    pending,
    translated,
    partial,
    remaining,
    skipped,
    errors,
    model,
    dry_run: dryRun,
    cache,
    took_ms: Date.now() - started,
    error: fatal,
  };

  // state = the response minus the error bodies (ids + stage only).
  await closeRun(sb, rowId, {
    calls,
    ok,
    state: {
      ...payload,
      errors: errors.map((e) => ({ id: e.id, stage: e.stage })),
    },
    error: fatal,
  });

  return json(ok ? 200 : 500, payload);
});
