// P6b.1 2026-09-05: effort-normalised site share ranking (ennustus P6b.1)
// P6b 2026-09-05: predicted_sites[] on entries + watch-list (ennustus P6b-EF)
// P4 2026-09-05: score v4 (phenology gate, direction, source, upstream), EE badge, upstream_obs (ennustus P4)
// toenaosus-orchestrator
// M7.5: port of the n8n workflow "tõenäosus-koordinaator v8.1"
// (UCPth8wljSkLBM64, versionId e477cb6e, schedule `10 6,18 * * *` Tallinn +
// unauthenticated webhook toenaosus-koordinaator). n8n dies 2026-09-19.
//
// The n8n nodes map onto the stages of run() below. Node bodies live in
// ../estbirding-memory/notes/m7-5-n8n-nodes/ (secrets masked there; this file
// reads every secret from Deno.env):
//
//   Build Config                  -> stage 1 (01-build-config.js)
//   Weather Corridors             -> stage 2 (02-weather-corridors.js)
//   Fetch + Compute               -> stage 3 (03-fetch-compute.js)
//   Persist Sightings             -> stage 4
//   Notify Near-Estonia Rarities  -> stage 5 (08-notify-near-estonia-rarities.js)
//   Sonnet                        -> stage 7 (04-sonnet-*.txt)
//   Parse + Merge                 -> stage 8 (05-parse-merge.js)
//   Insert -> Supabase            -> stage 9
//                                    stage 6: budget guard, stage 10: close row
//
// Shape (M7.4a): execution 4483 took 2:54 end to end with Sonnet alone at
// 164.4 s, so this returns 202 as soon as the cron_runs row is open and does the
// work inside EdgeRuntime.waitUntil(). beforeunload lands at ~360 s, hard kill
// ~400 s, hence ORCH_BUDGET_MS 340 s. n8n allowed Sonnet 900 s; that cannot be
// honoured inside a 400 s isolate, so the Sonnet timeout is
// min(290 s, budget - elapsed - 20 s).
//
// eBird: every call goes through the Netlify relay. eBird answers 418 to
// Supabase egress but 200 to Netlify's. The relay forwards ONLY its `path` query
// parameter, so the eBird query string must live INSIDE that encoded value.
// The relay allow-list regex accepts /data/obs/{REGION}/recent/notable?... for
// every region either season uses, RU-KGD included (A3, 2026-09-02).
//
// Auth: inbound X-Webhook-Secret == VAATLUSTE_WEBHOOK_SECRET. The four outbound
// EFs (insert-toenaosus-raport, insert-ebird-rare-observations,
// send-push-notifications, mark-observations-notified) all check that SAME
// secret. get-corridor-tags / get-ee-species-presence /
// get-toenaosus-season-signals are public and take no auth, exactly as n8n
// called them.
//
// ---------------------------------------------------------------------------
// APPROVED DEVIATIONS FROM THE n8n WORKFLOW (Kristian, 2026-09-02)
// ---------------------------------------------------------------------------
//
// 1. ORDER. n8n v1 execution order ran Persist Sightings + Notify AFTER Sonnet +
//    Insert (the node comment claims "parallel"; it is not). Here Persist and
//    Notify run BEFORE Sonnet, so a Sonnet failure can no longer block the rare-
//    bird push notifications.
//
// 2. max_tokens GUARD. n8n's Parse + Merge had none: a truncated response fell
//    through to JSON.parse and threw a confusing "non-JSON" error. Parse here
//    throws an explicit `Sonnet stopped on max_tokens (N tokens)` FIRST.
//
// 3. PERSIST FAILURE IS NON-FATAL. In n8n a non-2xx from
//    insert-ebird-rare-observations failed the node and stopped that branch.
//    Here it is recorded in state.persist = {error} and the run continues, so a
//    persistence outage cannot cost us the report. Note that
//    insert-ebird-rare-observations short-circuits an empty observations array
//    to 200 {ok,inserted:0,updated:0,skipped:0} without touching the RPC, so a
//    zero-rare-observation run is a success, not an error.
//
// 4. NOTIFY READS VIA THE SERVICE-ROLE CLIENT. n8n hit PostgREST directly with a
//    literal anon JWT embedded in the node. Same table, same filter, same order
//    -- but through adminClient(), so no key is inlined. Everything downstream
//    (title/body builders, 'rare-' + obs.id tag, '/ulevaade/toenaosus' url,
//    send-push body keys, the single mark-observations-notified call) is
//    byte-for-byte n8n.
//
// 5. MODEL LITERAL. n8n's Parse + Merge hardcoded model: 'claude-sonnet-4-6'
//    independently of what the Sonnet node actually sent. Here the row records
//    the model id actually used (sonnetModel(), default claude-sonnet-4-6), so
//    the column cannot drift from reality when ANTHROPIC_MODEL_TOENAOSUS_RAPORT
//    is set.
//
// 6. SUPABASE BASE URL. n8n inlined the project URL in every call; this file
//    composes the same URLs from Deno.env SUPABASE_URL, as vaatluste-
//    orchestrator does. Same project, identical URLs at runtime.
//
// 7. NETWORK TIMEOUTS. n8n relied on its own defaults (up to 300 s). Inside a
//    400 s isolate every call is given an explicit ceiling (see the *_TIMEOUT_MS
//    constants); nothing else about the calls changes.
//
// ---------------------------------------------------------------------------
// KNOWN-DEAD FIELDS -- PORTED VERBATIM ON PURPOSE, DO NOT "FIX" HERE
// ---------------------------------------------------------------------------
//
// ee_obs_count / ee_last_date / ee_last_location are always 0 / null / null,
// in this EF exactly as in live n8n today. Two independent reasons:
//   (a) get-ee-species-presence returns elurikkus_counts as
//       Record<sciName, number> -- a plain integer -- while node 03 reads it as
//       an object and asks for .count / .last_date / .last_location;
//   (b) that EF also builds ebird_ee_present as (vaatluste names UNION
//       elurikkus names), so any species carrying an elurikkus count is already
//       excluded by the v8.9 filter before the candidate is ever pushed.
// Reproducing this keeps the row shape identical to the n8n rows the app renders
// (verified against the 2026-09-02 03:12Z row). Making the fields work requires
// changing get-ee-species-presence, which is out of scope for M7.5.
//
// Likewise: get-toenaosus-season-signals rejects >200 species names with a 400.
// n8n swallowed that into seasonDiag.error and let every species fall back to
// the neutral 0.5 signal. That behaviour is kept; no batching was added.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  directionFit,
  type PhenologyRow,
  phenologyGate,
  scoreV4,
  seasonFor,
  type UpstreamRow,
  V4,
} from "./score.ts";
import {
  type PredictedSite,
  predictedSitesFor,
  seasonMonths,
  type SiteCell,
} from "./sites.ts";
// P5: only the names index.ts does not already own. haversineKm and
// initialBearingDeg are deliberately NOT imported -- this file defines its own
// further down, and etaFor uses eta.ts's copies internally anyway.
import {
  buildOpenMeteoUrl,
  type EtaResult,
  etaFor,
  type GeoPoint,
  midpoint,
  parseOpenMeteo,
  WIND_UNAVAILABLE_ET,
  type WindSample,
} from "./eta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_FN_BASE = SUPABASE_URL + "/functions/v1";

const SPECIES_META_URL = SUPABASE_URL +
  "/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json";
const CORRIDOR_TAGS_URL = SUPABASE_FN_BASE + "/get-corridor-tags";
const EE_PRESENCE_URL = SUPABASE_FN_BASE + "/get-ee-species-presence";
const SEASON_SIGNALS_URL = SUPABASE_FN_BASE + "/get-toenaosus-season-signals";

const EBIRD_RELAY_URL = Deno.env.get("EBIRD_RELAY_URL") ||
  "https://estbirds.netlify.app/api/ebird-relay";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16384;

// M7.4a: beforeunload ~360 s, hard kill ~400 s.
const ORCH_BUDGET_MS = 340_000;
const SONNET_MAX_TIMEOUT_MS = 290_000;
const SONNET_RESERVE_MS = 20_000;

// The relay caps its own eBird call at 9 s, so this ceiling is only a backstop.
const EBIRD_TIMEOUT_MS = 20_000;
const WEATHER_TIMEOUT_MS = 10_000; // n8n Weather Corridors node
const META_TIMEOUT_MS = 10_000; // species_meta / corridor-tags / ee-presence
// P8a.1: 62 names exceeded 10 s (run 334); budget ORCH_BUDGET_MS has room
const SEASON_TIMEOUT_MS = 45_000; // get-toenaosus-season-signals
const PERSIST_TIMEOUT_MS = 60_000; // n8n Persist Sightings node
const NOTIFY_TIMEOUT_MS = 30_000; // send-push / mark-observations-notified
const INSERT_TIMEOUT_MS = 30_000; // n8n Insert -> Supabase node

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

function sonnetModel(): string {
  return Deno.env.get("ANTHROPIC_MODEL_TOENAOSUS_RAPORT") || DEFAULT_MODEL;
}

// ---------------------------------------------------------------------------
// EdgeRuntime, feature-detected as in m7-probe / vaatluste-orchestrator.
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
    console.error("[toenaosus-orch] waitUntil threw", errMsg(e));
  }
  return false;
}

const WAIT_UNTIL_AVAILABLE = typeof edgeRuntime()?.waitUntil === "function";

// ---------------------------------------------------------------------------
// cron_runs logging -- openRun / touchRun / closeRun copied from
// vaatluste-orchestrator rather than shared, so porting a workflow never edits
// code the live schedulers run.
// ---------------------------------------------------------------------------

function adminClient() {
  return createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

// PostgREST caps a request at 1000 rows, so a bare .range(0, 1999) is a SILENT
// truncator once a table outgrows the cap. Page until a short page comes back.
// deno-lint-ignore no-explicit-any
async function readAll<T>(
  // deno-lint-ignore no-explicit-any
  sb: any,
  table: string,
  select: string,
  page = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100_000; from += page) {
    const { data, error } = await sb.from(table).select(select)
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}_read_failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
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

// Heartbeat after every stage. Never throws: a logging failure must not abort a
// run that is otherwise making progress.
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
    console.error("[cron_runs touch]", errMsg(e));
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
// for ONE update, so once it has written the shutdown reason every later
// heartbeat and close must skip.
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
        `[toenaosus-orch] beforeunload reason=${reason} open_runs=${OPEN_RUNS.size}`,
      );
      const sb = adminClient();
      for (const run of OPEN_RUNS.values()) {
        console.error(
          `[toenaosus-orch] beforeunload row=${run.rowId} stage=${run.stage} elapsed=${
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
          console.error("[toenaosus-orch] beforeunload close", errMsg(e))
        );
        keepAlive(p);
      }
      OPEN_RUNS.clear();
    });
    return true;
  } catch (e) {
    console.error("[toenaosus-orch] beforeunload register failed", errMsg(e));
    return false;
  }
}

function registerUnhandledRejection(): boolean {
  try {
    addEventListener("unhandledrejection", (ev: Event) => {
      const reason = (ev as Event & { reason?: unknown }).reason;
      console.error("[toenaosus-orch] unhandledrejection", errMsg(reason));
      ev.preventDefault();
    });
    return true;
  } catch (e) {
    console.error(
      "[toenaosus-orch] unhandledrejection register failed",
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
// node "Sonnet" -- the system prompt, byte-for-byte from the n8n export.
//
// n8n stored it as a JSON string literal with \uXXXX escapes (7 708 encoded
// chars); this is the DECODED runtime string Sonnet actually receives. It
// contains no backtick, no backslash and no ${, so it needs zero escaping
// inside this template literal and its char count is unambiguous.
//
// DO NOT "fix" anything in this text -- not the spelling, not the spacing, not
// the line breaks. It is what Sonnet has been reading twice a day; changing it
// changes the output and breaks the hash below.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Sa oled Eesti Ornitoloogiaühingu koordinaator, kes valmistab ette tõenäosuse-raportit haruldaste lindude võimalikust saabumisest Eestisse naabermaadest.

Sulle antakse JSON-andmed kandidaatliikide kohta (viimase 30 päeva naabermaade vaatlused liikidest, kes on Eestis liigitatud kui rare/super/mega-haruldused) JA praeguste ilmastikutingimuste kohta (weather-väli).

Weather-väli sisaldab 850 hPa rõhupinna (õhusammu liikumistasandi) tuule- ja õhurõhuandmeid ning aktiivseid "õhuvoolu-koridore" (active_corridors). Iga aktiivse koridori juures on "direction_text_et" (üks 8 täpsest tuulesuunast: põhi, kirre, ida, kagu, lõuna, edela, lääs, loe) ning "direction_abbr" (N, NE, E, SE, S, SW, W, NW). KASUTA narratiivis täpsemat suunda direction_text_et väljast, MITTE üldistust nagu "lõuna/edela". IGAL koridoril on "arrival_type_et" väli, mis ütleb, kas see esindab "mandritevahelist" (kauglind vaagundliikidele kaugetest pesitsusaladelt) või "regionaalset" (lähedaste populatsioonide liikumisi) saabumist. See vahe on tähtis — kõik koridorid EI ole tugevad ennustused; regionaalsed liikumised toimuvad sõltumata praegusest tuulemustrist.

Sinu ülesanne:
1) Kirjuta eestikeelne sissejuhatus (1 lõik, 3–5 lauset):
   - Üldine pilt: kui palju liike on naabermaades nähtud, milliseid trende on, millised on eriti tähelepanuväärsed.
   - LISA ALATI üks lause ilmastiku kohta. Kui weather.active_corridors EI OLE tühi: nimeta koridor, märgi selle arrival_type ja selgita lühidalt, kas see suurendab tõenäosust (mandritevaheline) või on pigem regionaalse iseloomuga (lähedaste liikumiste signaal). Kui active_corridors ON tühi: lühidalt märgi, et praegused 850 hPa tuulemustrid ei loo eriti soodsaid tingimusi kaugemate vaagundliikide kandumiseks.
   - Kui weather.summary.is_high_pressure on true: maini ka kõrgrõhkkonna olemasolu Euroopa kohal.
2) Iga liigi kohta:
   - rarity_reason: 1 lause liigi üldise haruldase staatuse kohta Eestis (pesitsusala, miks Eestis haruldane).
   - why_likely_et: 1–2 lauset, miks just nüüd võiks liik Eestisse jõuda.
     * Vaata ALATI neighbor_breakdown välja, mis näitab, KUS naabermaades see liik viimase 30 päeva jooksul vaadeldud on (nt PL ×76 tähendab 76 vaatlust Poolas).
     * Kui liigi tegelik naabermaa-aktiivsus VASTAB aktiivse koridori lähtepiirkonnale (nt liik aktiivne Poolas ja Lätis, koridor on lõuna/edela): maini koridori toetust otsesõnu (näit. "Praegune kagutuul Kaspia mere piirkonnast suurendab tõenäosust veelgi.").
     * Kui liigi tegelik naabermaa-aktiivsus EI VASTA aktiivse koridori lähtepiirkonnale (nt korridor on lõuna/edela, aga liik on hoopis Rootsis või Soomes nähtud): MAINI seda otsesõnu — selgita, et selle liigi võimalik saabumine tuleneb pigem regionaalsest lähedusest või konkreetse populatsiooni liikumisest, mitte praegusest tuulekoridorist. Näide: "Naerutiir on viimase nädala jooksul nähtud Rootsis; saabumine Eestisse on tõenäolisem regionaalne, mitte lõunatuulest tingitud."
     * Kui ükski koridor pole aktiivne: tugine ainult vaatluskogumitele, kaugusele ja kuupäevadele.
   - likely_arrival_sites_et: Massiiv 1–3 objektist {name, reasoning}, mis nimetab Eestis tõenäolisi saabumiskohti, kuhu see liik praeguste tingimustega võiks jõuda.
     * Lähtu source observation koordinaatidest (lat, lng) JA praegusest tuulesuunast (active_corridors → direction_text_et, või kui koridore pole, üldine 850 hPa muster).
     * Eelista alljärgnevaid tuntud haruldaste lindude saabumiskohti, kus need konteksti sobivad:
       - Lääne-Eesti rannik: Haeska linnuvaatlustorn, Sutlepa meri, Matsalu rahvuspark, Põõsaspea neem, Pärispea poolsaar
       - Saaremaa: Sõrve säär, Vilsandi, Pilguse laht
       - Hiiumaa: Kalana, Tahkuna nina, Kõpu poolsaar
       - Lõuna- ja edelarannik: Pärnu, Häädemeeste, Kabli, Kihnu
       - Põhja-Eesti rannik: Käsmu, Naissaar, Aegna, Pakri
       - Ida-Eesti: Peipsi rannik (Kallaste, Mustvee), Setomaa
       - Sisemaa kagu/lõuna (purjelennul maismaalindude maandumisalad): Karula ja Otepää kõrgustik, Aardla järv ja Tartu märgalad, Võrtsjärve ümbrus, Haanja, Võru
     * Anchor-listist väljas võid välja pakkuda ka muu täpse asukoha (konkreetne vaatlustorn, laht, neem, rabaserv), kui see on liigi ja praeguste tingimuste valguses täpsem.
     * Iga koha "reasoning" — 1 lühike Eesti lause (10–20 sõna), mis ühendab konkreetse koha lähima naabermaa vaatlusega, tuulesuunaga või rannikupõhise rändeteega.
     * MÄÄRA ESMALT liigi lennustrateegia, sest see otsustab ranniku vs sisemaa:
       - Purjelennul maismaalinnud (kotkad, loorkullid, raisakotkad, toonekured — nt Circaetus, Aquila, Clanga, Circus, Aegypius, Ciconia) liiguvad termikipurjel üle maismaa ja väldivad pikki ülemerelende. Nad saabuvad SISEMAALT lõunast ja kagust üle Läti maismaapiiri — eelista sisemaa kagu/lõuna kohti (Karula ja Otepää kõrgustik, Aardla, Tartu märgalad, Võrtsjärv, Haanja, Võru, Setomaa). ÄRA paku neile merevaatluse neemesid ega saari.
       - Mere- ja veelinnud (kaurid, vardid, ännid, tiirud, kajakad, sukelpardid — nt Gavia, Stercorarius, Ichthyaetus, Aythya) liiguvad mööda merd ja rannikut — eelista ranniku merevaatluskohti (Sõrve, Põõsaspea, Pakri, Käsmu, Kihnu).
       - Üle mere rändavad värvulised ja väikerändurid (kärbsenäpid, kiurud, lõokesed, pääsukesed) teevad saartel esmamaandumise — eelista Lääne-Eesti saari ja rannikut (Saaremaa lääs, Hiiumaa lääs/põhi, Põõsaspea).
     * Lähteregioon → eelistatud Eesti kohad (täpsustus pärast lennustrateegia määramist):
       - LV/LT/PL/BY lõuna: nii mandri SW/W rannik (Haeska, Sutlepa, Matsalu, Kabli, Häädemeeste) kui ka Lääne-Eesti saared — Saaremaa (Sõrve, Vilsandi, Pilguse) JA Hiiumaa W/N (Kõpu, Tahkuna nina, Kalana, Ristna, Dirhami). Saared on rannikupidi liikuvatele lõunarännuritele sama loomulik esmamaandumiskoht kui mandriosa; eelista mitmekesist valikut, mitte ainult mandri SW kobarat
       - SE/FI loode/lääs: Lääne-Eesti saared, Hiiumaa lääne- ja põhjarand, Põhja-Eesti
       - RU/BY ida: Peipsi rannik, Kagu-Eesti
     * Kui tuulesuund vastandub liigi tüüpilisele saabumissuunale, maini lühidalt ühe koha reasoning'is, kuidas tuul mõjutab.

Vastus AINULT JSON-formaadis, ilma backtick'ideta ega lisaselgitusteta:
{
  "intro_et": "...",
  "entries": [
    {
      "ebird_code": "...",
      "rarity_reason": "...",
      "why_likely_et": "...",
      "likely_arrival_sites_et": [
        {"name": "Haeska linnuvaatlustorn", "reasoning": "..."}
      ]
    }
  ]
}

Toon: faktiline, lugupidav, mitte sensatsiooniline. Kasuta Eesti Ornitoloogiaühingu rände-uudiste stiili.`;

// node "Fetch + Compute" -- the two halves of sonnet_user_content, byte-for-byte
// from 03-fetch-compute.js lines 491 and 493. The suffix contains ONE literal
// backtick, written here as \` -- an escape that counts as a single char, so
// USER_SUFFIX_CHARS stays 121.
const USER_PREFIX =
  `Andmed kandidaatliikide ja praeguste ilmastikutingimuste kohta:\n\n`;

const USER_SUFFIX =
  `\n\nTagasta AINULT JSON ülaltoodud formaadis (intro_et + entries[]). Ära kasuta backtick\`e ega muud teksti enne või pärast.`;

// Measured from the n8n export (A2, 2026-09-02), DECODED -- i.e. the strings
// Sonnet receives.
const SYSTEM_PROMPT_CHARS = 6540;
const SYSTEM_PROMPT_SHA256 =
  "cc35262c41057d6e505b696713151185192907d39c8eb248d3b730af497ff0f6";
const USER_PREFIX_CHARS = 65;
const USER_PREFIX_SHA256 =
  "80a070691d1137b983c82813bddb2792354fda942cd033cf29d79ba80470ef6c";
const USER_SUFFIX_CHARS = 121;
const USER_SUFFIX_SHA256 =
  "6ae72d992bf521a0fda942bcef26ce56991afa7dfcbe868a5761e684d2a34deb";

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
// different prompt than the one n8n has been running. Editors strip trailing
// spaces and normalise line endings; only the hash catches that.
for (
  const [label, text, chars, want] of [
    ["SYSTEM_PROMPT", SYSTEM_PROMPT, SYSTEM_PROMPT_CHARS, SYSTEM_PROMPT_SHA256],
    ["USER_PREFIX", USER_PREFIX, USER_PREFIX_CHARS, USER_PREFIX_SHA256],
    ["USER_SUFFIX", USER_SUFFIX, USER_SUFFIX_CHARS, USER_SUFFIX_SHA256],
  ] as Array<[string, string, number, string]>
) {
  if (text.length !== chars) {
    throw new Error(`${label} length ${text.length} != ${chars}`);
  }
  const actual = await sha256Hex(text);
  if (actual !== want) {
    throw new Error(`${label} sha256 ${actual} != ${want}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
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

// POST JSON to one of our own Edge Functions with the shared webhook secret.
// All four callees (insert-toenaosus-raport, insert-ebird-rare-observations,
// send-push-notifications, mark-observations-notified) check the SAME
// VAATLUSTE_WEBHOOK_SECRET.
function postSecured(
  fn: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const secret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!secret) throw new Error("missing_env:VAATLUSTE_WEBHOOK_SECRET");
  return fetchJson(
    `${SUPABASE_FN_BASE}/${fn}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
}

// eBird through the Netlify relay. The relay reads ONLY its `path` query
// parameter and forwards that one string to api.ebird.org, so the eBird query
// string must be inside the encoded value.
//
// The relay passes eBird's status through verbatim (a 418 arrives as a 418 with
// eBird's body); only a relay-side timeout becomes 504. Either way: throw, and
// let the caller record the region as empty, which is what n8n's catch did.
async function ebirdGet(
  path: string,
  timeoutMs = EBIRD_TIMEOUT_MS,
): Promise<unknown[]> {
  const secret = Deno.env.get("EBIRD_RELAY_SECRET");
  if (!secret) throw new Error("missing_env:EBIRD_RELAY_SECRET");
  const url = EBIRD_RELAY_URL + "?path=" + encodeURIComponent(path);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-relay-secret": secret, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`relay HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpeciesMeta {
  name?: string;
  estonianName?: string;
  scientificName?: string;
  rarityLevel?: string;
  ebirdCode?: string;
  avatarUrl?: string | null;
  predictionExclude?: boolean;
  expected_corridors?: string[];
  [k: string]: unknown;
}

interface EbirdObs {
  speciesCode?: string;
  comName?: string;
  sciName?: string;
  locName?: string;
  subnational1Name?: string;
  obsDt?: string;
  howMany?: number;
  lat?: number;
  lng?: number;
  subId?: string;
  userDisplayName?: string;
  _region?: string;
  [k: string]: unknown;
}

interface Corridor {
  id: string;
  name_et: string;
  direction_text_et: string;
  arrival_type_et: string;
  description_et: string;
  example_species_et: string[];
  direction_deg?: number;
  direction_abbr?: string;
  avg_wind_speed_kmh?: number;
  strength?: string;
}

interface WeatherSummary {
  avg_wind_speed_kmh: number;
  avg_wind_dir_deg: number;
  avg_pressure_hpa: number;
  max_pressure_hpa: number;
  is_high_pressure: boolean;
}

interface WeatherCorridorsResult {
  fetched_at: string;
  source: string;
  location: { lat: number; lon: number; name: string };
  horizon: string;
  error?: string;
  summary: WeatherSummary | null;
  active_corridors: Corridor[];
}

interface RunConfig {
  season: string;
  regions: string[];
  period_start: string;
  period_end: string;
  run_id: string;
}

interface NeighborBreakdown {
  country_code: string;
  obs_count: number;
  last_date: string;
}

interface NearestObs {
  country_code: string;
  location: string;
  lat: number | undefined;
  lng: number | undefined;
  date: string;
  count: number;
  sub_id: string | null;
  observers: string[];
}

interface ProbabilityFactors {
  tier_base: number;
  count_factor: number;
  distance_factor: number;
  season_factor: number;
  // v3 diagnostics: still computed and written, no longer part of the score.
  corridor_factor: number;
  adjacency_bonus: number;
  raw_score: number;
  season_gate: number;
  // v4
  phenology_gate: number;
  direction_fit: number;
  source_fit: number;
  upstream: number;
  season: string | null;
  phenology_source: string;
  calibrated_score: number;
  formula_version: string;
  // v14 / P4.1 -- additive only, written in the band loop after the score.
  // timing_cap and source_direction are the multipliers actually applied;
  // source_bearing_delta and arrival_bearing are the raw inputs, kept so the
  // taper stays tunable from the calibration CSV.
  timing_cap?: number;
  source_direction?: number | null;
  source_bearing_delta?: number | null;
  arrival_bearing?: number | null;
}

interface UpstreamObs {
  country_code: string;
  location: string;
  date: string;
  count: number;
  distance_km: number;
  bearing_from_ee: number;
  // P5a: coordinates of the observation itself, so P5 can use upstream_obs[0]
  // as the ETA source point. The builder already filters on numeric lat/lng,
  // so both are always present on every row it emits.
  lat: number;
  lon: number;
}

interface Candidate {
  ebird_code: string;
  name_et: string;
  name_lat: string;
  rarity_level: string;
  ee_obs_count: number;
  ee_last_date: string | null;
  ee_last_location: string | null;
  expected_corridors: string[];
  corridor_match: boolean;
  avatar_url: string | null;
  probability_pct: number;
  nearest_obs: NearestObs;
  distance_to_ee_km: number;
  total_neighbor_obs_30d: number;
  neighbor_breakdown: NeighborBreakdown[];
  probability_factors: ProbabilityFactors;
  ee_present: boolean;
  upstream_obs: UpstreamObs[];
  predicted_sites: PredictedSite[];
  timing_band?: string;
  arrival_window_et?: string;
  freshest_obs_days?: number | null;
  // P5: carried from species_phenology so parseMerge can pick the airspeed and
  // hours-per-day for the ETA. The Sonnet payload whitelists its fields
  // explicitly (see candidates.map() below), so this never reaches the prompt.
  flight_class?: string | null;
}

interface WatchlistItem {
  ebird_code: string;
  species_et: string | null;
  species_lat: string | null;
  rarity_level: string;
  avatar_url: string | null;
  matched_corridors: string[];
  matched_corridor_names_et: string[];
  arrival_bearing: number | null;
  phenology_mode: string | null;
  direction_fit: number;
  phenology_gate: number;
  predicted_sites: PredictedSite[];
}

interface RareObservation {
  ebird_sub_id: string;
  species_code: string;
  species_lat_name: string | null;
  species_et_name: string | null;
  rarity_level: string | null;
  country_code: string | null;
  region: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  distance_to_ee_km: number | null;
  obs_date: string;
  obs_count: number;
  observer_names: string[];
  raw_observation: EbirdObs;
}

interface SeasonDiag {
  attempted: number;
  fetched: number;
  with_signal: number;
  with_fallback: number;
  error: string | null;
  elapsed_ms: number | null;
}

interface FetchComputeResult {
  config: RunConfig;
  weather_corridors: WeatherCorridorsResult | null;
  candidates: Candidate[];
  corridor_watchlist: WatchlistItem[];
  sonnet_user_content: string;
  rare_observations: RareObservation[];
  source_data: Record<string, unknown>;
  ebird_errors: Array<{ region: string; error: string }>;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// node "Build Config" -- 01-build-config.js, verbatim.
//
// Build run configuration: season -> region set -> period window.
// Spring/summer (Mar 1 - Jul 31): LV, LT, BY, PL, RU-KGD, SE, FI
// Fall/winter   (Aug 1 - Feb 28): FI, RU-LEN, RU-PSK, RU-KR, SE, LV, LT, PL,
//                                 BY, RU-KGD
// P8a: see buildConfig() comment for score effect.
// v8.2: added SE year-round and FI to spring (catches west-route migrants like
// Chlidonias leucopterus from SE coast).
// ---------------------------------------------------------------------------

function buildConfig(): RunConfig {
  const now = new Date();
  const month = now.getMonth() + 1; // 1..12
  const isSpringSummer = month >= 3 && month <= 7;

  const seasonConfig = isSpringSummer
    ? {
      season: "spring_summer",
      regions: ["LV", "LT", "BY", "PL", "RU-KGD", "SE", "FI"],
    }
    : {
      season: "fall_winter",
      // P8a 2026-09-09: LV/LT/PL/BY/RU-KGD were spring-only, so from Aug 1 the
      // upstream pool was ~85 % SE and every southern/eastern vagrant was
      // sourced from Sweden (reffal1: 13/13 obs FI+SE, delta 136).
      // Widening moves scores through COUNT_W (totalCount sums all regions),
      // DIST_W (nearest obs; LV/LT/PL are inside lambda 350 km where Ottenby
      // is not) and UP_W (LV/LT rows in rarity_upstream_stats become
      // reachable). PL/BY map to null in regionToCountry and are score-inert:
      // they only widen the pool and the nearest-obs choice. DIR_W/SRC_W are 0
      // and cannot bias anything. Expect candidates_after_floor to rise.
      regions: ["FI", "RU-LEN", "RU-PSK", "RU-KR", "SE", "LV", "LT", "PL", "BY", "RU-KGD"],
    };

  const periodEnd = now.toISOString().slice(0, 10);
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const runId = `toenaosus-${
    now.toISOString().replace(/[:.]/g, "-").slice(0, 19)
  }`;

  return {
    season: seasonConfig.season,
    regions: seasonConfig.regions,
    period_start: periodStart,
    period_end: periodEnd,
    run_id: runId,
  };
}

// ---------------------------------------------------------------------------
// node "Weather Corridors" -- 02-weather-corridors.js, verbatim.
//
// Fetch 850 hPa wind + sea-level pressure from Open-Meteo for Estonia centroid.
// Classify which synoptic corridor (Caspian/Central-Asia, Black-Sea/Pannonian,
// North-Atlantic) is delivering air to Estonia over -5d past + +3d forecast
// window.
//
// Open-Meteo is free, no API key. If the call fails, we pass empty corridors and
// the pipeline continues -- weather is additive, never blocking.
// ---------------------------------------------------------------------------

const LAT = 58.6;
const LON = 25.5;
const PAST_DAYS = 5;
const FORECAST_DAYS = 3;
const MIN_TRANSPORT_KMH = 25;
const STRONG_TRANSPORT_KMH = 40;
const HIGH_PRESSURE_HPA = 1018;

// Wind direction = direction wind is COMING FROM.
// 8 compass sectors (45 deg wedges) for precise direction labels:
//   0-22.5 / 337.5-360 (N)  -> no corridor (arctic)
//   22.5-67.5   (NE)        -> no corridor (arctic)
//   67.5-112.5  (E)         -> Caspian/Central Asia
//   112.5-157.5 (SE)        -> Caspian/Central Asia
//   157.5-202.5 (S)         -> Black Sea/Pannonian
//   202.5-247.5 (SW)        -> Black Sea/Pannonian
//   247.5-292.5 (W)         -> Scandinavia/W Europe
//   292.5-337.5 (NW)        -> Scandinavia/W Europe
function compassSector(deg: number): { name: string; abbr: string } {
  const sectors = [
    { lo: 0, hi: 22.5, name: "põhi", abbr: "N" },
    { lo: 22.5, hi: 67.5, name: "kirre", abbr: "NE" },
    { lo: 67.5, hi: 112.5, name: "ida", abbr: "E" },
    { lo: 112.5, hi: 157.5, name: "kagu", abbr: "SE" },
    { lo: 157.5, hi: 202.5, name: "lõuna", abbr: "S" },
    { lo: 202.5, hi: 247.5, name: "edela", abbr: "SW" },
    { lo: 247.5, hi: 292.5, name: "lääs", abbr: "W" },
    { lo: 292.5, hi: 337.5, name: "loe", abbr: "NW" },
    { lo: 337.5, hi: 360, name: "põhi", abbr: "N" },
  ];
  for (const s of sectors) {
    if (deg >= s.lo && deg < s.hi) return s;
  }
  return { name: "põhi", abbr: "N" };
}

// ---- P5: 850 hPa wind per (source, predicted site) midpoint ---------------
//
// One Open-Meteo call for every pair in the run. Measured 2026-09-09 from this
// machine: 53 locations -> HTTP 200, 53 location objects, ~0.31 s (three runs:
// 312/303/306 ms). That is ~3% of WEATHER_TIMEOUT_MS and ~0.1% of a 218 s run,
// so it needs no batching and no timeout change.
//
// WIND-NOW IS THE DESIGN, NOT AN OVERSIGHT. buildOpenMeteoUrl asks for
// forecast_days=2 with no past_days, and parseOpenMeteo averages now -> +24 h.
// The ETA is a forward prediction of the earliest arrival from today; it is NOT
// a reconstruction of a flight already under way, which is what a past_days
// window would give. Do not widen the window to "fix" it.
interface EtaWinds {
  byKey: Map<string, WindSample>;
  requested: number;
  returned: number;
  error: string | null;
}

function etaWindKey(ebirdCode: string, siteIdx: number): string {
  return ebirdCode + "|" + siteIdx;
}

async function predictedSiteWinds(
  candidates: readonly Candidate[],
): Promise<EtaWinds> {
  const keys: string[] = [];
  const points: GeoPoint[] = [];
  for (const c of candidates) {
    // The ETA source is the FRESHEST upstream observation, not the nearest.
    const src = c.upstream_obs?.[0];
    if (!src || typeof src.lat !== "number" || typeof src.lon !== "number") {
      continue;
    }
    const sites = c.predicted_sites ?? [];
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (!s || typeof s.lat !== "number" || typeof s.lon !== "number") continue;
      keys.push(etaWindKey(c.ebird_code, i));
      points.push(midpoint(src.lat, src.lon, s.lat, s.lon));
    }
  }

  const none: EtaWinds = {
    byKey: new Map(),
    requested: points.length,
    returned: 0,
    error: null,
  };
  if (!points.length) return none;

  try {
    const json = await fetchJson(
      buildOpenMeteoUrl(points),
      { method: "GET" },
      WEATHER_TIMEOUT_MS,
    );
    const samples = parseOpenMeteo(json, new Date());
    // parseOpenMeteo drops any location with no usable hour, so a short array
    // would shift every later sample onto the wrong site -- a silent, plausible
    // wrong answer. Positional pairing is only sound at equal length; anything
    // else degrades to no wind at all, which surfaces honestly as
    // WIND_UNAVAILABLE_ET.
    if (samples.length !== points.length) {
      return {
        ...none,
        returned: samples.length,
        error: "length mismatch: requested " + points.length +
          ", parsed " + samples.length,
      };
    }
    const byKey = new Map<string, WindSample>();
    for (let i = 0; i < keys.length; i++) byKey.set(keys[i], samples[i]);
    return {
      byKey,
      requested: points.length,
      returned: samples.length,
      error: null,
    };
  } catch (e) {
    // A failed or timed-out fetch must leave the raport otherwise identical.
    return { ...none, error: e instanceof Error ? e.message : String(e) };
  }
}

async function weatherCorridors(): Promise<WeatherCorridorsResult> {
  const url = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + LAT + "&longitude=" + LON +
    "&hourly=wind_speed_850hPa,wind_direction_850hPa,pressure_msl" +
    "&past_days=" + PAST_DAYS + "&forecast_days=" + FORECAST_DAYS +
    "&wind_speed_unit=kmh" +
    "&timezone=Europe%2FTallinn";

  try {
    const wx = await fetchJson(url, { method: "GET" }, WEATHER_TIMEOUT_MS) as {
      hourly?: Record<string, number[]>;
    };
    const hourly = wx.hourly || {};
    const speeds = (hourly.wind_speed_850hPa || [])
      .filter((v) => Number.isFinite(v));
    const dirs = (hourly.wind_direction_850hPa || [])
      .filter((v) => Number.isFinite(v));
    const pressures = (hourly.pressure_msl || [])
      .filter((v) => Number.isFinite(v));

    let sumSin = 0, sumCos = 0;
    for (const d of dirs) {
      const rad = d * Math.PI / 180;
      sumSin += Math.sin(rad);
      sumCos += Math.cos(rad);
    }
    const meanDirRad = Math.atan2(
      sumSin / Math.max(dirs.length, 1),
      sumCos / Math.max(dirs.length, 1),
    );
    const avgDir = ((meanDirRad * 180 / Math.PI) + 360) % 360;
    const avgSpeed = speeds.length
      ? speeds.reduce((s, v) => s + v, 0) / speeds.length
      : 0;
    const avgPressure = pressures.length
      ? pressures.reduce((s, v) => s + v, 0) / pressures.length
      : 0;
    const maxPressure = pressures.length ? Math.max.apply(null, pressures) : 0;

    const active_corridors: Corridor[] = [];
    if (avgSpeed >= MIN_TRANSPORT_KMH) {
      const sector = compassSector(avgDir);
      let corridor: Corridor | null = null;

      if (sector.abbr === "E" || sector.abbr === "SE") {
        corridor = {
          id: "caspian_central_asia",
          name_et: "Kaspia mere ja Kesk-Aasia",
          direction_text_et: sector.name,
          arrival_type_et: "mandritevaheline",
          description_et:
            "Mandritevaheline ränne — vaagundliigid Kesk-Aasia steppidest ja Kaspia mere piirkonnast.",
          example_species_et: [
            "roosa-kuldnokk",
            "stepi-loorkull",
            "kõrbe-kivitäks",
            "väiketrapp",
          ],
        };
      } else if (sector.abbr === "S" || sector.abbr === "SW") {
        corridor = {
          id: "black_sea_pannonian",
          name_et: "Musta mere ja Panooniase tasandiku",
          direction_text_et: sector.name,
          arrival_type_et: "mandritevaheline",
          description_et:
            "Mandritevaheline ränne — vaagundliigid Lõuna-Euroopa ja Musta mere piirkonna pesitsusaladelt.",
          example_species_et: [
            "siidhaigur",
            "must-harksaba",
            "tõmmuiibis",
            "kalda-pääsuke",
          ],
        };
      } else if (sector.abbr === "W" || sector.abbr === "NW") {
        corridor = {
          id: "north_atlantic",
          name_et: "Skandinaavia ja Lääne-Euroopa",
          direction_text_et: sector.name,
          arrival_type_et: "regionaalne",
          description_et:
            "Regionaalsed liikumised — lähedaste pesitsuspopulatsioonidega liigid Skandinaaviast, Põhjamerelt ja Lääne-Euroopast. Mitte mandritevaheline vaagumine.",
          example_species_et: [
            "naerutiir",
            "kaspia tiir",
            "väikealk",
            "mustsaba-vigle",
          ],
        };
      }
      // N and NE sectors: no corridor flagged (arctic)

      if (corridor) {
        corridor.direction_deg = Math.round(avgDir);
        corridor.direction_abbr = sector.abbr;
        corridor.avg_wind_speed_kmh = Math.round(avgSpeed);
        corridor.strength = avgSpeed >= STRONG_TRANSPORT_KMH
          ? "strong"
          : "moderate";
        active_corridors.push(corridor);
      }
    }

    return {
      fetched_at: new Date().toISOString(),
      source: "open-meteo",
      location: { lat: LAT, lon: LON, name: "Estonia centroid" },
      horizon: "-" + PAST_DAYS + "d past + +" + FORECAST_DAYS + "d forecast",
      summary: {
        avg_wind_speed_kmh: Math.round(avgSpeed),
        avg_wind_dir_deg: Math.round(avgDir),
        avg_pressure_hpa: Math.round(avgPressure),
        max_pressure_hpa: Math.round(maxPressure),
        is_high_pressure: avgPressure >= HIGH_PRESSURE_HPA,
      },
      active_corridors,
    };
  } catch (e) {
    return {
      fetched_at: new Date().toISOString(),
      source: "open-meteo",
      location: { lat: LAT, lon: LON, name: "Estonia centroid" },
      horizon: "-" + PAST_DAYS + "d past + +" + FORECAST_DAYS + "d forecast",
      error: errMsg(e),
      summary: null,
      active_corridors: [],
    };
  }
}

// ---------------------------------------------------------------------------
// node "Fetch + Compute" -- 03-fetch-compute.js, ported line by line.
//
// Parallel-fetch eBird notable per region + species_meta from Supabase Storage.
// Filter to species rare/super/mega in Estonia. Group by species. Fetch
// historical season signals from elurikkus_observations via Edge Function.
// Compute probability per v3 formula (smooth distance, soft count cap, season
// signal, adjacency bonus). Top-30. Build Sonnet payload.
// ---------------------------------------------------------------------------

// ---- Distance helper (haversine to Türi anchor 58.81 N, 25.43 E) ----
const TURI = { lat: 58.81, lng: 25.43 };
function haversineKm(
  la1: number,
  lo1: number,
  la2: number,
  lo2: number,
): number {
  const R = 6371;
  const dLa = (la2 - la1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) *
      Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Initial great-circle bearing Türi -> obs, degrees clockwise from north.
function initialBearingDeg(
  la1: number,
  lo1: number,
  la2: number,
  lo2: number,
): number {
  const p1 = la1 * Math.PI / 180;
  const p2 = la2 * Math.PI / 180;
  const dl = (lo2 - lo1) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// ---- Probability formula v2 ----
// score = tier_base
//       + 25 * count_signal       (Hill curve, half-sat at N=15, no ceiling)
//       + 25 * distance_signal    (exp decay, lambda=350km, never zero)
//       + 25 * season_signal      (from elurikkus historical, 0.5 fallback)
//       + adjacency_bonus         (best neighbor country: LV/FI=10, LT=8, SE=7, PL=5, RU=4, BY=3)
//       +  7 * corridor_factor    (wind corridor match, 0 or 1)
// Clamped to [5, 95], rounded.
const TIER_BASE: Record<string, number> = { rare: 18, super: 12, mega: 6 };
const COUNT_K = 15;
const COUNT_EXP = 1.5;
const COUNT_WEIGHT = 25;
const DISTANCE_LAMBDA_KM = 350;
const DISTANCE_WEIGHT = 25;
const SEASON_WEIGHT = 25;
const COUNTRY_WEIGHT: Record<string, number> = {
  LV: 10,
  FI: 10,
  LT: 8,
  SE: 7,
  PL: 5,
  RU: 4,
  BY: 3,
  EE: 10,
};
const ADJACENCY_DEFAULT = 2;
const CORRIDOR_WEIGHT = 7;
const PROB_FLOOR = 5;
const PROB_CEIL = 95;
const TOP_N = 30;
// ---- P4.1 selection sanity ----
// A closed window still scored: a `passed` row carried 15%. The band was
// computed after the probability and never fed back into it.
const TIMING_CAP = 0.25;
// Source direction vs the species' own arrival_bearing. A multiplier, not a
// filter: a species whose expected arrival direction really is westerly
// survives it, and the taper can be retuned or backed out from the
// calibration CSV.
const SOURCE_DIR_OK_DEG = 60; // <= this: no penalty
const SOURCE_DIR_BAD_DEG = 120; // >= this: full penalty
const SOURCE_DIR_FLOOR = 0.3;
// FORMULA_VERSION now comes from V4.FORMULA_VERSION (./score.ts).
// v8.3 season gate: the additive SEASON_WEIGHT term alone left a ~50-60% floor
// even at season=0, so out-of-window species scored high. This multiplicative
// gate suppresses near-closed windows; in-window species (season >= threshold)
// are untouched (gate = 1).
const SEASON_GATE_THRESHOLD = 0.4;
const SEASON_GATE_FLOOR = 0.4;

function countSignal(n: number): number {
  if (!n || n <= 0) return 0;
  const nk = Math.pow(n, COUNT_EXP);
  const Kk = Math.pow(COUNT_K, COUNT_EXP);
  return nk / (nk + Kk);
}

function distanceSignal(km: number): number {
  if (km == null || isNaN(km)) return 0;
  return Math.exp(-km / DISTANCE_LAMBDA_KM);
}

function adjacencyBonus(breakdown: NeighborBreakdown[]): number {
  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    return ADJACENCY_DEFAULT;
  }
  let max = ADJACENCY_DEFAULT;
  for (const b of breakdown) {
    const cc = b && b.country_code;
    if (cc && COUNTRY_WEIGHT[cc] != null && COUNTRY_WEIGHT[cc] > max) {
      max = COUNTRY_WEIGHT[cc];
    }
  }
  return max;
}

const tierRank: Record<string, number> = { mega: 3, super: 2, rare: 1 };

async function fetchCompute(
  config: RunConfig,
  weather: WeatherCorridorsResult | null,
): Promise<FetchComputeResult> {
  // Fail fast, before any relay call and before Sonnet is paid for: without the
  // relay secret every eBird pull would 401 and the run would produce an empty
  // report at full model cost.
  if (!Deno.env.get("EBIRD_RELAY_SECRET")) {
    throw new Error("missing_env:EBIRD_RELAY_SECRET");
  }

  // Read active corridor IDs from Weather Corridors (runs before Fetch + Compute).
  let activeCorridorIds = new Set<string>();
  const weatherCorridorsData = weather ?? null;
  if (
    weatherCorridorsData && Array.isArray(weatherCorridorsData.active_corridors)
  ) {
    activeCorridorIds = new Set(
      weatherCorridorsData.active_corridors.map((c) => c.id),
    );
  }

  // n8n's httpRequest throws on non-2xx -- it wrapped each in .catch() to
  // swallow per-region failures (sparse coverage in BY/RU is expected to
  // occasionally 4xx).
  const speciesMetaPromise = fetchJson(
    SPECIES_META_URL,
    { method: "GET" },
    META_TIMEOUT_MS,
  ).catch(() => null);

  const corridorTagsPromise = fetchJson(
    CORRIDOR_TAGS_URL,
    { method: "GET" },
    META_TIMEOUT_MS,
  ).catch(() => null);

  const eePresencePromise = fetchJson(
    EE_PRESENCE_URL,
    { method: "GET" },
    META_TIMEOUT_MS,
  ).catch(() => null);

  const ebird_errors: Array<{ region: string; error: string }> = [];
  const ebirdPromises = config.regions.map((region) =>
    ebirdGet(`/data/obs/${region}/recent/notable?back=30&detail=full`)
      .then((arr) =>
        Array.isArray(arr)
          ? arr.map((o) => ({ ...(o as EbirdObs), _region: region }))
          : []
      )
      .catch((err) => {
        const message = errMsg(err);
        console.error(`eBird fetch failed for ${region}: ${message}`);
        ebird_errors.push({ region, error: message.slice(0, 200) });
        return [] as EbirdObs[];
      })
  );

  const [speciesMetaRaw, corridorTagsRaw, eePresenceRaw, ...allObsArrays] =
    await Promise.all([
      speciesMetaPromise,
      corridorTagsPromise,
      eePresencePromise,
      ...ebirdPromises,
    ]) as [unknown, unknown, unknown, ...EbirdObs[][]];
  const allObs = allObsArrays.flat();

  // ---- v4 inputs: phenology + upstream follow-through (service role) ----
  const sbRead = adminClient();
  const phenologyRows = await readAll<PhenologyRow>(
    sbRead,
    "species_phenology",
    "scientific_name,ebird_code,arrival_modes,spring_window,autumn_window," +
      "arrival_bearing_spring,arrival_bearing_autumn," +
      "watch_arc_spring_from,watch_arc_spring_to," +
      "watch_arc_autumn_from,watch_arc_autumn_to," +
      "source_regions_spring,source_regions_autumn,flight_class",
  );
  // A silent 0 would gate every species to 0.5 and score exactly like v3 --
  // indistinguishable from success in the output. Fail loud instead.
  if (phenologyRows.length < 150) {
    throw new Error(
      "phenology_load_failed: expected >= 150 species_phenology rows, got " +
        phenologyRows.length,
    );
  }
  const upstreamRows = await readAll<UpstreamRow>(
    sbRead,
    "rarity_upstream_stats",
    "species_lat,from_country,foreign_days,p_ee_30d",
  );
  if (upstreamRows.length === 0) {
    // Valid degraded state (upstream term falls to 0), but never silent.
    console.warn("rarity_upstream_stats returned 0 rows; upstream term = 0");
  }
  const phenByLat = new Map<string, PhenologyRow>();
  for (const p of phenologyRows) {
    phenByLat.set(String(p.scientific_name || "").trim().toLowerCase(), p);
  }

  // APPROVED DEVIATION (M7.4c, carried into M7.5): n8n swallowed every region
  // failure into [] and would have gone on to pay for a Sonnet call that wrote
  // an empty raport. If ALL regions failed the cause is systemic -- relay down,
  // secret rotated, eBird 418 -- so fail the run here instead of publishing an
  // empty report. A partial failure still proceeds, exactly as n8n did.
  if (ebird_errors.length === config.regions.length) {
    throw new Error(
      "ebird_all_regions_failed: " + JSON.stringify(ebird_errors).slice(0, 500),
    );
  }

  // ---- v8.9: Estonian-presence cross-reference ----
  // get-ee-species-presence returns { ebird_ee_present: [sciName...],
  //   elurikkus_counts: { sciName: { count, last_date, last_location } } }.
  // Exclude candidates already confirmed in the eBird EE overview
  // (vaatluste_raport); annotate the rest with their elurikkus EE count. Keyed
  // by scientific name (lc).
  //
  // NOTE (see file header): elurikkus_counts values are actually plain numbers,
  // so the annotation below is inert and ee_obs_count / ee_last_date /
  // ee_last_location are always 0 / null / null -- as in live n8n. Kept verbatim.
  const eePresentSet = new Set<string>();
  const eeCountMap = new Map<string, Record<string, unknown>>();
  if (eePresenceRaw && typeof eePresenceRaw === "object") {
    const raw = eePresenceRaw as Record<string, unknown>;
    const present = Array.isArray(raw.ebird_ee_present)
      ? raw.ebird_ee_present as unknown[]
      : [];
    for (const nm of present) {
      if (nm && typeof nm === "string") {
        eePresentSet.add(nm.trim().toLowerCase());
      }
    }
    const counts =
      (raw.elurikkus_counts && typeof raw.elurikkus_counts === "object")
        ? raw.elurikkus_counts as Record<string, unknown>
        : {};
    for (const k of Object.keys(counts)) {
      if (k) {
        eeCountMap.set(
          k.trim().toLowerCase(),
          (counts[k] || {}) as Record<string, unknown>,
        );
      }
    }
  }

  // ---- Normalize species meta ----
  let speciesList: SpeciesMeta[] = [];
  if (Array.isArray(speciesMetaRaw)) {
    speciesList = speciesMetaRaw as SpeciesMeta[];
  } else if (
    speciesMetaRaw &&
    (speciesMetaRaw as Record<string, unknown>).items &&
    typeof (speciesMetaRaw as Record<string, unknown>).items === "object"
  ) {
    speciesList = Object.entries(
      (speciesMetaRaw as { items: Record<string, SpeciesMeta> }).items,
    ).map(([k, v]) => ({ name: k, ...v }));
  } else if (speciesMetaRaw && typeof speciesMetaRaw === "object") {
    speciesList = Object.entries(speciesMetaRaw as Record<string, SpeciesMeta>)
      .map(([k, v]) => ({ name: k, ...v }));
  }

  // ---- v8.7: inject expected_corridors from the corridor_species_tags table ----
  // These tags were moved OUT of species_meta_v1.json: that file is a shared
  // store rewritten by other consumers (map/Saabujad/avatars/client
  // SPECIES_META_DEFAULTS) which strip unknown fields, wiping the tags. They now
  // live in their own table, served via get-corridor-tags, and are joined onto
  // speciesList here by scientificName BEFORE metaByEbirdCode / candidate
  // scoring / the watchlist read expected_corridors.
  const corridorTagsObj = corridorTagsRaw as
    | { tags?: Record<string, unknown> }
    | null;
  const corridorTagMap =
    corridorTagsObj && typeof corridorTagsObj === "object" &&
      corridorTagsObj.tags && typeof corridorTagsObj.tags === "object"
      ? corridorTagsObj.tags
      : {};
  for (const sp of speciesList) {
    if (
      sp && sp.scientificName &&
      Array.isArray(corridorTagMap[sp.scientificName])
    ) {
      sp.expected_corridors = corridorTagMap[sp.scientificName] as string[];
    }
  }

  const metaByEbirdCode = new Map<string, SpeciesMeta>();
  for (const sp of speciesList) {
    // v8.4: skip species flagged predictionExclude in species_meta
    // (EE breeders, Category-E escapes, non-rarities). Other consumers of
    // species_meta (map, Saabujad, avatars) ignore this flag.
    if (
      sp && sp.ebirdCode &&
      ["rare", "super", "mega"].includes(sp.rarityLevel as string) &&
      !sp.predictionExclude
    ) {
      metaByEbirdCode.set(sp.ebirdCode, sp);
    }
  }

  // ---- Filter to rare-in-EE species ----
  const rareObs = allObs.filter((o) =>
    o && o.speciesCode && metaByEbirdCode.has(o.speciesCode)
  );

  // ---- Group by species ----
  const bySpecies = new Map<string, EbirdObs[]>();
  for (const o of rareObs) {
    const code = o.speciesCode as string;
    if (!bySpecies.has(code)) bySpecies.set(code, []);
    (bySpecies.get(code) as EbirdObs[]).push(o);
  }

  // ---- Fetch season signals for candidate species ----
  // Calls get-toenaosus-season-signals Edge Function. Graceful fallback: if the
  // function isn't deployed yet or call fails, every species uses 0.5 (neutral)
  // and the workflow still completes. seasonDiag captured for source_data debug.
  const candidateEstonianNames = Array.from(bySpecies.keys())
    .map((code) => {
      const m = metaByEbirdCode.get(code);
      return m && m.name ? m.name : null;
    })
    .filter(Boolean) as string[];

  const seasonSignalMap = new Map<string, number>();
  const seasonDiag: SeasonDiag = {
    attempted: candidateEstonianNames.length,
    fetched: 0,
    with_signal: 0,
    with_fallback: 0,
    error: null,
    elapsed_ms: null,
  };

  if (candidateEstonianNames.length > 0) {
    const __t0 = Date.now();
    try {
      const seasonResp = await fetchJson(
        SEASON_SIGNALS_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ species_names: candidateEstonianNames }),
        },
        SEASON_TIMEOUT_MS,
      ) as { results?: Array<Record<string, unknown>> };
      seasonDiag.elapsed_ms = Date.now() - __t0;
      if (seasonResp && Array.isArray(seasonResp.results)) {
        seasonDiag.fetched = seasonResp.results.length;
        for (const r of seasonResp.results) {
          if (r && r.species_name && r.season_signal != null) {
            seasonSignalMap.set(
              r.species_name as string,
              Number(r.season_signal),
            );
          }
        }
      }
    } catch (err) {
      // on abort this is ≈ SEASON_TIMEOUT_MS, not callee latency
      seasonDiag.elapsed_ms = Date.now() - __t0;
      seasonDiag.error = errMsg(err).slice(0, 200) || "unknown";
    }
  }

  const candidates: Candidate[] = [];
  for (const [ebirdCode, obsList] of bySpecies) {
    const meta = metaByEbirdCode.get(ebirdCode) as SpeciesMeta;

    // Nearest obs to Türi
    let nearest: EbirdObs | null = null, nearestKm = Infinity;
    for (const o of obsList) {
      if (typeof o.lat !== "number" || typeof o.lng !== "number") continue;
      const km = haversineKm(TURI.lat, TURI.lng, o.lat, o.lng);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = o;
      }
    }
    if (!nearest) continue;

    // Aggregate across all obs of this species
    const totalCount = obsList.reduce(
      (s, o) => s + (Number(o.howMany) || 1),
      0,
    );

    const breakdown = new Map<string, NeighborBreakdown>();
    for (const o of obsList) {
      const c = o._region as string;
      if (!breakdown.has(c)) {
        breakdown.set(c, { country_code: c, obs_count: 0, last_date: "" });
      }
      const b = breakdown.get(c) as NeighborBreakdown;
      b.obs_count += 1;
      if (!b.last_date || (o.obsDt && o.obsDt > b.last_date)) {
        b.last_date = o.obsDt || "";
      }
    }
    const neighbor_breakdown = Array.from(breakdown.values())
      .sort((a, b) => b.obs_count - a.obs_count);

    const expected_corridors = Array.isArray(meta.expected_corridors)
      ? meta.expected_corridors
      : [];
    const corridor_match = expected_corridors.some((id) =>
      activeCorridorIds.has(id)
    );
    const corridor_factor = corridor_match ? 1 : 0;

    // v2 factor computation
    const tier_base = TIER_BASE[meta.rarityLevel as string] || TIER_BASE.super;
    const cs = countSignal(totalCount);
    const ds = distanceSignal(nearestKm);

    let ss: number;
    if (seasonSignalMap.has(meta.name as string)) {
      ss = seasonSignalMap.get(meta.name as string) as number;
      seasonDiag.with_signal += 1;
    } else {
      ss = 0.5;
      seasonDiag.with_fallback += 1;
    }

    const ad_bonus = adjacencyBonus(neighbor_breakdown);

    // v3 score, kept for diagnostics only -- it no longer sets probability_pct.
    const raw_v3 = tier_base +
      (COUNT_WEIGHT * cs) +
      (DISTANCE_WEIGHT * ds) +
      (SEASON_WEIGHT * ss) +
      ad_bonus +
      (CORRIDOR_WEIGHT * corridor_factor);

    // v8.3 season gate: multiplicative suppression for near-closed windows.
    const season_gate = ss >= SEASON_GATE_THRESHOLD
      ? 1
      : SEASON_GATE_FLOOR +
        (1 - SEASON_GATE_FLOOR) * (ss / SEASON_GATE_THRESHOLD);

    const __sciLc = String(meta.scientificName || nearest.sciName || "")
      .trim().toLowerCase();
    const species_lat = String(meta.scientificName || nearest.sciName || "");

    // ---- v4 score ----
    const wind = {
      from_deg: weatherCorridorsData?.summary?.avg_wind_dir_deg ?? null,
      speed_kmh: weatherCorridorsData?.summary?.avg_wind_speed_kmh ?? null,
    };
    const phen = phenByLat.get(__sciLc) ?? null;
    const f = scoreV4({
      tier_base,
      count: cs,
      distance: ds,
      season_signal: ss,
      today: new Date(),
      species_lat,
      phen,
      wind,
      regions: neighbor_breakdown.map((b) => b.country_code),
      upstream: upstreamRows,
    });
    const probability_pct = f.pct;
    if (probability_pct < PROB_FLOOR) continue;

    // v8.9 dropped EE-present species outright; v4 keeps them and badges them.
    const __eeC = (__sciLc && eeCountMap.get(__sciLc)) || null;

    // Two freshest neighbour observations with coordinates.
    const upstream_obs: UpstreamObs[] = obsList
      .filter((o) => typeof o.lat === "number" && typeof o.lng === "number")
      .slice()
      .sort((a, b) => String(b.obsDt || "").localeCompare(String(a.obsDt || "")))
      .slice(0, 2)
      .map((o) => ({
        country_code: o._region as string,
        location: o.locName ?? "",
        date: o.obsDt || "",
        count: Number(o.howMany) || 1,
        distance_km: Math.round(
          haversineKm(TURI.lat, TURI.lng, o.lat as number, o.lng as number),
        ),
        bearing_from_ee: Math.round(
          initialBearingDeg(TURI.lat, TURI.lng, o.lat as number, o.lng as number),
        ),
        // P5a: unrounded, unlike distance_km/bearing_from_ee above -- these
        // feed haversine/bearing maths in etaFor, not a display string.
        lat: o.lat as number,
        lon: o.lng as number,
      }));

    candidates.push({
      ebird_code: ebirdCode,
      name_et: (meta.name || meta.estonianName || nearest.comName) as string,
      name_lat: (meta.scientificName || nearest.sciName) as string,
      rarity_level: meta.rarityLevel as string,
      ee_obs_count: (__eeC && typeof __eeC.count === "number")
        ? __eeC.count
        : 0,
      ee_last_date: (__eeC && __eeC.last_date as string) || null,
      ee_last_location: (__eeC && __eeC.last_location as string) || null,
      expected_corridors,
      corridor_match,
      avatar_url: meta.avatarUrl || null,
      probability_pct,
      nearest_obs: {
        country_code: nearest._region as string,
        location: nearest.locName || "",
        lat: nearest.lat,
        lng: nearest.lng,
        date: nearest.obsDt || "",
        count: Number(nearest.howMany) || 1,
        sub_id: nearest.subId || null,
        observers: nearest.userDisplayName ? [nearest.userDisplayName] : [],
      },
      distance_to_ee_km: Math.round(nearestKm),
      total_neighbor_obs_30d: totalCount,
      neighbor_breakdown,
      ee_present: !!(__sciLc && eePresentSet.has(__sciLc)),
      upstream_obs,
      predicted_sites: [], // filled after the watch-list, from one RPC call
      probability_factors: {
        tier_base,
        count_factor: Math.round(cs * 1000) / 1000,
        distance_factor: Math.round(ds * 1000) / 1000,
        season_factor: Math.round(ss * 1000) / 1000,
        corridor_factor,
        adjacency_bonus: ad_bonus,
        raw_score: Math.round(raw_v3 * 100) / 100,
        season_gate: Math.round(season_gate * 1000) / 1000,
        phenology_gate: f.phenology_gate,
        direction_fit: f.direction_fit,
        source_fit: f.source_fit,
        upstream: f.upstream,
        season: f.season,
        phenology_source: f.phenology_source,
        calibrated_score: f.calibrated_score,
        formula_version: V4.FORMULA_VERSION,
      },
    });
  }

  // ---- v8.8: arrival-timing band (deterministic, per candidate) ----
  // Honest, qualitative timing window from nearest-sighting freshness + distance
  // (+ active corridor), gated by season. NOT a precise date -- a band the card
  // shows.
  //
  // v14 / P4.1: this block moved ABOVE the sort+slice and now iterates
  // `candidates`, not `top`. The band feeds the timing cap below, and a cap on
  // probability_pct has to land before every read of it -- ranking (the sort)
  // and selection (slice TOP_N) included. Capping after the slice left the
  // report ordered by uncapped values and let a capped 3% row hold a TOP_N slot
  // against an uncapped 14% one. The loop only ever read per-candidate fields
  // plus its own two locals, so widening it from `top` to `candidates` changes
  // nothing but the row count.
  const __nowMs = Date.now();
  const __parseObsMs = (d: string | undefined): number => {
    if (!d || typeof d !== "string") return NaN;
    let t = Date.parse(d.replace(" ", "T"));
    if (isNaN(t)) t = Date.parse(d);
    return t;
  };
  for (const c of candidates) {
    let freshestMs = __parseObsMs(c.nearest_obs && c.nearest_obs.date);
    if (Array.isArray(c.neighbor_breakdown)) {
      for (const nb of c.neighbor_breakdown) {
        const m = __parseObsMs(nb && nb.last_date);
        if (!isNaN(m) && (isNaN(freshestMs) || m > freshestMs)) freshestMs = m;
      }
    }
    const freshDays = isNaN(freshestMs)
      ? 999
      : Math.max(0, (__nowMs - freshestMs) / 86400000);
    const nearestKm = typeof c.distance_to_ee_km === "number"
      ? c.distance_to_ee_km
      : 9999;
    const gate =
      (c.probability_factors &&
          typeof c.probability_factors.phenology_gate === "number")
        ? c.probability_factors.phenology_gate
        : 1;
    const corridorMatch = !!c.corridor_match;
    let band: string, label: string;
    if (gate < 0.6) {
      band = "out_of_window";
      label = "Väljaspool tüüpilist saabumisakent";
    } else if (freshDays > 21) {
      band = "passed";
      label = "Aken tõenäoliselt möödas";
    } else if (
      (freshDays <= 5 && nearestKm <= 350) ||
      (corridorMatch && freshDays <= 5 && nearestKm <= 500)
    ) {
      band = "imminent";
      label = "Lähipäevil (järgmise ~5 päeva jooksul)";
    } else if (freshDays <= 10 && nearestKm <= 600) {
      band = "this_week";
      label = "Selle nädala jooksul";
    } else {
      band = "in_season";
      label = "Hooaja jooksul võimalik";
    }
    c.timing_band = band;
    c.arrival_window_et = label;
    c.freshest_obs_days = isNaN(freshestMs) ? null : Math.round(freshDays);

    // ---- P4.1a: timing cap ----
    // A closed window must not carry a live probability. Runs after the band is
    // decided and before anything reads probability_pct.
    const timing_cap = (band === "passed" || band === "out_of_window")
      ? TIMING_CAP
      : 1;

    // ---- P4.1b: source-direction gate ----
    // An autumn arrival into Estonia does not come from SW Sweden -- but "from
    // Sweden" is not itself the error. Key on the species' OWN arrival_bearing,
    // so a genuinely westerly arrival direction passes. Inline on purpose: the
    // same season->column pick exists at the watch-list and in sitesFor, and
    // de-duplicating all three is a separate cleanup.
    //
    // bearing_from_ee is already the Türi->observation bearing (rule 17), i.e.
    // "the direction from Estonia to where the bird is" -- the same frame as
    // arrival_bearing. Not recomputed, and not a bearing from a predicted site.
    const __phen = phenByLat.get(
      String(c.name_lat || "").trim().toLowerCase(),
    ) ?? null;
    const __season = c.probability_factors.season;
    const arrival_bearing = __season === "spring"
      ? __phen?.arrival_bearing_spring ?? null
      : __season === "autumn"
      ? __phen?.arrival_bearing_autumn ?? null
      : null;
    const __up0 = Array.isArray(c.upstream_obs) ? c.upstream_obs[0] : undefined;
    const __upBearing = (__up0 && typeof __up0.bearing_from_ee === "number")
      ? __up0.bearing_from_ee
      : null;

    // Never penalise a species for missing data: no upstream obs or no bearing
    // on the phenology row leaves the multiplier at 1 and both keys null, which
    // is distinguishable in the CSV from an evaluated 1.0.
    let source_direction: number | null = null;
    let source_bearing_delta: number | null = null;
    if (arrival_bearing !== null && __upBearing !== null) {
      // Smallest angular difference, 360-wrapped -- never a raw subtraction.
      const __raw = Math.abs(__upBearing - arrival_bearing) % 360;
      const __delta = __raw > 180 ? 360 - __raw : __raw;
      source_bearing_delta = Math.round(__delta);
      // <=60 deg: 1.0. 60..120: linear taper. >=120: SOURCE_DIR_FLOOR.
      const __mult = __delta <= SOURCE_DIR_OK_DEG
        ? 1
        : __delta >= SOURCE_DIR_BAD_DEG
        ? SOURCE_DIR_FLOOR
        : 1 -
          ((__delta - SOURCE_DIR_OK_DEG) /
                (SOURCE_DIR_BAD_DEG - SOURCE_DIR_OK_DEG)) *
            (1 - SOURCE_DIR_FLOOR);
      source_direction = Math.round(__mult * 1000) / 1000;
    }

    // One rounding for both multipliers, matching scoreV4's Math.round on pct.
    // PROB_FLOOR is deliberately NOT re-applied: it is a pre-scoring noise
    // filter on the raw v4 output, the map already hides passed/out_of_window
    // rows, and P7b needs these rows to exist so outcomes can be scored
    // against them. A capped row below 5% is the intended result, not a leak.
    c.probability_pct = Math.round(
      c.probability_pct * timing_cap * (source_direction ?? 1),
    );

    c.probability_factors.timing_cap = timing_cap;
    c.probability_factors.source_direction = source_direction;
    c.probability_factors.source_bearing_delta = source_bearing_delta;
    c.probability_factors.arrival_bearing = arrival_bearing;
  }

  // ---- Sort + slice ----
  // Runs AFTER the band loop (P4.1): both multipliers are already in
  // probability_pct, so ranking and selection see the capped values.
  candidates.sort((a, b) => {
    if (b.probability_pct !== a.probability_pct) {
      return b.probability_pct - a.probability_pct;
    }
    return (tierRank[b.rarity_level] || 0) - (tierRank[a.rarity_level] || 0);
  });
  const top = candidates.slice(0, TOP_N);

  // ---- Corridor watchlist (v8.5) ----
  // "Conditions favourable" intel: rare/super/mega species whose
  // expected_corridors matches an ACTIVE synoptic corridor but which produced NO
  // neighbor observations (not in the candidate pool). Surfaces
  // southern/eastern overshoot megas the neighbor query structurally misses
  // (kääpakotkas, raisakotkas, ...) when winds favour them.
  const corridorNameById = new Map<string, string>(
    (weatherCorridorsData &&
        Array.isArray(weatherCorridorsData.active_corridors)
      ? weatherCorridorsData.active_corridors
      : [])
      .map((c) => [c.id, c.name_et || c.id] as [string, string]),
  );
  const candidateCodes = new Set(candidates.map((c) => c.ebird_code));
  const corridor_watchlist: WatchlistItem[] = [];
  {
    const wlWind = {
      from_deg: weatherCorridorsData?.summary?.avg_wind_dir_deg ?? null,
      speed_kmh: weatherCorridorsData?.summary?.avg_wind_speed_kmh ?? null,
    };
    const wlToday = new Date();
    for (const sp of speciesList) {
      if (!sp || !sp.ebirdCode) continue;
      if (!["rare", "super", "mega"].includes(sp.rarityLevel as string)) {
        continue;
      }
      if (sp.predictionExclude) continue;
      const spLc = String(sp.scientificName || "").trim().toLowerCase();
      if (eePresentSet.has(spLc)) continue; // v8.9: already in EE
      if (candidateCodes.has(sp.ebirdCode)) continue; // already shown with a probability

      // v4: phenology + wind decide the watch-list, not corridor tags.
      const phen = phenByLat.get(spLc);
      if (!phen) continue;
      const season = seasonFor(wlToday, phen);
      const g = phenologyGate(season, phen);
      // P4 D2: primary-mode only, and a measurably favourable wind.
      if (g.gate !== 1) continue;
      const bearing = season === "spring"
        ? phen.arrival_bearing_spring
        : season === "autumn"
        ? phen.arrival_bearing_autumn
        : null;
      // A null bearing scores a neutral 0.5, which would pass on phenology
      // alone -- require a real bearing, not just a passing number.
      if (bearing === null || bearing === undefined) continue;
      const dfit = directionFit(wlWind, bearing);
      if (dfit < 0.7) continue;
      if (
        wlWind.speed_kmh === null || wlWind.speed_kmh < V4.MIN_TRANSPORT_KMH
      ) {
        continue;
      }

      const ec = Array.isArray(sp.expected_corridors)
        ? sp.expected_corridors
        : [];
      const matched = ec.filter((id) => activeCorridorIds.has(id));
      corridor_watchlist.push({
        ebird_code: sp.ebirdCode,
        species_et: sp.name || sp.estonianName || null,
        species_lat: sp.scientificName || null,
        rarity_level: sp.rarityLevel as string,
        avatar_url: sp.avatarUrl || null,
        matched_corridors: matched,
        matched_corridor_names_et: matched.map((id) =>
          corridorNameById.get(id) || id
        ),
        arrival_bearing: bearing ?? null,
        phenology_mode: g.mode,
        direction_fit: dfit,
        phenology_gate: g.gate,
        predicted_sites: [], // filled below, from one RPC call
      });
    }
    corridor_watchlist.sort((a, b) => {
      const t = (tierRank[b.rarity_level] || 0) - (tierRank[a.rarity_level] || 0);
      return t !== 0 ? t : b.direction_fit - a.direction_fit;
    });
    corridor_watchlist.length = Math.min(corridor_watchlist.length, 5);
  }

  // ---- P6b: predicted arrival sites (deterministic, never reaches Sonnet) ----
  // ONE RPC for every species on the report. A failure here degrades sites to
  // the anchor fallback; it must never fail the run.
  const nowForSites = new Date();
  const siteNames = Array.from(
    new Set(
      [
        ...top.map((c) => c.name_et),
        ...corridor_watchlist.map((w) => w.species_et),
      ].filter((n): n is string => !!n),
    ),
  );
  const cellsBySpecies = new Map<string, SiteCell[]>();
  let predictedSiteCells = 0;
  if (siteNames.length > 0) {
    const { data: cellRows, error: cellErr } = await sbRead.rpc(
      "ennustus_predicted_site_cells",
      {
        p_species: siteNames,
        p_months: seasonMonths(nowForSites),
        p_since: "2010-01-01",
        p_per_species: 8,
      },
    );
    if (cellErr) {
      console.warn(
        "ennustus_predicted_site_cells failed; falling back to anchors:",
        cellErr.message,
      );
    } else {
      const rows = (cellRows ?? []) as SiteCell[];
      predictedSiteCells = rows.length;
      for (const r of rows) {
        const k = String(r.species_name ?? "");
        if (!k) continue;
        const bucket = cellsBySpecies.get(k);
        if (bucket) bucket.push(r);
        else cellsBySpecies.set(k, [r]);
      }
    }
  }

  const sitesFor = (
    nameEt: string | null,
    nameLat: string | null,
  ): PredictedSite[] => {
    const phen = phenByLat.get(String(nameLat || "").trim().toLowerCase()) ??
      null;
    const season = seasonFor(nowForSites, phen);
    const bearingFrom = season === "spring"
      ? phen?.arrival_bearing_spring ?? null
      : season === "autumn"
      ? phen?.arrival_bearing_autumn ?? null
      : null;
    // P6d watch arc -- WHERE the bird is seen, distinct from arrival_bearing_*
    // (where it comes FROM), which P4.1's source-direction gate still reads.
    // Null => no arc curated => predictedSitesFor behaves as it did before P6d.
    const arcFrom = season === "spring"
      ? phen?.watch_arc_spring_from ?? null
      : season === "autumn"
      ? phen?.watch_arc_autumn_from ?? null
      : null;
    const arcTo = season === "spring"
      ? phen?.watch_arc_spring_to ?? null
      : season === "autumn"
      ? phen?.watch_arc_autumn_to ?? null
      : null;
    return predictedSitesFor(
      cellsBySpecies.get(String(nameEt ?? "")) ?? [],
      { bearingFrom, flightClass: phen?.flight_class ?? null, arcFrom, arcTo },
      nowForSites,
    );
  };

  // P5: same phenology row sitesFor already looks up, read once more for the
  // ETA airspeed. Null is a valid answer -- etaFor falls back to 50 km/h.
  const flightClassFor = (nameLat: string | null): string | null =>
    phenByLat.get(String(nameLat || "").trim().toLowerCase())?.flight_class ??
      null;

  for (const c of top) {
    c.predicted_sites = sitesFor(c.name_et, c.name_lat);
    c.flight_class = flightClassFor(c.name_lat);
  }
  for (const w of corridor_watchlist) {
    w.predicted_sites = sitesFor(w.species_et, w.species_lat);
  }

  // ---- Build enriched rare_observations array (unchanged from v6) ----
  const rare_observations: RareObservation[] = [];
  for (const o of rareObs) {
    if (!o || !o.subId || !o.speciesCode || !o.obsDt) continue;
    const meta = metaByEbirdCode.get(o.speciesCode) || {} as SpeciesMeta;
    let distKm: number | null = null;
    if (typeof o.lat === "number" && typeof o.lng === "number") {
      distKm = Math.round(haversineKm(TURI.lat, TURI.lng, o.lat, o.lng));
    }
    rare_observations.push({
      ebird_sub_id: o.subId,
      species_code: o.speciesCode,
      species_lat_name: meta.scientificName || o.sciName || null,
      species_et_name: meta.name || meta.estonianName || null,
      rarity_level: meta.rarityLevel || null,
      country_code: o._region || null,
      region: o.subnational1Name || null,
      location: o.locName || null,
      lat: (typeof o.lat === "number") ? o.lat : null,
      lng: (typeof o.lng === "number") ? o.lng : null,
      distance_to_ee_km: distKm,
      obs_date: o.obsDt,
      obs_count: Number(o.howMany) || 1,
      observer_names: o.userDisplayName ? [o.userDisplayName] : [],
      raw_observation: o,
    });
  }

  // ---- Sonnet payload (unchanged shape from v6) ----
  const sonnetUserPayload = {
    season: config.season,
    period: config.period_start + " kuni " + config.period_end,
    weather: weatherCorridorsData,
    candidates: top.map(function (s) {
      return {
        ebird_code: s.ebird_code,
        name_et: s.name_et,
        name_lat: s.name_lat,
        rarity_level: s.rarity_level,
        expected_corridors: s.expected_corridors,
        corridor_match: s.corridor_match,
        probability_pct: s.probability_pct,
        nearest_obs: {
          country: s.nearest_obs.country_code,
          location: s.nearest_obs.location,
          date: s.nearest_obs.date,
          count: s.nearest_obs.count,
          distance_km: s.distance_to_ee_km,
        },
        total_neighbor_obs_30d: s.total_neighbor_obs_30d,
        neighbor_breakdown: s.neighbor_breakdown,
      };
    }),
  };

  const sonnetUserContent = USER_PREFIX +
    JSON.stringify(sonnetUserPayload, null, 2) +
    USER_SUFFIX;

  return {
    config,
    weather_corridors: weatherCorridorsData,
    candidates: top,
    corridor_watchlist,
    sonnet_user_content: sonnetUserContent,
    rare_observations,
    source_data: {
      total_obs_fetched: allObs.length,
      species_with_obs: bySpecies.size,
      candidates_after_floor: candidates.length,
      candidates_returned: top.length,
      rare_observations_count: rare_observations.length,
      species_meta_count: speciesList.length,
      species_meta_eligible: metaByEbirdCode.size,
      corridor_watchlist_count: corridor_watchlist.length,
      active_corridor_ids: Array.from(activeCorridorIds),
      season_signal_diag: seasonDiag,
      phenology_rows: phenologyRows.length,
      upstream_rows: upstreamRows.length,
      predicted_site_cells: predictedSiteCells,
      formula_version: V4.FORMULA_VERSION,
    },
    ebird_errors,
  };
}

// ---------------------------------------------------------------------------
// node "Persist Sightings"
//
// POST insert-ebird-rare-observations {observations, wind_corridor_at_time}.
// That EF short-circuits an empty observations array to
// 200 {ok:true, inserted:0, updated:0, skipped:0} without calling the RPC, so a
// zero-rare-observation run is a success. A non-2xx is recorded and the run
// continues (deviation 3 in the header).
// ---------------------------------------------------------------------------

function persistSightings(
  rareObservations: RareObservation[],
  windCorridorAtTime: WeatherCorridorsResult | null,
): Promise<unknown> {
  return postSecured(
    "insert-ebird-rare-observations",
    {
      observations: rareObservations,
      wind_corridor_at_time: windCorridorAtTime ?? null,
    },
    PERSIST_TIMEOUT_MS,
  );
}

// ---------------------------------------------------------------------------
// node "Notify Near-Estonia Rarities" -- 08-notify-near-estonia-rarities.js.
//
// Query ebird_rare_observations for SUPER or MEGA rare sightings within 300 km
// of Estonia that:
//   - were observed in the past 3 days (obs_date >= now - 3d)
//   - haven't been notified yet (notification_sent_at IS NULL)
//
// For each match: POST a rich notification to send-push-notifications, then bulk-
// mark them via mark-observations-notified.
//
// Failure of either step does NOT fail the run -- errors are collected into the
// summary and the report pipeline continues.
// ---------------------------------------------------------------------------

// Filter knobs (tune these later if signal quality is wrong)
const MAX_DISTANCE_KM = 300;
const RARITY_TIERS = ["super", "mega"];
const OBS_FRESHNESS_DAYS = 3;

const NOTIFY_SELECT =
  "id,species_et_name,species_lat_name,rarity_level,country_code,location,obs_date,obs_count,distance_to_ee_km";

interface RareObsRow {
  id: string;
  species_et_name: string | null;
  species_lat_name: string | null;
  rarity_level: string;
  country_code: string | null;
  location: string | null;
  obs_date: string;
  obs_count: number | null;
  distance_to_ee_km: number;
}

// ---- Helpers for notification text ----
function timeAgoEt(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "praegu";
  if (hours < 24) return hours + "h tagasi";
  const days = Math.floor(hours / 24);
  return days + " p tagasi";
}

function rarityEmoji(tier: string): string {
  return tier === "mega" ? "🦅" : "🐦";
}
function rarityLabel(tier: string): string {
  return tier === "mega" ? "Mega haruldus" : "Super haruldus";
}
function countLabel(n: number): string {
  return n + " " + (n === 1 ? "isend" : "isendit");
}

interface NotifySummary {
  matches_found: number;
  notifications_sent: number;
  errors: Array<Record<string, unknown>>;
}

async function notifyNearEstoniaRarities(sb: Admin): Promise<NotifySummary> {
  const cutoffIso = new Date(
    Date.now() - OBS_FRESHNESS_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const errors: Array<Record<string, unknown>> = [];

  // ---- 1. Query for matching observations ----
  // Same table, filter and order as the n8n PostgREST call; service-role client
  // instead of a literal anon JWT (deviation 4 in the header).
  const { data, error } = await sb
    .from("ebird_rare_observations")
    .select(NOTIFY_SELECT)
    .in("rarity_level", RARITY_TIERS)
    .lte("distance_to_ee_km", MAX_DISTANCE_KM)
    .gte("obs_date", cutoffIso)
    .is("notification_sent_at", null)
    .order("obs_date", { ascending: false });

  if (error) {
    // Query failure -- return a summary, don't throw.
    return {
      matches_found: 0,
      notifications_sent: 0,
      errors: [{ stage: "query", error: error.message }],
    };
  }

  const matches = (data ?? []) as unknown as RareObsRow[];
  if (!Array.isArray(matches) || matches.length === 0) {
    return { matches_found: 0, notifications_sent: 0, errors: [] };
  }

  // ---- 2. Send a push for each match ----
  const notifiedIds: string[] = [];

  for (const obs of matches) {
    const speciesName = obs.species_et_name || obs.species_lat_name ||
      "haruldane liik";
    const title = rarityEmoji(obs.rarity_level) + " " +
      rarityLabel(obs.rarity_level) + " " +
      Math.round(obs.distance_to_ee_km) + " km Eestist";
    const body = [
      speciesName,
      (obs.location || "") + (obs.country_code ? ", " + obs.country_code : ""),
      countLabel(obs.obs_count || 1),
      timeAgoEt(obs.obs_date),
    ].filter((s) => s && s.trim()).join(" · ");

    try {
      await postSecured(
        "send-push-notifications",
        {
          species: [speciesName],
          notification_title: title,
          notification_body: body,
          // M7.5 C4: n8n sent "/ulevaade/toenaosus", which is not an app route (404); the Tõenäosus subtab is local state in OverviewTab. Deep link (?section=) is a Cleanup item.
          notification_url: "/ulevaade",
          notification_tag: "rare-" + obs.id,
        },
        NOTIFY_TIMEOUT_MS,
      );
      notifiedIds.push(obs.id);
    } catch (e) {
      errors.push({
        obs_id: obs.id,
        species: speciesName,
        error: errMsg(e).slice(0, 300),
      });
    }
  }

  // ---- 3. Mark successfully-notified observations ----
  if (notifiedIds.length > 0) {
    try {
      await postSecured(
        "mark-observations-notified",
        { observation_ids: notifiedIds },
        NOTIFY_TIMEOUT_MS,
      );
    } catch (e) {
      errors.push({
        stage: "mark_notified",
        error: errMsg(e).slice(0, 300),
        obs_ids: notifiedIds,
      });
    }
  }

  return {
    matches_found: matches.length,
    notifications_sent: notifiedIds.length,
    errors,
  };
}

// Android push gate (M7.5 decision 3): dryRun-only single push down the real
// notify path, with no DB read and no mark-notified.
function notifyTestPush(species: string): Promise<unknown> {
  return postSecured(
    "send-push-notifications",
    {
      species: [species],
      notification_title: "🧪 EstBirds test",
      notification_body: "M7.5 toenaosus-orchestrator notify path",
      notification_url: "/ulevaade",
      notification_tag: "m7-5-test",
    },
    NOTIFY_TIMEOUT_MS,
  );
}

// ---------------------------------------------------------------------------
// node "Sonnet"
// ---------------------------------------------------------------------------

async function callSonnet(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<AnthropicResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("missing_env:ANTHROPIC_API_KEY");
  const model = sonnetModel();

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
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
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
// node "Parse + Merge" -- 05-parse-merge.js, verbatim, plus the approved
// max_tokens guard n8n lacked (deviation 2 in the header).
//
// Parse Sonnet response -> merge text fields into candidate objects -> build the
// final POST body for insert-toenaosus-raport.
// ---------------------------------------------------------------------------

interface SonnetEntry {
  ebird_code?: string;
  rarity_reason?: string;
  why_likely_et?: string;
  likely_arrival_sites_et?: unknown;
}

interface ParseOutput {
  period_start: string;
  period_end: string;
  season: string;
  regions: string[];
  intro_et: string;
  entries: Array<Record<string, unknown>>;
  corridor_watchlist: WatchlistItem[];
  source_data: Record<string, unknown>;
  model: string;
  generation_meta: Record<string, unknown>;
}

// P5: eta_* fields ride on each predicted_sites[] entry -- not a new top-level
// field on the entry, and not a separate array.
//
// The source point is upstream_obs[0], the FRESHEST upstream observation. It is
// deliberately NOT c.nearest_obs, which is the NEAREST one; the two diverge on
// 10 of 24 entries, and using nearest_obs here would be the single most likely
// silent bug in this change -- every ETA would still look plausible.
//
// A candidate with no usable upstream_obs[0] still gets all three fields, with
// the null-ETA result. A field is never skipped, so consumers can rely on the
// shape being uniform across every site of every entry.
function sitesWithEta(
  c: Candidate,
  winds: EtaWinds,
  now: Date,
): Array<Record<string, unknown>> {
  const src = c.upstream_obs?.[0] ?? null;
  const hasSource = !!src && typeof src.lat === "number" &&
    typeof src.lon === "number";
  return (c.predicted_sites ?? []).map((s, i) => {
    if (!hasSource) {
      const nullEta: EtaResult = {
        eta_days: null,
        eta_window_et: WIND_UNAVAILABLE_ET,
        eta_basis: null,
      };
      return { ...s, ...nullEta };
    }
    const sample = winds.byKey.get(etaWindKey(c.ebird_code, i));
    const eta = etaFor(
      {
        source: { lat: src!.lat, lon: src!.lon, date: src!.date },
        site: { lat: s.lat, lon: s.lon, label: s.label },
        flightClass: c.flight_class ?? null,
        now,
      },
      // tailwindKmh means across the samples it is given; one midpoint per
      // (source, site) pair means exactly one sample per site.
      sample ? [sample] : null,
    );
    return { ...s, ...eta };
  });
}

function parseMerge(
  claude: AnthropicResponse,
  upstream: FetchComputeResult,
  winds: EtaWinds,
): ParseOutput {
  // APPROVED ADDITION (M7.5): n8n had no max_tokens guard, so a truncated
  // response fell through to JSON.parse and surfaced as a confusing "non-JSON"
  // error. Checked BEFORE the text-block check.
  if (claude.stop_reason === "max_tokens") {
    throw new Error(
      "Sonnet stopped on max_tokens (" +
        (claude.usage?.output_tokens ?? 0) + " tokens)",
    );
  }

  // Anthropic v1/messages: response.content is an array of content blocks
  const blocks = (claude && claude.content) || [];
  const textBlock = blocks.find((b) => b && b.type === "text");
  if (!textBlock || !textBlock.text) {
    throw new Error("Sonnet returned no text block");
  }

  // Strip optional ```json fences just in case
  let raw = textBlock.text.trim();
  raw = raw.replace(/^```(json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: { intro_et?: string; entries?: SonnetEntry[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Sonnet returned non-JSON: " + raw.slice(0, 300));
  }

  const textByCode = new Map<string, SonnetEntry>();
  for (const e of (parsed.entries || [])) {
    if (e && e.ebird_code) textByCode.set(e.ebird_code, e);
  }

  // One clock for the whole merge: two sites of one entry must not land in
  // different eta_days buckets because the loop crossed a rounding boundary.
  const etaNow = new Date();

  const entries = (upstream.candidates || []).map((c) => {
    const t = textByCode.get(c.ebird_code) || {} as SonnetEntry;
    return {
      // Shared with VaatlusEntry -- existing EntryCard renders these
      species_et: c.name_et,
      species_lat: c.name_lat,
      date: c.nearest_obs.date,
      location: c.nearest_obs.location,
      region: c.nearest_obs.country_code,
      country_code: c.nearest_obs.country_code,
      observers: c.nearest_obs.observers || [],
      lat: c.nearest_obs.lat,
      lng: c.nearest_obs.lng,
      count: c.nearest_obs.count,
      is_rarity: true,
      rarity_level: c.rarity_level,
      rarity_reason: t.rarity_reason || "",
      ee_probability_pct: c.probability_pct,
      source: "ebird",
      sub_id: c.nearest_obs.sub_id,
      data_integrity: "unverified",
      // Tõenäosus-only additions
      distance_to_ee_km: c.distance_to_ee_km,
      total_neighbor_obs_30d: c.total_neighbor_obs_30d,
      neighbor_breakdown: c.neighbor_breakdown,
      why_likely_et: t.why_likely_et || "",
      likely_arrival_sites_et: Array.isArray(t.likely_arrival_sites_et)
        ? t.likely_arrival_sites_et
        : [],
      probability_factors: c.probability_factors,
      arrival_window_et: c.arrival_window_et || null,
      timing_band: c.timing_band || null,
      freshest_obs_days: (typeof c.freshest_obs_days === "number")
        ? c.freshest_obs_days
        : null,
      ee_obs_count: (typeof c.ee_obs_count === "number") ? c.ee_obs_count : 0,
      ee_last_date: c.ee_last_date || null,
      ee_last_location: c.ee_last_location || null,
      avatar_url: c.avatar_url,
      // v4 additions
      ebird_code: c.ebird_code,
      ee_present: c.ee_present,
      upstream_obs: c.upstream_obs ?? [],
      // P6b addition; P5 adds eta_days / eta_window_et / eta_basis per site.
      predicted_sites: sitesWithEta(c, winds, etaNow),
    };
  });

  return {
    period_start: upstream.config.period_start,
    period_end: upstream.config.period_end,
    season: upstream.config.season,
    regions: upstream.config.regions,
    intro_et: parsed.intro_et || "",
    entries,
    corridor_watchlist: upstream.corridor_watchlist || [],
    source_data: upstream.source_data,
    // n8n hardcoded 'claude-sonnet-4-6' here regardless of what was sent
    // (deviation 5 in the header).
    model: sonnetModel(),
    generation_meta: {
      run_id: upstream.config.run_id,
      sonnet_model: claude.model || null,
      stop_reason: claude.stop_reason || null,
      input_tokens: claude.usage?.input_tokens || null,
      output_tokens: claude.usage?.output_tokens || null,
    },
  };
}

// ---------------------------------------------------------------------------
// node "Insert -> Supabase"
// ---------------------------------------------------------------------------

interface InsertResponse {
  inserted?: boolean;
  id?: string;
}

function insertRaport(payload: ParseOutput): Promise<InsertResponse> {
  // n8n sent JSON.stringify($json) -- the whole Parse + Merge output.
  return postSecured(
    "insert-toenaosus-raport",
    payload,
    INSERT_TIMEOUT_MS,
  ) as Promise<InsertResponse>;
}

// ---------------------------------------------------------------------------
// The background run
// ---------------------------------------------------------------------------

interface RunOptions {
  dryRun: boolean;
  maxTokensOverride: number | null;
  notifyTest: { species: string } | null;
}

async function run(sb: Admin, orch: OrchRun, opts: RunOptions) {
  const timings: Record<string, number> = {};
  let calls = 0;

  try {
    // --- stage 1: node "Build Config" -------------------------------------
    await heartbeat(sb, orch, "config");
    const t0 = Date.now();
    const config = buildConfig();
    timings.config_ms = Date.now() - t0;
    orch.state = {
      ...orch.state,
      season: config.season,
      regions: config.regions,
      period_start: config.period_start,
      period_end: config.period_end,
      toenaosus_run_id: config.run_id,
      timings,
    };
    await heartbeat(sb, orch, "config_done");

    // --- stage 2: node "Weather Corridors" --------------------------------
    await heartbeat(sb, orch, "weather");
    const t1 = Date.now();
    const weather = await weatherCorridors();
    timings.weather_ms = Date.now() - t1;
    orch.state = {
      ...orch.state,
      timings,
      weather: {
        error: weather.error ?? null,
        active_corridor_ids: weather.active_corridors.map((c) => c.id),
        summary: weather.summary,
      },
    };
    await heartbeat(sb, orch, "weather_done");

    // --- stage 3: node "Fetch + Compute" ----------------------------------
    await heartbeat(sb, orch, "fetch");
    const t2 = Date.now();
    const fc = await fetchCompute(config, weather);
    timings.fetch_ms = Date.now() - t2;
    orch.state = {
      ...orch.state,
      timings,
      ebird_errors: fc.ebird_errors,
      regions_ok: config.regions.length - fc.ebird_errors.length,
      regions_total: config.regions.length,
      source_data: fc.source_data,
    };
    await heartbeat(sb, orch, "fetch_done");

    // --- stage 3b: P5 ETA winds (one Open-Meteo call, ~0.3 s) -------------
    // After fetch_done because it needs predicted_sites and upstream_obs, which
    // fetchCompute fills. Before Sonnet so a slow model cannot push the wind
    // request past its own timeout. Never throws: on failure every site falls
    // back to the null-ETA result and the rest of the raport is unchanged.
    await heartbeat(sb, orch, "eta_wind");
    const t2b = Date.now();
    const etaWinds = await predictedSiteWinds(fc.candidates);
    timings.eta_wind_ms = Date.now() - t2b;
    orch.state = {
      ...orch.state,
      timings,
      eta_wind: {
        requested: etaWinds.requested,
        returned: etaWinds.returned,
        error: etaWinds.error,
      },
    };
    await heartbeat(sb, orch, "eta_wind_done");

    // --- stage 4: node "Persist Sightings" --------------------------------
    // Runs BEFORE Sonnet (deviation 1) so a Sonnet failure cannot block it.
    if (opts.dryRun) {
      orch.state = { ...orch.state, persist: { skipped: "dry_run" } };
      await heartbeat(sb, orch, "persist_skipped");
    } else {
      await heartbeat(sb, orch, "persist");
      const t3 = Date.now();
      try {
        const persist = await persistSightings(
          fc.rare_observations,
          fc.weather_corridors,
        );
        orch.state = { ...orch.state, persist };
      } catch (e) {
        // Deviation 3: recorded, never fatal.
        console.error("[toenaosus-orch] persist failed", errMsg(e));
        orch.state = {
          ...orch.state,
          persist: { error: errMsg(e).slice(0, 500) },
        };
      }
      timings.persist_ms = Date.now() - t3;
      orch.state = { ...orch.state, timings };
      await heartbeat(sb, orch, "persist_done");
    }

    // --- stage 5: node "Notify Near-Estonia Rarities" ---------------------
    if (opts.notifyTest) {
      // dryRun-only push gate: one push, no DB read, no mark-notified.
      await heartbeat(sb, orch, "notify_test");
      const t4 = Date.now();
      try {
        const resp = await notifyTestPush(opts.notifyTest.species);
        orch.state = { ...orch.state, notify_test: resp };
      } catch (e) {
        orch.state = {
          ...orch.state,
          notify_test: { error: errMsg(e).slice(0, 500) },
        };
      }
      timings.notify_ms = Date.now() - t4;
      orch.state = { ...orch.state, timings };
      await heartbeat(sb, orch, "notify_test_done");
    } else if (opts.dryRun) {
      orch.state = { ...orch.state, notify: { skipped: "dry_run" } };
      await heartbeat(sb, orch, "notify_skipped");
    } else {
      await heartbeat(sb, orch, "notify");
      const t4 = Date.now();
      const notify = await notifyNearEstoniaRarities(sb);
      timings.notify_ms = Date.now() - t4;
      orch.state = { ...orch.state, timings, notify };
      await heartbeat(sb, orch, "notify_done");
    }

    // --- stage 6: budget guard --------------------------------------------
    // Never start a Sonnet call we cannot finish.
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
        `[toenaosus-orch] budget exhausted before sonnet: ${elapsed} ms`,
      );
      return;
    }

    // --- stage 7: node "Sonnet" -------------------------------------------
    await heartbeat(sb, orch, "sonnet");
    const t5 = Date.now();
    const maxTokens = opts.dryRun && opts.maxTokensOverride
      ? opts.maxTokensOverride
      : MAX_TOKENS;
    const apiResp = await callSonnet(
      SYSTEM_PROMPT,
      fc.sonnet_user_content,
      maxTokens,
      sonnetTimeout,
    );
    calls = 1;
    timings.sonnet_ms = Date.now() - t5;
    orch.state = {
      ...orch.state,
      timings,
      stop_reason: apiResp.stop_reason ?? null,
      output_tokens: apiResp.usage?.output_tokens ?? null,
    };
    await heartbeat(sb, orch, "sonnet_done");

    // --- stage 8: node "Parse + Merge" ------------------------------------
    const t6 = Date.now();
    const payload = parseMerge(apiResp, fc, etaWinds);
    timings.parse_ms = Date.now() - t6;
    orch.state = {
      ...orch.state,
      timings,
      entries: payload.entries.length,
      watchlist: payload.corridor_watchlist.length,
    };
    await heartbeat(sb, orch, "parse_done");

    // --- stage 9: node "Insert -> Supabase" -------------------------------
    let insert: InsertResponse | null = null;
    if (opts.dryRun) {
      orch.state = {
        ...orch.state,
        preview: {
          intro_et: payload.intro_et,
          entries: payload.entries.length,
          watchlist: payload.corridor_watchlist.length,
          generation_meta: payload.generation_meta,
        },
      };
      await heartbeat(sb, orch, "insert_skipped");
    } else {
      await heartbeat(sb, orch, "insert");
      const t7 = Date.now();
      insert = await insertRaport(payload);
      timings.insert_ms = Date.now() - t7;
    }

    // --- stage 10: close --------------------------------------------------
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
          ? { inserted: insert.inserted ?? null, id: insert.id ?? null }
          : null,
      },
      error: null,
    });
    console.log(
      `[toenaosus-orch] done run_id=${orch.runId} entries=${payload.entries.length} watchlist=${payload.corridor_watchlist.length} elapsed=${
        elapsedOf(orch)
      }`,
    );
  } catch (e) {
    const message = errMsg(e);
    console.error(`[toenaosus-orch] failed stage=${orch.stage}`, message);
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
      console.error("[toenaosus-orch] close failed", errMsg(closeErr));
    }
  }
}

// ---------------------------------------------------------------------------
// Request handler. M7.4a rule 4: request-idle 150 s applies to anything awaited
// before the 202, so this awaits auth and one insert, nothing more.
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
  // Debug only: forces the max_tokens throw. Ignored unless dryRun.
  const overrideRaw = Number(body.maxTokensOverride);
  const maxTokensOverride =
    dryRun && Number.isFinite(overrideRaw) && overrideRaw > 0
      ? Math.floor(overrideRaw)
      : null;
  // Android push gate. Ignored unless dryRun.
  const notifyTestRaw = body.notifyTest as { species?: unknown } | undefined;
  const notifyTest =
    dryRun && notifyTestRaw && typeof notifyTestRaw === "object" &&
      typeof notifyTestRaw.species === "string" && notifyTestRaw.species
      ? { species: notifyTestRaw.species }
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
  if (notifyTest) baseState.notify_test_species = notifyTest.species;

  const rowId = await openRun(sb, "toenaosus-raport", runId, 0, baseState);
  if (rowId === null) {
    // No row means no observability for a 3-minute background job.
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

  const work = run(sb, orch, { dryRun, maxTokensOverride, notifyTest });
  const registered = keepAlive(work);
  if (!registered) {
    work.catch((e) => console.error("[toenaosus-orch] unawaited run", errMsg(e)));
  }

  console.log(
    `[toenaosus-orch] start run_id=${runId} row=${rowId} source=${source} dry_run=${dryRun} wait_until=${baseState.wait_until}`,
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
