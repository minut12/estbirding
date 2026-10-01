// redeploy-marker: 2026-10-01 - P89 Claude -> Gemini fallback via _shared/llm.ts (reactive + LLM_FORCE_PROVIDER)
// redeploy: P86d 2026-10-01 - corrector moved to _shared/bird-names.ts (part-wise sameSpecies, multi-word dict names, title/body stem propagation), [retry N] error prefix
// redeploy-marker: 2026-10-01 - P86d1 tolerant TITLE/BODY delimiters + raw head on parse failure
// redeploy-marker: 2026-10-01 - P86d0 drop temperature (rejected by claude-sonnet-5-5); P75/P85i model lines unchanged
// redeploy-marker: 2026-09-30 - P85i default model claude-sonnet-5 -> claude-sonnet-5-5 (env override unchanged)
// redeploy-marker: 2026-09-24 - P75 default model claude-sonnet-4-6 -> claude-sonnet-5 (env override unchanged)
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
import {
  collectBinomials,
  deCyrillic,
  fixItemBirdNames,
  type GlossaryEntry,
  type ItemText,
  type LatinToEt,
  parseLinnud,
} from "../_shared/bird-names.ts";
import {
  acceptGlossaryOutput,
  buildGlossaryUserMsg,
} from "../_shared/news-glossary.ts";
import { withRetryPrefix } from "../_shared/retry-prefix.ts";
import { anthropicMessages, llmConfigured } from "../_shared/llm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// Worst case: the budget check passes at 74.9 s, then one Sonnet call runs the
// full 50 s -> 125 s, plus the write. Under the 150 s gateway cutoff.
// P86e: the glossary pass (<= 30 s) only starts at <= 50 s elapsed, so it ends
// by ~80 s and never extends that worst case.
const BUDGET_MS = 75_000;
const SONNET_TIMEOUT_MS = 50_000;
// P86e glossary pass: its own shorter timeout, and it is only started while at
// least GLOSSARY_BUDGET_RESERVE_MS of BUDGET_MS is left.
const GLOSSARY_TIMEOUT_MS = 30_000;
const GLOSSARY_BUDGET_RESERVE_MS = 25_000;
// n8n's Ingest node allowed 300 s. Only reachable via {skipIngest:false} on a
// manual run -- under cron this EF never ingests. A slow ingest WILL get the
// isolate killed by the gateway; that is the documented cost of the manual path.
const INGEST_TIMEOUT_MS = 300_000;

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

// P86e glossary pass. ASCII-folded Estonian on purpose (same v13 convention as SYSTEM_PROMPT) -- do not 'fix' the spelling. 1670 chars, sha256 671949a3db33a8263a0f71de632e2fba21c526a89ab2d634ed252eede9539c37.
const GLOSSARY_PROMPT =
  `Oled eesti linnu-uudiste toimetaja. Sulle antakse lahtekeelne algtekst, selle eestikeelne tolge ja LIIGISONASTIK (ladina binoom = EOU eestikeelne nimi). Toimeta olemasolevat tolget - ara tolgi uuesti.

REEGLID:

1) LIIGINIMED - kasuta iga sonastikus oleva liigi kohta pealkirjas ja sisus TAPSELT sonastiku eestikeelset nime. Kaana nime loomulikult vastavalt lausele (nt "stepi-loorkulli sisseranne", "tutt-tiiru vaatlusi", "vahemere pistrikuga"). Ara kasuta liigi kohta muid nimesid, sunonuume ega kalke. Liitnime kirjapilt (sidekriips, kokku- voi lahkukirjutus) jaab TAPSELT selliseks nagu sonastikus.

2) LADINA BINOOMID - ara muuda, lisa ega eemalda uhtegi ladinakeelset binoomi. Iga tolkes olev binoom jaab samale kohale, nimetavasse, sulgudes nime jarele. Sonastikus puuduvaid liike ara puutu.

3) SUURTAHT - lause alguses olev liiginimi algab suure tahega (nt "Kuldtsiitsitaja (Emberiza aureola) on ..."), lause keskel vaikese tahega. Kohanimed ja isikunimed jaavad muutmata.

4) KEEL - paranda kohmakad, sona-sonalt tolgitud voi ebaloomulikud laused sujuvaks eesti linnu-uudiste keeleks (standardsed verbivormid: "nahti", "leiti", "jaadvustati"). Kui tahendus on ebaselge, vordle algtekstiga.

5) TRUUDUS - ara lisa ega jata valja uhtegi fakti, arvu, kuupaeva, nime ega lauset. Ara luhenda.

6) PEALKIRI - kui pealkiri on vaid viide postitusele voi fotodele (nt "Fotod X postitusest", "Photos from X's post"), asenda see luhikese sisulise pealkirjaga sisu esimese lause pohjal. Sisu ennast seejuures ara muuda.

VALJUND: vasta TAPSELT jargmises vormis, ilma muu teksti, kommentaaride ega markdownita:
###TITLE###
(toimetatud pealkiri)
###BODY###
(toimetatud sisu)`;

// Same module-load guards as SYSTEM_PROMPT (ASCII + CRLF-sensitive length).
if (/[^\x00-\x7F]/.test(GLOSSARY_PROMPT)) {
  throw new Error("GLOSSARY_PROMPT contains non-ASCII characters");
}
if (GLOSSARY_PROMPT.length !== 1670) {
  throw new Error(
    "GLOSSARY_PROMPT length " + GLOSSARY_PROMPT.length + " != 1670 (line endings?)",
  );
}

// ---------------------------------------------------------------------------
// n8n node: Correct + patch  (ran as runOnceForAllItems, so the dictionary was
// fetched once per execution -- kept that way here, cached for the invocation)
// ---------------------------------------------------------------------------

// Deterministic bird-name correction lives in ../_shared/bird-names.ts (P86d):
// parseLinnud, sameSpecies, fixItemBirdNames, CALQUES, deCyrillic. The
// dictionary = Linnud.txt (EOU checklist) hosted in Storage is loaded here.

// Fetched once per invocation (n8n: once per execution). 1.68 MB, no CDN cache.
let linnudCache: LatinToEt | null = null;

async function loadLinnud(): Promise<LatinToEt> {
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
  // Previous attempt's error ("[retry N] ..."), present on re-queued rows.
  translation_v2_error?: string | null;
}

// The shape n8n's `Parse Sonnet` produced.
interface ParsedItem {
  id: string;
  source_slug: string | null;
  title: string | null;
  body: string | null;
  prev_error: string | null;
  title_raw?: string;
  body_raw?: string;
  translation_engine?: string;
  _error?: string;
}

type Patch = Record<string, unknown>;

interface AnthropicResponse {
  error?: { message?: string };
  stop_reason?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// Sonnet 5.5 does not always echo the ###TITLE###/###BODY### delimiters
// byte-for-byte (spacing, bold, "TITLE:", code fences). A marker on its own
// line is matched by these patterns; inline "###TITLE### text" keeps indexOf.
const TITLE_RE =
  /^[ \t]*(?:\*\*|__)?\s*#{0,3}\s*TITLE\s*#{0,3}\s*(?:\*\*|__)?[ \t]*:?[ \t]*$/im;
const BODY_RE =
  /^[ \t]*(?:\*\*|__)?\s*#{0,3}\s*BODY\s*#{0,3}\s*(?:\*\*|__)?[ \t]*:?[ \t]*$/im;

function stripCodeFence(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .trim()
    .replace(/^```[^\n]*\n/, "")
    .replace(/\n?```$/, "")
    .trim();
}

function splitTitleBody(txt: string): { title: string; body: string } | null {
  const T = "###TITLE###", B = "###BODY###";
  const ti = txt.indexOf(T), bi = txt.indexOf(B);
  if (ti >= 0 && bi > ti && !TITLE_RE.test(txt)) {
    return {
      title: txt.slice(ti + T.length, bi).trim(),
      body: txt.slice(bi + B.length).trim(),
    };
  }
  const tm = TITLE_RE.exec(txt);
  if (!tm) return null;
  const rest = txt.slice(tm.index + tm[0].length);
  const bm = BODY_RE.exec(rest);
  if (bm) {
    return {
      title: rest.slice(0, bm.index).trim(),
      body: rest.slice(bm.index + bm[0].length).trim(),
    };
  }
  // TITLE without BODY: first line is the title, the rest is the body.
  const r = rest.trim();
  const nl = r.indexOf("\n");
  return nl < 0
    ? { title: r, body: "" }
    : { title: r.slice(0, nl).trim(), body: r.slice(nl + 1).trim() };
}

function extractText(resp: AnthropicResponse): string {
  // Join every text block; content[0] may be a non-text block. Untyped
  // responses fall back to content[0].text as before.
  const blocks = (resp && resp.content) ? resp.content : [];
  const typed = blocks.some((b) => Boolean(b) && typeof b.type === "string");
  return typed
    ? blocks
      .filter((b) => Boolean(b) && b.type === "text" && typeof b.text === "string")
      .map((b) => String(b.text))
      .join("\n")
    : ((blocks[0] && blocks[0].text) ? blocks[0].text : "");
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
    prev_error: src.translation_v2_error ?? null,
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
    const txt = extractText(resp);
    const split = splitTitleBody(stripCodeFence(txt));
    if (!split) {
      // Set directly (no throw) so the raw head is not cut by the 300-char
      // slice in the catch below.
      const blocks = (resp && resp.content) ? resp.content : [];
      const types = blocks.map((b) => (b && b.type) ? b.type : "?").join(",");
      out._error = "sonnet: missing delimiters; types=[" + types + "]; head=" +
        JSON.stringify(txt.slice(0, 400));
      return out;
    }
    out.title_raw = split.title;
    out.body_raw = split.body;
    out.translation_engine = "sonnet";
  } catch (e) {
    out._error = "sonnet: " + errMsg(e).slice(0, 300);
  }
  return out;
}

// P86e glossary pass: same error/delimiter guards as Parse Sonnet, no item.
function parseGlossary(
  resp: AnthropicResponse,
): { title: string; body: string } | { error: string } {
  if (resp.error) return { error: resp.error.message || "anthropic error" };
  if (resp.stop_reason === "max_tokens") return { error: "max_tokens hit" };
  const split = splitTitleBody(stripCodeFence(extractText(resp)));
  if (!split) return { error: "missing delimiters" };
  return split;
}

// n8n node: Correct + patch (the per-item half; dictionary load is hoisted)
function correctParsed(it: ParsedItem, latinToEt: LatinToEt): ItemText {
  return fixItemBirdNames(
    {
      title: deCyrillic(String(it.title_raw || "")),
      body: deCyrillic(String(it.body_raw || "")),
    },
    latinToEt,
  );
}

function buildErrorPatch(it: ParsedItem): Patch {
  return {
    translation_v2_status: "error",
    translation_v2_error: withRetryPrefix(
      it.prev_error,
      String(it._error || "empty translation"),
    ),
  };
}

function buildDonePatch(
  final: ItemText,
  engine: "sonnet" | "sonnet+glossary",
  glossary: readonly GlossaryEntry[] | null,
): Patch {
  const patch: Patch = {
    title_et_v2: final.title || null,
    body_et_v2: final.body || null,
    translation_engine: engine,
    translation_v2_status: "done",
    translation_v2_error: null,
    translated_v2_at: new Date().toISOString(),
  };
  return glossary !== null ? { ...patch, species_glossary: glossary } : patch;
}

type AnthropicUsage = NonNullable<AnthropicResponse["usage"]>;

type GlossaryOutcome =
  | { kind: "skipped"; reason: "empty_glossary" | "budget" }
  | {
    kind: "failed" | "rejected";
    reason: string;
    glossary: GlossaryEntry[];
    usage?: AnthropicUsage;
  }
  | {
    kind: "accepted";
    item: ItemText;
    glossary: GlossaryEntry[];
    usage?: AnthropicUsage;
  };

// P86e: second Sonnet call that edits the corrected translation against the
// EOU glossary. Never fatal -- any failure keeps the corrected first pass.
async function runGlossaryPass(
  src: PendingItem,
  corrected: ItemText,
  latinToEt: LatinToEt,
  model: string,
  maxTokens: number,
  started: number,
): Promise<GlossaryOutcome> {
  const source: ItemText = {
    title: String(src.title || ""),
    body: String(src.body || ""),
  };
  const glossary = collectBinomials(
    [source.title, source.body, corrected.title, corrected.body],
    latinToEt,
  );
  if (glossary.length === 0) return { kind: "skipped", reason: "empty_glossary" };
  if (Date.now() - started > BUDGET_MS - GLOSSARY_BUDGET_RESERVE_MS) {
    return { kind: "skipped", reason: "budget" };
  }
  const resp = await callAnthropic(
    GLOSSARY_PROMPT,
    buildGlossaryUserMsg(source, corrected, glossary),
    model,
    maxTokens,
    GLOSSARY_TIMEOUT_MS,
  );
  const usage = resp.usage;
  const parsed = parseGlossary(resp);
  if ("error" in parsed) {
    return {
      kind: "failed",
      reason: ("glossary: " + parsed.error).slice(0, 300),
      glossary,
      usage,
    };
  }
  const verdict = acceptGlossaryOutput(
    corrected,
    { title: parsed.title, body: parsed.body },
    glossary,
  );
  if (!verdict.ok) {
    return { kind: "rejected", reason: verdict.reason, glossary, usage };
  }
  return { kind: "accepted", item: verdict.item, glossary, usage };
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
// The P86e glossary pass goes through the same function with GLOSSARY_PROMPT.
async function callAnthropic(
  system: string,
  userMsg: string,
  model: string,
  maxTokens: number,
  timeoutMs: number = SONNET_TIMEOUT_MS,
): Promise<AnthropicResponse> {
  if (!llmConfigured()) throw new Error("missing_env:ANTHROPIC_API_KEY");

  const areq = {
    model,
    max_tokens: maxTokens,
    // The prompt is ~700 tokens, below Sonnet's 1024-token cache minimum, so
    // creation/read will read 0. Kept because it is free and pays off if the
    // prompt grows; nothing gates on the figures.
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await anthropicMessages(areq, ctrl.signal);
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
      ? "timeout after " + timeoutMs + " ms"
      : errMsg(e);
    return { error: { message: detail.slice(0, 300) } };
  } finally {
    clearTimeout(timer);
  }
}

// n8n node: Build Sonnet request -- user message verbatim, String(x || '')
// included so null/undefined become '' and not "null".
function buildTranslateUserMsg(item: PendingItem): string {
  return "Tolgi jargnev uudis eesti keelde. Vasta TAPSELT vormis ###TITLE### ja ###BODY###, ilma muu tekstita.\n\nPEALKIRI:\n" +
    String(item.title || "") + "\n\nSISU:\n" + String(item.body || "");
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
  const model = Deno.env.get("ANTHROPIC_MODEL_NEWS") || "claude-sonnet-5-5";

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
  const glossaryTally = { accepted: 0, rejected: 0, failed: 0, skipped: 0 };
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
      : {} as LatinToEt;

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

      const resp = await callAnthropic(
        SYSTEM_PROMPT,
        buildTranslateUserMsg(item),
        model,
        maxTokens,
      );
      calls++;
      cache.creation_tokens += Number(
        resp.usage?.cache_creation_input_tokens ?? 0,
      );
      cache.read_tokens += Number(resp.usage?.cache_read_input_tokens ?? 0);

      const parsed = parseSonnet(item, resp);
      let patch: Patch;
      if (parsed._error || (!parsed.title_raw && !parsed.body_raw)) {
        patch = buildErrorPatch(parsed);
      } else {
        const corrected = correctParsed(parsed, latinToEt);
        // --- P86e glossary pass (non-fatal; runs in dry runs too) ----------
        const outcome = await runGlossaryPass(
          item,
          corrected,
          latinToEt,
          model,
          maxTokens,
          started,
        );
        glossaryTally[outcome.kind]++;
        if (outcome.kind !== "skipped") {
          calls++;
          cache.creation_tokens += Number(
            outcome.usage?.cache_creation_input_tokens ?? 0,
          );
          cache.read_tokens += Number(
            outcome.usage?.cache_read_input_tokens ?? 0,
          );
        }
        const accepted = outcome.kind === "accepted";
        const final = outcome.kind === "accepted"
          ? fixItemBirdNames(outcome.item, latinToEt)
          : corrected;
        patch = buildDonePatch(
          final,
          accepted ? "sonnet+glossary" : "sonnet",
          outcome.kind === "skipped" ? null : outcome.glossary,
        );
        if (outcome.kind === "failed" || outcome.kind === "rejected") {
          errors.push({ id: item.id, stage: "glossary", error: outcome.reason });
        }
      }

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
    glossary: glossaryTally,
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
