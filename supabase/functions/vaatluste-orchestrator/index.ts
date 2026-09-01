// vaatluste-orchestrator
// M7.4c: port of the n8n workflow "vaatluste-koordinaator" (0Uq1kLK8wwfZ9PBJ,
// schedule `0 6,18 * * *` Tallinn + webhook vaatluste-refresh). n8n dies
// 2026-09-19.
//
// The five n8n nodes map onto the stages of run() below:
//
//   Code                     -> stage 1: 8 eBird notable pulls, dict, stats, prompts
//   Topup fetch + merge      -> stage 2: ET-rarity topup, dedupe, caps, balance
//   Anthropic API            -> stage 3: Sonnet, direct fetch (needs stop_reason)
//   Parse Anthropic Response -> stage 4: throws, overrides, dedupe, ee_probability
//   Insert into Supabase     -> stage 5: POST insert-vaatluste-raport
//                               stage 6: close the cron_runs row
//
// Shape (M7.4a): run 4474 took 3:16 end to end with Sonnet alone at 159.9 s, so
// this returns 202 as soon as the cron_runs row is open and does the work inside
// EdgeRuntime.waitUntil(). beforeunload lands at ~360 s, hard kill ~400 s, hence
// ORCH_BUDGET_MS 340 s. n8n allowed Sonnet 900 s; that cannot be honoured inside
// a 400 s isolate, so the Sonnet timeout is min(290 s, budget - elapsed - 20 s).
//
// eBird: every call goes through the Netlify relay. eBird answers 418 to
// Supabase egress but 200 to Netlify's (netlify/functions/ebird-probe.js,
// 2026-08-30). The relay forwards ONLY its `path` query parameter, so the eBird
// query string must live INSIDE that encoded value -- appending &back=14 to the
// relay URL would be dropped and eBird would answer with its defaults.
//
// Auth: inbound X-Webhook-Secret == VAATLUSTE_WEBHOOK_SECRET.
//       outbound insert uses N8N_VAATLUSTE_WEBHOOK_SECRET (a DIFFERENT secret --
//       insert-vaatluste-raport reads that one, not the inbound one).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_FN_BASE = SUPABASE_URL + "/functions/v1";

const SPECIES_META_URL = SUPABASE_URL +
  "/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json";

const EBIRD_RELAY_URL = Deno.env.get("EBIRD_RELAY_URL") ||
  "https://estbirds.netlify.app/api/ebird-relay";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 65536;

// M7.4a: beforeunload ~360 s, hard kill ~400 s.
const ORCH_BUDGET_MS = 340_000;
const SONNET_MAX_TIMEOUT_MS = 290_000;
const SONNET_RESERVE_MS = 20_000;

// The relay caps its own eBird call at 9 s, so this ceiling is only a backstop.
const EBIRD_TIMEOUT_MS = 20_000;
const DICT_TIMEOUT_MS = 10_000;     // n8n Code node
const ENNUSTUS_TIMEOUT_MS = 10_000; // n8n Parse node
const INSERT_TIMEOUT_MS = 30_000;   // n8n Insert node

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
// EdgeRuntime, feature-detected as in m7-probe / elurikkus-orchestrator.
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
    console.error("[vaatluste-orch] waitUntil threw", errMsg(e));
  }
  return false;
}

const WAIT_UNTIL_AVAILABLE = typeof edgeRuntime()?.waitUntil === "function";

// ---------------------------------------------------------------------------
// cron_runs logging -- openRun / touchRun / closeRun copied from batch-driver
// (via m7-probe, elurikkus-orchestrator) rather than shared, so porting a
// workflow never edits code the live schedulers run.
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
        `[vaatluste-orch] beforeunload reason=${reason} open_runs=${OPEN_RUNS.size}`,
      );
      const sb = adminClient();
      for (const run of OPEN_RUNS.values()) {
        console.error(
          `[vaatluste-orch] beforeunload row=${run.rowId} stage=${run.stage} elapsed=${
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
          console.error("[vaatluste-orch] beforeunload close", errMsg(e))
        );
        keepAlive(p);
      }
      OPEN_RUNS.clear();
    });
    return true;
  } catch (e) {
    console.error("[vaatluste-orch] beforeunload register failed", errMsg(e));
    return false;
  }
}

function registerUnhandledRejection(): boolean {
  try {
    addEventListener("unhandledrejection", (ev: Event) => {
      const reason = (ev as Event & { reason?: unknown }).reason;
      console.error("[vaatluste-orch] unhandledrejection", errMsg(reason));
      ev.preventDefault();
    });
    return true;
  } catch (e) {
    console.error(
      "[vaatluste-orch] unhandledrejection register failed",
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
//
// It is NOT a constant: n8n interpolated ${JSON.stringify(dictForPrompt)} in the
// middle, so it is held here as two halves and rejoined at runtime. Each half is
// asserted by length and sha256 at module load.
//
// DO NOT "fix" anything in this text. The live prompt contains ASCII-folded
// sections next to diacritic ones, a self-contradicting grammar rule, an
// untranslated "Skandinaavia mountains", and garbled tokens (ksi ALL, KAREGE,
// kesielt). They are what Sonnet has been reading twice a day; changing them
// changes the output and breaks the hash.
// ---------------------------------------------------------------------------

const PROMPT_HEAD =
  `You are the observation report coordinator for the Estonian Ornithological Society (EOÜ). You produce twice-daily observation summaries in Estonian covering both Estonian and European bird sightings.

VASTUSE PIKKUS — OLULINE:
Hoia vastust kompaktselt et see mahuks JSON struktuuri taielikult vormistatuna ara. Pikkus-juhised:
- intro_et: 3-4 lauset, 80-130 sona. Sisaldab:
  * Perioodi konteksti (rande etapp: varakevad/tipphetk/hiline kevad)
  * Yldine vaatlustegevuse intensiivsus
  * Tooni: tervitav, koondav. Algab "Tere!" tervitusega
- estonia.narrative_et: 2-3 loiget, KUNI 300 sona kokku (markdown lubatud)
- europe.narrative_et: 2-3 loiget, KUNI 300 sona kokku (markdown lubatud)
- iga entry rarity_reason: 1 LYHIKE lause, MAX 12 sona
- iga entry comparison_et: 1 LYHIKE lause, MAX 20 sona
- iga entry description_et: 1 LYHIKE lause, MAX 20 sona

ENTRY-SUB-FIELD-PIIRID — KOHUSTUSLIK:
Iga entry kogu pikkus (rarity_reason + comparison_et + description_et) ei tohi olla pikem kui ~50 sona kokku.
Pikemad lauseid kasuta narratiividesse (estonia.narrative_et, europe.narrative_et), MITTE entry kirjetes.
See võimaldab esitada palju entryd (~25-32) lugejale, samal ajal kui narratiivid säilitavad konteksti.
NB! Eelista LUHIDUST agressiivselt. Vastusel on KAREGE token-eelarve — kui valjastad rohkem kui ~12000 sona, vastus saab kesielt ka katki ja kogu raport ebaonnestub.

Kohustuslik prioritiseerimine kui ruum tipheneb:
1. ESIMENE LIIGUTAMINE: ksi ALL narratiiv kompaktsemaks (eemalda taustakontekst, jata sundmustelised faktid)
2. TEINE LIIGUTAMINE: lyhenda iga entry rarity_reason / comparison_et / description_et kuni 1 lauseni

NB! ARA KUNAGI:
- Jaa kesielt mone valja kirjutamist (alati lopeta string ja sulge JSON ' " }')
- Jaa entryd valja, mille rarity_level on 'mega', 'super' voi 'rare' — need on absoluutne prioriteet
- Jaa elurikkus.ee Eesti entryd valja, kui rarity_level on 'mega', 'super' voi 'rare'

ANTI-HALLUTSINATSIOON — KÕIGE TÄHTSAM REEGEL:
KIRJUTA AINULT SELLEST, MIS ON USER_MESSAGE EUROOPA NAABERPIIRKONNAD VÕI EESTI VAATLUSED ANDMETES.

KEELATUD on kirjutada entry kirjet liigi kohta, mille species_lat ei esine input-andmetes. Isegi kui:
- Liik on tüüpiliselt selles piirkonnas haruldane
- Sa tead, et see liik võiks seal kevadrändel esineda
- Sa arvad, et lugeja ootaks seda näha
- Liigi nimi on Sinu meelest oluline raporti rikkamaks muutmiseks

VALE näide: Kui input ei sisalda ühtegi Pelecanus crispus rida, ÄRA kirjuta entry-kirjet Käharpelikan kohta, isegi kui Sa tead, et see liik võiks Skandinaavias esineda.

ÕIGE: Iga entry kirje species_lat väli PEAB TÄPSELT vastama mõne input-rea species_lat väljale. Iga date PEAB pärinema input-reast, mitte väljamõtlemisest. Iga location PEAB olema input-reast.

Kui input-andmed on vähem rikkad kui Sa tahaksid kirjutada — KIRJUTA VÄHEM ENTRY-KIRJET. Parem 12 ehtsat entryt kui 25 entryt, millest pooled on välja mõeldud.

OBSERVER FIELD — KOHUSTUSLIK PRESERVATION:
Iga entry "observer" väli PEAB sisaldama vaatleja(te) nime TÄPSELT input-andmetest. ÄRA kirjuta "Vaatleja teadmata", "Unknown observer" voi sarnast — kui input-rea observer väli on populeeritud, KOPEERI see entry kirjesse.

Kui input-rea observer on null või tühi → entry observer võib olla null.
Kui input-rea observer on "Sebastian Watras" → entry observer PEAB olema "Sebastian Watras".
Kui input-rea observer on "Anna Smith, John Doe" → entry observer PEAB olema "Anna Smith, John Doe".

ÄRA kuna asenda nime hinnanguga "vaatleja teadmata". See on lugejatele eksitav.

SOURCE FIELD — KOHUSTUSLIK:
Iga entry kirje peab sisaldama "source" välja. Kanna see üle täpselt sisendist:
- "source": "ebird" — eBird notable vaatlused
- "source": "et_rarity_topup" — Eesti haruldused topup vaatlused
ÄRA loo uusi source väärtusi, ÄRA jäta source välja välja.

SIGHTS_STATS — KOHUSTUSLIK rare/super/mega entry juures:
Iga entry kirje, mille rarity_level on "rare", "super" või "mega", PEAB sisaldama sights_stats objekti:

sights_stats: {
  "total_obs": <arv>,
  "observer_count": <arv>,
  "first_date": "YYYY-MM-DD",
  "last_date": "YYYY-MM-DD"
}

KASUTA TÄPSEID arve user_message lõpus oleva STATISTIKA HINTS bloki kirjest, mis vastab entry species_lat väljale. ÄRA arvuta uuesti, ÄRA hinnatud, ÄRA muuda — kopeeri täpsed arvud hint-blokist.

Kui hint-blokis liiki pole (pole rare/super/mega), ÄRA lisa sights_stats välja entry kirjesse.

NÄIDE — kui hint näeb välja:
"Pelecanus crispus": { "total_obs": 4, "observer_count": 7, "first_date": "2026-04-25", "last_date": "2026-05-03" }

…siis Käharpelikani entry juures peab sights_stats olema TÄPSELT:
"sights_stats": { "total_obs": 4, "observer_count": 7, "first_date": "2026-04-25", "last_date": "2026-05-03" }

OUTPUT: Return ONLY valid JSON matching the schema below. No markdown fences, no preamble, no commentary outside the JSON.

{
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "intro_et": "1–2 lauset üldist konteksti hooaja, ilma ja rände kohta. Algab tervitusega 'Tere!'.",
  "estonia": {
    "narrative_et": "Täielik vormindatud sektsioon EOÜ stiilis. Algab pealkirjaga '## Eesti vaatlused', millele järgnevad kirjete read tühja reaga eraldatud. Iga kirje formaadis: 'Eestikeelne nimi (*Ladinakeelne nimi*) – kuupäev asukoht, maakond (vaatleja). [Valikuline kontekst.]' Haruldused märgitakse prefiksiga vastavalt tasemele: '**MEGA RARI:**', '**SUPER RARI:**', '**RARI:**'. Tavalised liigid (rarity_level: none) ilma prefiksita.",
    "entries": [
      {
        "species_et": "Lühinokk-hani",
        "species_lat": "Anser brachyrhynchus",
        "date": "2026-04-15",
        "location": "Matsalu",
        "region": "Läänemaa",
        "country_code": "EE",
        "observers": ["Margus Ots"],
        "lat": 58.75,
        "lng": 23.65,
        "count": 3,
        "rarity_level": "super",
        "is_rarity": true,
        "rarity_reason": "Eestis harv külaline; tavapärane levila on Island ja Svalbard",
        "documented": ["foto"],
        "comparison_et": "Põhja-Euroopas erakordne kevadvaatlus."
      }
    ]
  },
  "europe": {
    "narrative_et": "Sama formaat sektsioonile '## Euroopa vaatlused'. Sisaldab naaberriikide olulisi vaatlusi ja Euroopa-tasandi haruldusi.",
    "entries": []
  }
}

## EESTIKEELSED LIIGINIMED — KOHUSTUSLIK SÕNASTIK

Allpool on autoritatiivne ladina-keelse → eestikeelse liiginime sõnastik. Sa PEAD kasutama AINULT neid eestikeelseid nimesid välja "species_et" jaoks. Ära tõlgi inglise keelest. Ära leiuta nimesid. Ära kasuta sünonüüme.

Kui ladinakeelne liik EI ole sõnastikus, kasuta välja "species_et" jaoks ladinakeelset nime ja lisa väljale "rarity_reason" lõppu märge "[liiginimi puudub sõnastikust]".

Sõnastik (JSON, võti = ladina nimi, väärtus = eestikeelne nimi):
`;

const PROMPT_TAIL = `

RARITY LEVEL — kasuta sisendis kaasas olevat klassifikatsiooni:
- Iga sisendi vaatlus sisaldab välja "rarity_level" ühel neljast väärtusest: "none", "rare", "super", "mega". See klassifikatsioon on EOÜ kureeritud; KASUTA SEDA KOPEERIDES, ÄRA OTSUSTA ISE.
- Pane väljundi "rarity_level" täpselt sama väärtus, mis sisendis.
- Tuleta "is_rarity" järgmiselt: true kui rarity_level on "rare", "super" või "mega"; false kui "none".
- "rarity_reason" välja kasuta ainult kui rarity_level ei ole "none" — kirjelda lühidalt põhjust (nt levila, hooajalisus). Kui rarity_level on "none", pane rarity_reason: null.
- Narratiiv \`narrative_et\`: tasemete tähised:
  * mega → prefiks "**MEGA RARI:**"
  * super → prefiks "**SUPER RARI:**"
  * rare → prefiks "**RARI:**"
  * none → ilma prefiksita

NB! Sisendi rarity_level on autoriteet. Isegi kui sa arvad, et liik peaks olema haruldasem või tavalisem, JÄTA klassifikatsioon muutmata.

ET_RARITY_TOPUP — taiendavad reeglid:
Mones EUROOPA NAABERPIIRKONNAD massiivi kirjes on lisaks vali "source": "et_rarity_topup". Need on liigid, mis Eesti vaatlejale on haruldused (rarityLevel rare, super voi mega), kuid mida kohalikud eBird-ulevaatajad asukohariigis ei margitud notable kirjeks. Need on raporti jaoks haruldused olenemata kohalikust tavalisusest.

Nendele kirjetele kirjuta rarity_reason valjasse LUHIKE BIOGEOGRAAFILINE kontekst — miks on liik Eesti vaatlejale haruldus (tavaparane levila, sigimisala, voi miks Eestis harv). NAITED:
- "Sigib Vahemeremaade rannikutel; Pohja-Euroopas vagrandi vaatlused on erakordsed."
- "Eesti vagrant; tavaparane levila on Lounaeuroopa ja Aafrika."
- "Eestis erakordselt harv kulaline; lahimad sigimisalad asuvad Aasias."

ARA KIRJUTA rarity_reason valjasse ulearuseid silte nagu "Eesti haruldus (MEGA)" voi "vaadeldud {country_code}" — riik ja tase on juba tuvastatavad teistest valjadest ning naidatakse lugejale eraldi badge'iga.

ET_RARITY_TOPUP — taielikkus europe.entries massiivis ja narratiivis:
Iga eraldiseisev species_lat, mis EUROOPA NAABERPIIRKONNAD massiivis kannab "source": "et_rarity_topup", PEAB ilmuma europe.entries kirjete hulgas JA europe.narrative_et tekstis. Uhtegi ei tohi vahele jatta isegi kui 8-20 kirje piir saab kaes. Kui sama liigi kohta on mitu vaatlust, kasuta koige uuemat (suurim date vaartus). Kui valjundi pikkus tihendab, lyhenda KOIGEPEALT tavalisi Euroopa kirjeid kompaktseteks uherealisteks mainimisteks ja alles seejarel kaalu midagi muud.

ESTONIAN GRAMMAR — KOHUSTUSLIK TAPSUS:
- Kasuta korrektseid Eesti keele kaande- ja arvuvorme. Naited: "kevadrande vaatlus" ON VALE, oige on "kevadrande vaatlus" pole isegi sona — peab olema "kevadrande" jaoks "kevadrande" kaande puudumine; kasuta "kevadrandel" voi "kevadrande ajal" voi vormi "rande kevadel".
- Kontrolli liitsonade vormistust: "rabahani", "luitsnokk-iibis", "puna-harksaba".
- Pööra eraldi tähelepanu täpitähtedele (ä, ö, ü, õ, š) — need ei tohi puududa.

EESTI ORNITOLOOGIA TERMINOLOOGIA — KOHUSTUSLIK:
Kasuta jargmisi termineid; ARA kasuta laensonu ega muid sunonuume:

PESITSEMINE:
- "pesitseb" — liik teeb pesa ja kasvatab pojad. ARA kasuta "sigib".
- "pesitsusala", "pesitsuspaik" — pesitsemiseks kasutatav levila. ARA kasuta "sigimisala".
- "haudeaeg" — pesitsusperiood

EKSIRANNE JA HARULDUSED:
- "eksilind", "eksilinnuna", "eksilinnud" — kaugele oma tavapärasest levilast eksinud lind. ARA kasuta "vagrant", "vagrandi", "vagranti".
- "lapatu lind" — sunonuum eksilinnule, harvemini kasutatav

RANDE TERMINOLOOGIA:
- "labirandaja" — liik mis Eestit labib randeperioodil kuid ei pesitse siin
- "ranne", "kevadranne", "sugisranne" — rande nimetused (NB! umlautidega "kevadrande", mitte "kevadrande")
- "randeperiood", "randeaeg"
- "talvitub", "talvitumisala" — talvitumiseks kasutatav levila

OIGED NAITED:
- OIGE: "Liik pesitseb Skandinaavia mountains ja Islandil..." 
  VALE: "Liik sigib Skandinaavia mountains ja Islandil..."
- OIGE: "Eestis esineb peamiselt eksilinnuna kevadrandeperioodil"
  VALE: "Eestis esineb peamiselt vagrandi voi ekslinduna"
- OIGE: "Tegu on erandliku labirandaja vaatlusega"
  VALE: "Tegu on erandliku vagrandi vaatlusega"
- OIGE: "Pesitsusala holmab Lounap-Euroopa rannikut, talvitub Aafrikas"
  VALE: "Sigimisala holmab Lounap-Euroopa rannikut"

ESTONIAN TRANSLATION:
- eBird gives English common names. Translate to standard Estonian ornithological vocabulary.
- Use authoritative Estonian names (e.g., "Vihitaja" for Common Sandpiper, "Räusk" for Caspian Tern, "Kägu" for Cuckoo, "Mustsaba-vigle" for Black-tailed Godwit).
- If genuinely uncertain, use the Latin name as species_et and write "(eestikeelne nimi täpsustamata)" inline in the narrative.

OBSERVER NAMES:
- Use the observer field from the input when present.
- If observer is null (eBird privacy setting), write "(vaatleja teadmata)" in the narrative for that entry.

COMPARISON LINES — pikkus ja täpsus:
- HARULDUS-kirjetel kirjuta \`comparison_et\` 2-3 lauset (mitte ainult ühte). Lisa lühike levila kirjeldus, sigimisala või talvitumisala, ning kas tegu on tüüpilise rändeperioodi vaatlusega või vagrandiga.
- Mitte-haruldus kirjetel piisab ühest lausest või võib \`comparison_et\` olla null.
- ÄRA KUNAGI viita konkreetsetele kuupäevadele ("X päeva varasem", "esimene Eestis", "viimane registreerimine 2019") — see info pole sõnastikus ja seda ei tohi leiutada.
- ÄRA viita Eesti varasematele vaatlustele kvantitatiivselt ("registreeritud N korda viimase 10 aasta jooksul") — kui sul pole täpset andmeallikat, jäta välja.
- Kui pole kindel, kirjuta lühem ja täpsem lause kui pikem ja küsitavate faktidega.
- Aktsepteeritavad mustrid:
  * "Põhja-Euroopas erakordne vaatlus; liigi tavapärane levila on [piirkond]. Sigib [ala] ja talvitub [ala]. Eestis on tegu vagrandi vaatlusega."
  * "Tegu on antud liigi jaoks tavapärase kevadrände vaatlusega. Liigi peamine rändeaeg langeb [kuud]."
  * "Eestis on liik haruldane, kuid viimase kümnendi jooksul on esinemus muutunud sagedasemaks. Sigib [piirkond], rändeperioodil läbib Põhja-Euroopat."

NARRATIVE STYLE:
- Fluent, calm, factual Estonian. EOÜ publication tone.
- Italicize Latin names in narrative_et using markdown asterisks: *Cuculus canorus*
- Bold the rarity prefix: **HARULDUS:**
- Section headers in narrative_et: '## Eesti vaatlused' and '## Euroopa vaatlused'
- Order entries chronologically within each section (oldest first).



PLACEHOLDER-KEELD — KOHUSTUSLIK:
ÄRA KUNAGI kirjuta entrye tekstiväljadesse (rarity_reason, comparison_et, description_et) placeholder-tähistele nagu:
- "[liiginimi puudub sõnastikust]"
- "[andmed puuduvad]"
- "[teave puudub]"
- "[unknown]" / "[N/A]" / "[?]"
või muud sulgudes paiknevad meta-märkused.

Kui Sa ei tea mõnda detaili (näiteks teadusliku liiginime sõnastust), JÄTA see info tekstiväljast välja ja keskenduda sellele, mida sisend pakub. Kirjuta lühem, kompaktsem lause kui pikem lause placeholder-tähistele.

Õige näide kui sci-nime pole sisendis: "Atlandi ookeani rannikuliik, Eesti megaharuldus."
VALE: "Atlandi ookeani rannikuliik. [liiginimi puudub sõnastikust]"

INPUT: User provides eBird notable + topup observations from Estonia and 7 neighboring regions as JSON arrays.

ÜLESANNE — RIKASTA, ÄRA FILTREERI:
IGA entry on juba välja valitud automaatse süsteemi poolt (per-country balance, rarity-priority sort). Sinu töö on:
1. Lisada IGALE entryle: rarity_reason, comparison_et, description_et
2. Sümbolis-sümboliks kopeerida species_et, species_lat, date, location, country_code, lat, lng, count, observer, rarity_level, source sisendist (ÄRA muuda)
3. Mitte FILTREERIDA, mitte VALIDA, mitte JÄTTA VÄLJA ühtegi entryt
4. Säilitada algne järjekord ja täpne arv

Kui sisend sisaldab N entryt, output peab sisaldama TÄPSELT N entryt. Sama arv mõlemas sektsioonis (Eesti ja Euroopa). ÄRA tee subjektiivset valikut.

KUI sisend on tühi (0 entryt), tagasta narrative_et väärtuseks "Sel perioodil silmapaistvaid vaatlusi ei registreeritud." ja entries: [].`;

// Measured from the n8n export (A2, 2026-09-01), DECODED -- i.e. the string
// Sonnet receives, with the 6 escaped backticks in TAIL counted as one char each.
const PROMPT_HEAD_CHARS = 6743;
const PROMPT_HEAD_SHA256 =
  "3a61365232ed07878d56ea2feb7737f140bfa567b3d35c1bcba5841dfed925c4";
const PROMPT_TAIL_CHARS = 7935;
const PROMPT_TAIL_SHA256 =
  "14b469bf295161439cf3771c3066b7240d169deafdfcbf1adbaf243fc9b7399f";

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
for (
  const [label, text, chars, want] of [
    ["PROMPT_HEAD", PROMPT_HEAD, PROMPT_HEAD_CHARS, PROMPT_HEAD_SHA256],
    ["PROMPT_TAIL", PROMPT_TAIL, PROMPT_TAIL_CHARS, PROMPT_TAIL_SHA256],
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

function buildSystemPrompt(dictForPrompt: Record<string, string>): string {
  return PROMPT_HEAD + JSON.stringify(dictForPrompt) + PROMPT_TAIL;
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

interface SpeciesMetaItem {
  scientificName?: string;
  rarityLevel?: string;
  ebirdCode?: string;
}

interface EbirdObs {
  comName?: string;
  sciName?: string;
  obsDt?: string;
  locName?: string;
  subnational1Name?: string;
  subnational1Code?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  howMany?: number;
  userDisplayName?: string;
  firstName?: string;
  lastName?: string;
  hasRichMedia?: boolean;
  obsValid?: boolean;
  obsReviewed?: boolean;
  subId?: string;
  speciesCode?: string;
}

interface Obs {
  region?: string;
  species_et?: string | null;
  species_en: string | null;
  species_lat: string | null;
  date: string;
  time?: string | null;
  location: string | null;
  sub_region: string | null;
  sub_region_code?: string | null;
  country_code: string;
  lat: number | null;
  lng: number | null;
  count: number | null;
  observer: string | null;
  has_media?: boolean;
  valid?: boolean;
  reviewed?: boolean;
  sub_id?: string | null;
  rarity_level?: string;
  source?: string;
  [k: string]: unknown;
}

interface DictRarity {
  species_et: string;
  species_lat: string;
  species_code: string;
  rarity_level: string;
}

interface StatsHint {
  total_obs: number;
  observer_count: number | null;
  first_date: string | null;
  last_date: string | null;
}

interface CodeCtx {
  period_start: string;
  period_end: string;
  user_message: string;
  system_prompt: string;
  source_data: { estonia: Obs[]; europe: Obs[] };
  obs_counts: { estonia: number; europe: number };
  trigger_source: string;
  latinToEstonian: Record<string, string>;
  latinToRarity: Record<string, string>;
  dict_rarities: DictRarity[];
  dictMeta: Record<string, unknown>;
  statsHintsEstonia: Record<string, StatsHint>;
  statsHintsEurope: Record<string, StatsHint>;
  dictForPrompt: Record<string, string>;
  ebirdErrors: Array<{ region: string; error: string }>;
}

interface ParsedEntry {
  species_lat?: string;
  species_et?: string;
  rarity_level?: string;
  rarity_reason?: string | null;
  is_rarity?: boolean;
  date?: string;
  location?: string;
  country_code?: string;
  observer?: string | null;
  source?: string;
  data_integrity?: string;
  ee_probability_pct?: number;
  [k: string]: unknown;
}

interface ParsedReport {
  intro_et?: string;
  estonia?: { narrative_et?: string; entries?: ParsedEntry[] };
  europe?: { narrative_et?: string; entries?: ParsedEntry[] };
}

// ---------------------------------------------------------------------------
// node "Code"
// ---------------------------------------------------------------------------

const REGIONS = ["EE", "FI", "LV", "LT", "SE", "NO", "DK", "PL"];
const NOTABLE_EUROPE_CAP = 50;

function toDisplayCase(name: string): string {
  if (!name || typeof name !== "string") return name;
  if (name[0] === name[0].toUpperCase()) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function mapNotable(region: string, data: unknown[]): Obs[] {
  return data.map((raw) => {
    const obs = raw as EbirdObs;
    const observerName = obs.userDisplayName ||
      ([obs.firstName, obs.lastName].filter(Boolean).join(" ").trim() || null);
    return {
      region,
      species_en: obs.comName || null,
      species_lat: obs.sciName || null,
      date: (obs.obsDt || "").slice(0, 10),
      time: (obs.obsDt || "").slice(11, 16) || null,
      location: obs.locName || null,
      sub_region: obs.subnational1Name || null,
      sub_region_code: obs.subnational1Code || null,
      country_code: obs.countryCode || region.split("-")[0],
      lat: obs.lat ?? null,
      lng: obs.lng ?? null,
      count: obs.howMany ?? null,
      observer: observerName,
      has_media: obs.hasRichMedia === true,
      valid: obs.obsValid !== false,
      reviewed: obs.obsReviewed === true,
      sub_id: obs.subId || null,
    } as Obs;
  });
}

function slimObs(o: Obs) {
  return {
    species_et: o.species_et || null,
    species_en: o.species_en,
    species_lat: o.species_lat,
    date: o.date,
    location: o.location,
    sub_region: o.sub_region,
    country_code: o.country_code,
    lat: o.lat,
    lng: o.lng,
    count: o.count,
    observer: o.observer,
    rarity_level: o.rarity_level,
    source: o.source || "ebird",
  };
}

// Stats aggregation per species (rare/super/mega only). Computed BEFORE
// slim/cap to capture full data.
function aggregateStatsByLatin(observations: Obs[]): Record<string, StatsHint> {
  const byLat = new Map<string, {
    rarity_level: string;
    total_obs: number;
    observers: Set<string>;
    first_date: string | null;
    last_date: string | null;
  }>();
  for (const o of observations) {
    if (!o || !o.species_lat) continue;
    const lat = String(o.species_lat);
    let bucket = byLat.get(lat);
    if (!bucket) {
      bucket = {
        rarity_level: o.rarity_level || "none",
        total_obs: 0,
        observers: new Set<string>(),
        first_date: null,
        last_date: null,
      };
      byLat.set(lat, bucket);
    }
    bucket.total_obs += 1;
    if (o.observer) {
      const names = String(o.observer).split(",").map((s) => s.trim()).filter(
        Boolean,
      );
      for (const n of names) bucket.observers.add(n);
    }
    const d = String(o.date || "").slice(0, 10);
    if (d) {
      if (!bucket.first_date || d < bucket.first_date) bucket.first_date = d;
      if (!bucket.last_date || d > bucket.last_date) bucket.last_date = d;
    }
  }
  const result: Record<string, StatsHint> = {};
  for (const [lat, b] of byLat) {
    if (
      b.rarity_level !== "rare" && b.rarity_level !== "super" &&
      b.rarity_level !== "mega"
    ) continue;
    result[lat] = {
      total_obs: b.total_obs,
      observer_count: b.observers.size > 0 ? b.observers.size : null,
      first_date: b.first_date,
      last_date: b.last_date,
    };
  }
  return result;
}

async function runCodeNode(triggerSource: string): Promise<CodeCtx> {
  // Fail fast, before any relay call and before Sonnet is paid for: without the
  // relay secret every eBird pull would 401 and the run would produce an empty
  // report at full model cost.
  if (!Deno.env.get("EBIRD_RELAY_SECRET")) {
    throw new Error("missing_env:EBIRD_RELAY_SECRET");
  }

  const now = new Date();
  const periodEnd = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - 14);
  const periodStart = start.toISOString().slice(0, 10);

  const ebirdErrors: Array<{ region: string; error: string }> = [];

  // n8n fired all 8 regions with Promise.all and swallowed failures into [].
  const perRegion = await Promise.all(REGIONS.map(async (region) => {
    try {
      const data = await ebirdGet(
        `/data/obs/${region}/recent/notable?back=14&detail=full`,
      );
      return mapNotable(region, data);
    } catch (err) {
      const message = errMsg(err);
      console.error(`eBird fetch failed for ${region}: ${message}`);
      ebirdErrors.push({ region, error: message.slice(0, 200) });
      return [] as Obs[];
    }
  }));
  const all = perRegion.flat();
  const estoniaObs = all.filter((o) => o.region === "EE");
  const europeObs = all.filter((o) => o.region !== "EE");

  // APPROVED DEVIATION (M7.4c): n8n swallowed every region failure into [] and
  // would have gone on to pay for a Sonnet call that wrote an empty raport. If
  // ALL regions failed the cause is systemic -- relay down, secret rotated,
  // eBird 418 -- so fail the run here instead of publishing an empty report.
  // A partial failure still proceeds, exactly as n8n did.
  if (ebirdErrors.length === REGIONS.length) {
    throw new Error(
      "ebird_all_regions_failed: " +
        JSON.stringify(ebirdErrors).slice(0, 500),
    );
  }

  // === SPECIES DICTIONARY (Latin -> Estonian display name) ===
  const latinToEstonian: Record<string, string> = {};
  const latinToRarity: Record<string, string> = {};
  const dict_rarities: DictRarity[] = [];
  let dictMeta: Record<string, unknown> = {
    fetched: false,
    totalItems: 0,
    itemsWithLatin: 0,
    itemsWithRarity: 0,
    coverageRatio: 0,
    rarityCoverageRatio: 0,
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
        if (
          lvl === "none" || lvl === "rare" || lvl === "super" || lvl === "mega"
        ) {
          latinToRarity[latKey] = lvl;
        } else {
          latinToRarity[latKey] = "none";
        }
        if (
          (lvl === "mega" || lvl === "super" || lvl === "rare") && item.ebirdCode
        ) {
          dict_rarities.push({
            species_et: toDisplayCase(estKey),
            species_lat: latKey,
            species_code: String(item.ebirdCode).trim(),
            rarity_level: lvl,
          });
        }
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
      rarityCoverageRatio: itemsWithLatin ? itemsWithRarity / itemsWithLatin : 0,
      error: null,
    };

    // === workflow-level dict overrides ===
    // species_meta_v1.json sometimes maps Latin to a less-precise canonical
    // Estonian. Override here. Long-term fix: update species_meta_v1.json.
    const DICT_OVERRIDES: Record<string, string> = {
      // dict has generic "Rabahani"; Anser fabalis is specifically Taiga form
      "Anser fabalis": "Taiga-rabahani",
    };
    let dictOverridesApplied = 0;
    const dictOverridePrior: Record<string, string | null> = {};
    for (const lat in DICT_OVERRIDES) {
      if (latinToEstonian[lat] !== DICT_OVERRIDES[lat]) {
        dictOverridePrior[lat] = latinToEstonian[lat] || null;
        latinToEstonian[lat] = DICT_OVERRIDES[lat];
        dictOverridesApplied += 1;
      }
    }
    dictMeta.dictOverridesApplied = dictOverridesApplied;
    dictMeta.dictOverrideKeys = Object.keys(DICT_OVERRIDES);
    dictMeta.dictOverridePrior = dictOverridePrior;
  } catch (e) {
    dictMeta = {
      fetched: false,
      totalItems: 0,
      itemsWithLatin: 0,
      itemsWithRarity: 0,
      coverageRatio: 0,
      rarityCoverageRatio: 0,
      error: errMsg(e),
    };
    console.warn("[species-dict] fetch failed:", dictMeta.error);
  }

  const latinNamesInRun = new Set<string>();
  for (const obs of [...estoniaObs, ...europeObs]) {
    if (obs.species_lat) latinNamesInRun.add(obs.species_lat);
  }

  const dictForPrompt: Record<string, string> = {};
  for (const lat of latinNamesInRun) {
    if (latinToEstonian[lat]) dictForPrompt[lat] = latinToEstonian[lat];
  }

  // === RARITY LEVEL + SPECIES_ET ENRICHMENT ===
  function enrichRarity(obs: Obs) {
    obs.rarity_level = (obs.species_lat && latinToRarity[obs.species_lat]) ||
      "none";
    return obs;
  }
  function enrichSpeciesEt(obs: Obs) {
    if (!obs.species_lat) return;
    const est = latinToEstonian[obs.species_lat];
    if (est) obs.species_et = est;
  }
  estoniaObs.forEach(enrichRarity);
  europeObs.forEach(enrichRarity);
  estoniaObs.forEach(enrichSpeciesEt);
  europeObs.forEach(enrichSpeciesEt);

  const statsHintsEstonia = aggregateStatsByLatin(estoniaObs);
  const statsHintsEurope = aggregateStatsByLatin(europeObs);

  const europeSorted = europeObs.slice().sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );
  const europeCapped = europeSorted.slice(0, NOTABLE_EUROPE_CAP);

  const estoniaSlim = estoniaObs.map(slimObs);
  const europeSlim = europeCapped.map(slimObs);

  const statsHintsBlock = JSON.stringify({
    estonia: statsHintsEstonia,
    europe: statsHintsEurope,
  }, null, 2);

  const userMessage = `Periood: ${periodStart} kuni ${periodEnd}.

EESTI VAATLUSED (eBird notable, viimased 14 päeva, ${estoniaSlim.length} kirjet):
${JSON.stringify(estoniaSlim, null, 2)}

EUROOPA NAABERPIIRKONNAD (eBird notable top ${NOTABLE_EUROPE_CAP} most recent, ${europeSlim.length} kirjet):
${JSON.stringify(europeSlim, null, 2)}

STATISTIKA HINTS (kasuta neid sights_stats väljas täpselt):
${statsHintsBlock}

Koosta JSON-vastus täpselt vastavalt süsteemi juhistele.`;

  return {
    period_start: periodStart,
    period_end: periodEnd,
    user_message: userMessage,
    system_prompt: buildSystemPrompt(dictForPrompt),
    // As live: source_data.europe is the CAPPED notable set, not all of it.
    source_data: { estonia: estoniaObs, europe: europeCapped },
    obs_counts: { estonia: estoniaObs.length, europe: europeObs.length },
    trigger_source: triggerSource,
    latinToEstonian,
    latinToRarity,
    dict_rarities,
    dictMeta,
    statsHintsEstonia,
    statsHintsEurope,
    dictForPrompt,
    ebirdErrors,
  };
}

// ---------------------------------------------------------------------------
// node "Topup fetch + merge"
//
// APPROVED DEVIATION (M7.4c ruling 4): n8n issued one eBird call per
// (species, region) target -- batches of 15, up to 7 x |dict_rarities| calls.
// Through the relay each of those is a separate Netlify invocation, so the fetch
// half is replaced by ONE region pull per region:
//   /data/obs/{region}/recent?back=14&maxResults=10000&detail=full
// and the target selection is applied locally afterwards. Every downstream step
// -- normalize, dedupe, per-(species,country) cap, total cap, tier filter,
// country balance, stats rebuild, user_message -- is unchanged.
// ---------------------------------------------------------------------------

const TOPUP_REGIONS = ["FI", "LV", "LT", "SE", "NO", "DK", "PL"];
const TOPUP_OBS_PER_SPECIES_PER_COUNTRY_CAP = 1;
const TOPUP_TOTAL_CAP = 200;
const MEGA_ONLY_COUNTRIES = new Set(["NO", "DK"]);
const MAX_PER_COUNTRY = 8;
const RARITY_RANK: Record<string, number> = {
  mega: 0,
  super: 1,
  rare: 2,
  none: 3,
};

interface TopupResult {
  user_message: string;
  balancedMerged: Obs[];
  telemetry: Record<string, unknown>;
}

function normalize(
  target: DictRarity & { region_code: string },
  raw: unknown,
): Obs {
  const obs = raw as EbirdObs;
  const obsDt = String(obs.obsDt || "").trim();
  const date = obsDt.split(/\s+/)[0] || "";
  const observerName = obs.userDisplayName ||
    ([obs.firstName, obs.lastName].filter(Boolean).join(" ").trim() || null);
  return {
    species_et: target.species_et,
    species_en: obs.comName || null,
    species_lat: target.species_lat,
    date,
    location: obs.locName || null,
    sub_region: obs.subnational1Name || null,
    country_code: obs.countryCode || target.region_code,
    lat: obs.lat ?? null,
    lng: obs.lng ?? null,
    count: obs.howMany ?? null,
    observer: observerName,
    rarity_level: target.rarity_level,
    source: "et_rarity_topup",
  } as Obs;
}

function obsKey(o: Obs): string {
  return [
    String(o.species_lat || "").toLowerCase().trim(),
    String(o.date || "").trim(),
    String(o.location || "").toLowerCase().trim(),
    String(o.country_code || "").toUpperCase().trim(),
  ].join("|");
}

// Re-aggregate stats from final post-topup obs sets so hints reflect what Sonnet
// actually sees.
function rebuildStatsByLatin(observations: Obs[]): Record<string, StatsHint> {
  const byLat = new Map<string, {
    total_obs: number;
    observers: Set<string>;
    first_date: string | null;
    last_date: string | null;
  }>();
  for (const o of observations) {
    if (!o || !o.species_lat) continue;
    if (
      o.rarity_level !== "rare" && o.rarity_level !== "super" &&
      o.rarity_level !== "mega"
    ) continue;
    const lat = String(o.species_lat);
    let bucket = byLat.get(lat);
    if (!bucket) {
      bucket = {
        total_obs: 0,
        observers: new Set<string>(),
        first_date: null,
        last_date: null,
      };
      byLat.set(lat, bucket);
    }
    bucket.total_obs += 1;
    if (o.observer) {
      const names = String(o.observer).split(",").map((s) => s.trim()).filter(
        Boolean,
      );
      for (const n of names) bucket.observers.add(n);
    }
    const d = String(o.date || "").slice(0, 10);
    if (d) {
      if (!bucket.first_date || d < bucket.first_date) bucket.first_date = d;
      if (!bucket.last_date || d > bucket.last_date) bucket.last_date = d;
    }
  }
  const out: Record<string, StatsHint> = {};
  for (const [lat, b] of byLat) {
    out[lat] = {
      total_obs: b.total_obs,
      observer_count: b.observers.size > 0 ? b.observers.size : null,
      first_date: b.first_date,
      last_date: b.last_date,
    };
  }
  return out;
}

async function runTopup(ctx: CodeCtx): Promise<TopupResult> {
  const dict_rarities = ctx.dict_rarities || [];
  const europeObs = ctx.source_data?.europe || [];
  const estoniaObs = ctx.source_data?.estonia || [];

  const covered = new Set<string>();
  for (const o of europeObs) {
    const sci = String(o.species_lat || "").trim().toLowerCase();
    const rg = String(o.country_code || "").trim().toUpperCase();
    if (sci && rg) covered.add(`${sci}|${rg}`);
  }

  // Kept for telemetry parity: the number of (species, region) pairs n8n would
  // have fetched one by one.
  let targetsToFetch = 0;
  const bySciLower = new Map<string, DictRarity>();
  for (const r of dict_rarities) {
    const sciKey = String(r.species_lat).toLowerCase();
    bySciLower.set(sciKey, r);
    for (const rg of TOPUP_REGIONS) {
      if (!covered.has(`${sciKey}|${rg}`)) targetsToFetch += 1;
    }
  }

  const startTime = Date.now();
  const errors: Array<{ sci: string | null; rg: string; err: string }> = [];
  let regionsSucceeded = 0;

  const perRegion = await Promise.all(TOPUP_REGIONS.map(async (rg) => {
    try {
      const data = await ebirdGet(
        `/data/obs/${rg}/recent?back=14&maxResults=10000&detail=full`,
      );
      regionsSucceeded += 1;
      const out: Obs[] = [];
      for (const raw of data) {
        const sci = String((raw as EbirdObs).sciName || "").trim().toLowerCase();
        if (!sci) continue;
        const target = bySciLower.get(sci);
        if (!target) continue; // not an ET rarity
        if (covered.has(`${sci}|${rg}`)) continue; // already in notable
        out.push(normalize({ ...target, region_code: rg }, raw));
      }
      return out;
    } catch (err) {
      const message = errMsg(err);
      console.error(`[topup] region ${rg} failed: ${message}`);
      errors.push({ sci: null, rg, err: message.slice(0, 200) });
      return [] as Obs[];
    }
  }));

  const topupObsRaw: Obs[] = perRegion.flat();
  const elapsedMs = Date.now() - startTime;

  // === dedup topup obs against existing notable + against self ===
  const existingKeys = new Set<string>();
  for (const o of europeObs) existingKeys.add(obsKey(o));

  const topupObs: Obs[] = [];
  let topupDuplicatesAgainstExisting = 0;
  let topupDuplicatesAgainstSelf = 0;
  for (const o of topupObsRaw) {
    const k = obsKey(o);
    if (existingKeys.has(k)) {
      if (europeObs.some((e) => obsKey(e) === k)) {
        topupDuplicatesAgainstExisting += 1;
      } else {
        topupDuplicatesAgainstSelf += 1;
      }
      continue;
    }
    existingKeys.add(k);
    topupObs.push(o);
  }

  // === per-(species, country) cap ===
  const topupObsSortedAll = topupObs.slice().sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );
  const perSpeciesCountryCount = new Map<string, number>();
  const topupObsPerSpecies: Obs[] = [];
  for (const o of topupObsSortedAll) {
    const sp = String(o.species_lat || "").toLowerCase();
    const cc = String(o.country_code || "").toUpperCase();
    const key = sp + "|" + cc;
    const c = perSpeciesCountryCount.get(key) || 0;
    if (c >= TOPUP_OBS_PER_SPECIES_PER_COUNTRY_CAP) continue;
    perSpeciesCountryCount.set(key, c + 1);
    topupObsPerSpecies.push(o);
  }

  const topupObsCapped = topupObsPerSpecies.slice(0, TOPUP_TOTAL_CAP);
  const topupTrimmedBySpeciesCap = topupObs.length - topupObsPerSpecies.length;
  const topupTrimmedByTotalCap = topupObsPerSpecies.length -
    topupObsCapped.length;

  const merged = [...europeObs, ...topupObsCapped];

  // === tier filter for distant countries (NO/DK: mega only) ===
  const mergedBeforeTierFilter = merged.length;
  const tierFiltered = merged.filter((o) => {
    const cc = String(o?.country_code || "").toUpperCase();
    if (!MEGA_ONLY_COUNTRIES.has(cc)) return true;
    return o?.rarity_level === "mega";
  });
  const tierFilterDropped = mergedBeforeTierFilter - tierFiltered.length;

  // === per-country bucketing for geographic balance ===
  function rarityRank(o: Obs): number {
    return RARITY_RANK[o?.rarity_level ?? ""] ?? 4;
  }

  const byCountry = new Map<string, Obs[]>();
  for (const o of tierFiltered) {
    const cc = String(o?.country_code || "XX").toUpperCase();
    if (!byCountry.has(cc)) byCountry.set(cc, []);
    byCountry.get(cc)!.push(o);
  }

  const balancedMerged: Obs[] = [];
  const perCountryStats: Record<string, unknown> = {};
  for (const [cc, obs] of byCountry) {
    obs.sort((a, b) => {
      const ra = rarityRank(a);
      const rb = rarityRank(b);
      if (ra !== rb) return ra - rb;
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    const taken = obs.slice(0, MAX_PER_COUNTRY);
    perCountryStats[cc] = {
      raw: obs.length,
      taken: taken.length,
      by_rarity: {
        mega: obs.filter((o) => o.rarity_level === "mega").length,
        super: obs.filter((o) => o.rarity_level === "super").length,
        rare: obs.filter((o) => o.rarity_level === "rare").length,
        none:
          obs.filter((o) => !o.rarity_level || o.rarity_level === "none").length,
      },
    };
    balancedMerged.push(...taken);
  }

  balancedMerged.sort((a, b) => {
    const cca = String(a?.country_code || "").toUpperCase();
    const ccb = String(b?.country_code || "").toUpperCase();
    if (cca !== ccb) return cca.localeCompare(ccb);
    const ra = rarityRank(a);
    const rb = rarityRank(b);
    if (ra !== rb) return ra - rb;
    return String(b.date || "").localeCompare(String(a.date || ""));
  });

  const balanceTelemetry = {
    countries_seen: byCountry.size,
    raw_total: merged.length,
    tier_filtered_total: tierFiltered.length,
    tier_filter_dropped: tierFilterDropped,
    mega_only_countries: Array.from(MEGA_ONLY_COUNTRIES),
    balanced_total: balancedMerged.length,
    trimmed: merged.length - balancedMerged.length,
    max_per_country: MAX_PER_COUNTRY,
    per_country: perCountryStats,
  };

  const periodStart = ctx.period_start;
  const periodEnd = ctx.period_end;

  const finalStatsEstonia = rebuildStatsByLatin(estoniaObs);
  const finalStatsEurope = rebuildStatsByLatin(balancedMerged);
  const statsHintsBlock = JSON.stringify({
    estonia: finalStatsEstonia,
    europe: finalStatsEurope,
  }, null, 2);

  const user_message = `Periood: ${periodStart} kuni ${periodEnd}.

EESTI VAATLUSED (eBird notable, viimased 14 päeva, ${estoniaObs.length} kirjet):
${JSON.stringify(estoniaObs, null, 2)}

EUROOPA NAABERPIIRKONNAD (eBird notable + Eesti haruldused topup, balanssitud max ${MAX_PER_COUNTRY} per riik, ${balancedMerged.length} kirjet ${byCountry.size} riigist):
${JSON.stringify(balancedMerged, null, 2)}

STATISTIKA HINTS (kasuta neid sights_stats väljas täpselt — rare/super/mega liigid):
${statsHintsBlock}

OLULINE: estonia.entries massiiv peab sisaldama TÄPSELT ${estoniaObs.length} entryt. europe.entries massiiv peab sisaldama TÄPSELT ${balancedMerged.length} entryt. ÄRA filtreeri, ära välja jäta. Rikasta iga entry koosseisus.

Koosta JSON-vastus täpselt vastavalt süsteemi juhistele.`;

  const telemetry = {
    dict_rarities_count: dict_rarities.length,
    regions: TOPUP_REGIONS.length,
    covered_by_notable: covered.size,
    targets_to_fetch: targetsToFetch,
    // Region pull: one call per region, so attempted/succeeded count regions.
    topup_attempted: TOPUP_REGIONS.length,
    topup_succeeded: regionsSucceeded,
    observations_added: topupObsCapped.length,
    topup_obs_raw_count: topupObsRaw.length,
    topup_obs_after_dedup: topupObs.length,
    topup_trimmed_by_species_cap: topupTrimmedBySpeciesCap,
    topup_trimmed_by_total_cap: topupTrimmedByTotalCap,
    per_species_per_country_cap: TOPUP_OBS_PER_SPECIES_PER_COUNTRY_CAP,
    per_species_cap: null,
    total_cap: TOPUP_TOTAL_CAP,
    duplicates_against_existing: topupDuplicatesAgainstExisting,
    duplicates_against_self: topupDuplicatesAgainstSelf,
    errors: errors.slice(0, 20),
    errors_total: errors.length,
    batch_size: null,
    batches_processed: 1,
    elapsed_ms: elapsedMs,
    aborted_at_target_idx: null,
    uncovered_remaining: 0,
    user_message_chars: user_message.length,
    europe_notable_count: europeObs.length,
    merged_europe_count: merged.length,
    balanced_merged_count: balancedMerged.length,
    country_balance: balanceTelemetry,
    mode: "region_pull",
  };

  return { user_message, balancedMerged, telemetry };
}

// ---------------------------------------------------------------------------
// node "Anthropic API"
//
// Direct fetch rather than _shared/anthropic.ts: that helper cannot return
// stop_reason (M7.3 A4), and Parse throws on it. n8n sent no temperature.
// ---------------------------------------------------------------------------

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
  model?: string;
}

async function callSonnet(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<AnthropicResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("missing_env:ANTHROPIC_API_KEY");
  const model = Deno.env.get("ANTHROPIC_MODEL_VAATLUSTE_RAPORT") ||
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
// node "Parse Anthropic Response" -- ported verbatim, including both throws.
// Unlike the elurikkus workflow there are NO recovery strategies here: a
// max_tokens stop and an unparseable body both fail the run.
// ---------------------------------------------------------------------------

const TARGET_COUNTRIES = ["PL", "RU", "LV", "LT", "BY"];

interface ParseOutput {
  period_start: string;
  period_end: string;
  intro_et: string;
  estonia_narrative_et: string;
  estonia_entries: ParsedEntry[];
  europe_narrative_et: string;
  europe_entries: ParsedEntry[];
  source_data: { estonia: Obs[]; europe: Obs[] };
  model: string;
  generation_meta: Record<string, unknown>;
}

async function parseAnthropicResponse(
  apiResp: AnthropicResponse,
  ctx: CodeCtx,
  topupTelemetry: Record<string, unknown>,
  balancedMerged: Obs[],
): Promise<ParseOutput> {
  // Check if response was truncated due to max_tokens
  if (apiResp.stop_reason === "max_tokens") {
    const inputTokens = apiResp.usage?.input_tokens ?? 0;
    const outputTokens = apiResp.usage?.output_tokens ?? 0;
    throw new Error(
      `Claude response truncated at max_tokens limit. ` +
        `Input: ${inputTokens} tokens, Output: ${outputTokens} tokens. ` +
        `The response is incomplete and cannot be parsed. ` +
        `Solution: Reduce input data size or increase max_tokens in Anthropic API node.`,
    );
  }

  const textBlock = (apiResp.content || []).find((b) => b.type === "text");
  const raw = (textBlock?.text || "").trim();

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: ParsedReport;
  try {
    parsed = JSON.parse(cleaned) as ParsedReport;
  } catch (err) {
    throw new Error(
      `Failed to parse Claude response as JSON: ${
        errMsg(err)
      }\n\nFirst 500 chars:\n${cleaned.slice(0, 500)}`,
    );
  }

  // === POST-VALIDATION: enforce Estonian names AND rarity levels from dict ===
  const overrides = { applied: 0, missing: 0, agreed: 0 };
  const rarityOverrides = { applied: 0, missing: 0, agreed: 0 };
  const missingLatins = new Set<string>();

  function overrideEntries(
    entries: ParsedEntry[] | undefined,
    defaultSource: string,
  ) {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      // Source-field enforcement -- fallback if Sonnet dropped it
      if (entry && !entry.source) entry.source = defaultSource;
      const lat = entry && entry.species_lat;
      if (!lat) continue;

      // --- Species name override ---
      const canonical = ctx.latinToEstonian && ctx.latinToEstonian[lat];
      if (!canonical) {
        overrides.missing += 1;
        missingLatins.add(lat);
      } else if (entry.species_et === canonical) {
        overrides.agreed += 1;
      } else {
        console.log(
          "[species-dict-override]",
          lat,
          'sonnet="' + entry.species_et + '"',
          'canonical="' + canonical + '"',
        );
        entry.species_et = canonical;
        overrides.applied += 1;
      }

      // --- Rarity level override ---
      // Deterministic stamp from curated dictionary; Sonnet's value overruled.
      const canonicalLevel = (ctx.latinToRarity && ctx.latinToRarity[lat]) ||
        "none";
      if (entry.rarity_level === canonicalLevel) {
        rarityOverrides.agreed += 1;
      } else {
        console.log(
          "[rarity-dict-override]",
          lat,
          'sonnet="' + entry.rarity_level + '"',
          'canonical="' + canonicalLevel + '"',
        );
        entry.rarity_level = canonicalLevel;
        rarityOverrides.applied += 1;
      }

      // Derive is_rarity from canonical rarity_level.
      entry.is_rarity = canonicalLevel !== "none";

      // If common (none), null out rarity_reason.
      if (canonicalLevel === "none") {
        entry.rarity_reason = null;
      }
    }
  }

  overrideEntries(parsed.estonia?.entries, "ebird");
  overrideEntries(parsed.europe?.entries, "ebird");

  // === Defensive observer recovery from source_data ===
  // n8n read source_data from the Topup output (merged notable+topup obs) and
  // fell back to Code; here the balanced set is passed in directly.
  const sourceEstonia = ctx.source_data?.estonia || [];
  const sourceEurope = balancedMerged || [];
  let observerRecovered = 0;
  let observerStillMissing = 0;

  function recoverObserver(entry: ParsedEntry, sourcePool: Obs[]) {
    if (!entry || entry.observer) return; // already has observer, leave alone
    const lat = String(entry.species_lat || "").toLowerCase().trim();
    const date = String(entry.date || "").slice(0, 10);
    const loc = String(entry.location || "").toLowerCase().trim();
    if (!lat) return;

    // Strict match: species_lat + date + location
    for (const src of sourcePool) {
      if (!src?.observer) continue;
      if (String(src.species_lat || "").toLowerCase().trim() !== lat) continue;
      if (String(src.date || "").slice(0, 10) !== date) continue;
      const srcLoc = String(src.location || "").toLowerCase().trim();
      if (srcLoc !== loc) continue;
      entry.observer = src.observer;
      observerRecovered += 1;
      return;
    }

    // Loose match: species_lat + date (location might differ slightly)
    for (const src of sourcePool) {
      if (!src?.observer) continue;
      if (String(src.species_lat || "").toLowerCase().trim() !== lat) continue;
      if (String(src.date || "").slice(0, 10) !== date) continue;
      entry.observer = src.observer;
      observerRecovered += 1;
      return;
    }

    // Loosest match: species_lat only (most recent)
    let bestMatch: Obs | null = null;
    let bestDate = "";
    for (const src of sourcePool) {
      if (!src?.observer) continue;
      if (String(src.species_lat || "").toLowerCase().trim() !== lat) continue;
      const d = String(src.date || "");
      if (d > bestDate) {
        bestMatch = src;
        bestDate = d;
      }
    }
    if (bestMatch) {
      entry.observer = bestMatch.observer;
      observerRecovered += 1;
    } else {
      observerStillMissing += 1;
    }
  }

  const eeEntries = parsed.estonia?.entries;
  if (Array.isArray(eeEntries)) {
    for (const e of eeEntries) recoverObserver(e, sourceEstonia);
  }
  const euEntries = parsed.europe?.entries;
  if (Array.isArray(euEntries)) {
    for (const e of euEntries) recoverObserver(e, sourceEurope);
  }

  const observerRecoveryStats = {
    recovered: observerRecovered,
    still_missing: observerStillMissing,
  };

  // === Hallucination integrity filter ===
  const sourceSpeciesLatins = new Set<string>();
  for (const o of [...sourceEstonia, ...sourceEurope]) {
    if (o?.species_lat) {
      sourceSpeciesLatins.add(String(o.species_lat).toLowerCase().trim());
    }
  }

  let hallucinatedEstonia = 0;
  let hallucinatedEurope = 0;
  const hallucinatedSamples: Array<Record<string, unknown>> = [];

  function flagHallucinated(
    entries: ParsedEntry[] | undefined,
    region: string,
  ) {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      if (!e) continue;
      const lat = String(e.species_lat || "").toLowerCase().trim();
      if (!lat) continue;
      const inSource = sourceSpeciesLatins.has(lat);
      e.data_integrity = inSource ? "verified" : "unverified";
      if (!inSource) {
        if (region === "estonia") hallucinatedEstonia += 1;
        else hallucinatedEurope += 1;
        if (hallucinatedSamples.length < 10) {
          hallucinatedSamples.push({
            region,
            species_et: e.species_et,
            species_lat: e.species_lat,
            location: e.location,
            date: e.date,
          });
        }
      }
    }
  }

  flagHallucinated(parsed.estonia?.entries, "estonia");
  flagHallucinated(parsed.europe?.entries, "europe");

  const integrityStats = {
    estonia_hallucinated: hallucinatedEstonia,
    europe_hallucinated: hallucinatedEurope,
    total_source_species: sourceSpeciesLatins.size,
    samples: hallucinatedSamples,
  };

  console.log("[species-dict-override] summary:", JSON.stringify(overrides));
  console.log(
    "[rarity-dict-override] summary:",
    JSON.stringify(rarityOverrides),
  );

  // === post-dedup entries by composite key ===
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
  const eeDedup = dedupeEntries(parsed.estonia?.entries);
  const euDedup = dedupeEntries(parsed.europe?.entries);
  if (parsed.estonia) parsed.estonia.entries = eeDedup.kept;
  if (parsed.europe) parsed.europe.entries = euDedup.kept;
  const dedupStats = {
    estonia_removed: eeDedup.removed,
    europe_removed: euDedup.removed,
  };
  console.log("[entry-dedup] summary:", JSON.stringify(dedupStats));

  // === enrich europe entries with ee_probability_pct ===
  // get-ennustus-map is UNAUTHENTICATED today -- it lists x-webhook-secret in its
  // CORS headers but never reads it, which is why n8n's unreplaced
  // <<PASTE_VAATLUSTE_WEBHOOK_SECRET_HERE>> placeholder never caused a 401. The
  // real secret is sent here so the call stays correct if auth is ever added.
  let probRowsRaw: Array<Record<string, unknown>> = [];
  let eeFetchOk = false;
  let eeFetchError: string | null = null;
  try {
    const secret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") ?? "";
    const resp = await fetchJson(
      SUPABASE_FN_BASE + "/get-ennustus-map",
      {
        method: "GET",
        headers: {
          "X-Webhook-Secret": secret,
          Accept: "application/json",
        },
      },
      ENNUSTUS_TIMEOUT_MS,
    );
    probRowsRaw = Array.isArray(resp)
      ? resp as Array<Record<string, unknown>>
      : [];
    eeFetchOk = true;
  } catch (e) {
    eeFetchError = errMsg(e).slice(0, 200);
  }

  const eeProbabilityMap: Record<string, number> = {};
  let eeUsableRows = 0;
  for (const row of probRowsRaw) {
    if (
      row && typeof row.species_name === "string" && row.no_data !== true &&
      Number.isFinite(row.current_pct as number)
    ) {
      eeProbabilityMap[row.species_name] = Math.round(row.current_pct as number);
      eeUsableRows += 1;
    }
  }

  let entriesInTargetCountries = 0;
  let entriesEnriched = 0;
  let entriesSkippedNoMatch = 0;
  const skippedExamples: Array<Record<string, unknown>> = [];

  if (parsed && parsed.europe && Array.isArray(parsed.europe.entries)) {
    for (const entry of parsed.europe.entries) {
      const cc = String(entry.country_code || "").trim().toUpperCase();
      if (!TARGET_COUNTRIES.includes(cc)) continue;
      entriesInTargetCountries += 1;
      const sp = entry.species_et;
      if (sp && eeProbabilityMap[sp] !== undefined) {
        entry.ee_probability_pct = eeProbabilityMap[sp];
        entriesEnriched += 1;
      } else {
        entriesSkippedNoMatch += 1;
        if (skippedExamples.length < 5) {
          skippedExamples.push({ species_et: sp || null, country: cc });
        }
      }
    }
  }

  const eeProbStats = {
    fetched: eeFetchOk,
    fetch_error: eeFetchError,
    cache_total_rows: probRowsRaw.length,
    cache_usable_rows: eeUsableRows,
    species_in_cache: Object.keys(eeProbabilityMap).length,
    entries_in_target_countries: entriesInTargetCountries,
    entries_enriched: entriesEnriched,
    entries_skipped_no_match: entriesSkippedNoMatch,
    skipped_examples: skippedExamples,
  };

  console.log("[ee-probability-enrich] summary:", JSON.stringify(eeProbStats));

  const dictMeta = ctx.dictMeta || {};
  const speciesDictMeta = {
    fetched: dictMeta.fetched ?? false,
    total_items: dictMeta.totalItems ?? 0,
    items_with_latin: dictMeta.itemsWithLatin ?? 0,
    items_with_rarity: dictMeta.itemsWithRarity ?? 0,
    coverage_ratio: dictMeta.coverageRatio ?? 0,
    rarity_coverage_ratio: dictMeta.rarityCoverageRatio ?? 0,
    overrides_applied: overrides.applied,
    overrides_agreed: overrides.agreed,
    overrides_missing: overrides.missing,
    rarity_overrides_applied: rarityOverrides.applied,
    rarity_overrides_agreed: rarityOverrides.agreed,
    missing_latins: Array.from(missingLatins).sort(),
  };

  return {
    period_start: ctx.period_start,
    period_end: ctx.period_end,
    intro_et: parsed.intro_et || "",
    estonia_narrative_et: parsed.estonia?.narrative_et || "",
    estonia_entries: parsed.estonia?.entries || [],
    europe_narrative_et: parsed.europe?.narrative_et || "",
    europe_entries: parsed.europe?.entries || [],
    // As live: source_data comes from the Code stage, i.e. the pre-topup capped
    // notable set -- NOT the balanced set Sonnet actually saw.
    source_data: ctx.source_data,
    model: apiResp.model || DEFAULT_MODEL,
    generation_meta: {
      input_tokens: apiResp.usage?.input_tokens ?? null,
      output_tokens: apiResp.usage?.output_tokens ?? null,
      stop_reason: apiResp.stop_reason ?? null,
      obs_counts: ctx.obs_counts,
      trigger_source: ctx.trigger_source,
      species_dict: speciesDictMeta,
      ee_probability: eeProbStats,
      et_rarity_topup: topupTelemetry,
      entry_dedup: dedupStats,
      observer_recovery: observerRecoveryStats,
      integrity: integrityStats,
    },
  };
}

// ---------------------------------------------------------------------------
// node "Insert into Supabase"
//
// insert-vaatluste-raport authenticates with N8N_VAATLUSTE_WEBHOOK_SECRET, a
// DIFFERENT env var from this function's own inbound secret. It answers 201, so
// success is res.ok, never === 200.
// ---------------------------------------------------------------------------

interface InsertResponse {
  inserted?: boolean;
  id?: string;
}

async function insertRaport(payload: ParseOutput): Promise<InsertResponse> {
  const secret = Deno.env.get("N8N_VAATLUSTE_WEBHOOK_SECRET");
  if (!secret) throw new Error("missing_env:N8N_VAATLUSTE_WEBHOOK_SECRET");
  return await fetchJson(
    SUPABASE_FN_BASE + "/insert-vaatluste-raport",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify({
        period_start: payload.period_start,
        period_end: payload.period_end,
        intro_et: payload.intro_et,
        estonia_narrative_et: payload.estonia_narrative_et,
        estonia_entries: payload.estonia_entries,
        europe_narrative_et: payload.europe_narrative_et,
        europe_entries: payload.europe_entries,
        source_data: payload.source_data,
        model: payload.model,
        generation_meta: payload.generation_meta,
      }),
    },
    INSERT_TIMEOUT_MS,
  ) as InsertResponse;
}

// ---------------------------------------------------------------------------
// The background run
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
      obs_counts: ctx.obs_counts,
      dict_fetched: ctx.dictMeta.fetched === true,
      dict_rarities: ctx.dict_rarities.length,
      ebird_errors: ctx.ebirdErrors,
      timings,
    };
    await heartbeat(sb, orch, "code_done");

    // --- stage 2: node "Topup fetch + merge" ------------------------------
    await heartbeat(sb, orch, "topup");
    const t1 = Date.now();
    const topup = await runTopup(ctx);
    timings.topup_ms = Date.now() - t1;
    orch.state = {
      ...orch.state,
      timings,
      topup: {
        mode: topup.telemetry.mode,
        topup_succeeded: topup.telemetry.topup_succeeded,
        observations_added: topup.telemetry.observations_added,
        balanced_merged_count: topup.telemetry.balanced_merged_count,
        errors_total: topup.telemetry.errors_total,
      },
    };
    await heartbeat(sb, orch, "topup_done");

    // Budget guard: never start a Sonnet call we cannot finish.
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
        `[vaatluste-orch] budget exhausted before sonnet: ${elapsed} ms`,
      );
      return;
    }

    // --- stage 3: node "Anthropic API" ------------------------------------
    await heartbeat(sb, orch, "sonnet");
    const t2 = Date.now();
    const maxTokens = opts.dryRun && opts.maxTokensOverride
      ? opts.maxTokensOverride
      : MAX_TOKENS;
    const apiResp = await callSonnet(
      ctx.system_prompt,
      topup.user_message,
      maxTokens,
      sonnetTimeout,
    );
    calls = 1;
    timings.sonnet_ms = Date.now() - t2;
    orch.state = {
      ...orch.state,
      timings,
      stop_reason: apiResp.stop_reason ?? null,
      output_tokens: apiResp.usage?.output_tokens ?? null,
    };
    await heartbeat(sb, orch, "sonnet_done");

    // --- stage 4: node "Parse Anthropic Response" -------------------------
    const t3 = Date.now();
    const payload = await parseAnthropicResponse(
      apiResp,
      ctx,
      topup.telemetry,
      topup.balancedMerged,
    );
    timings.parse_ms = Date.now() - t3;
    orch.state = {
      ...orch.state,
      timings,
      entries: {
        estonia: payload.estonia_entries.length,
        europe: payload.europe_entries.length,
      },
    };
    await heartbeat(sb, orch, "parse_done");

    // --- stage 5: node "Insert into Supabase" -----------------------------
    let insert: InsertResponse | null = null;
    if (opts.dryRun) {
      orch.state = {
        ...orch.state,
        preview: {
          intro_et: payload.intro_et,
          estonia: payload.estonia_entries.length,
          europe: payload.europe_entries.length,
          generation_meta: payload.generation_meta,
        },
      };
      await heartbeat(sb, orch, "insert_skipped");
    } else {
      await heartbeat(sb, orch, "insert");
      const t4 = Date.now();
      insert = await insertRaport(payload);
      timings.insert_ms = Date.now() - t4;
    }

    // --- stage 6: close ---------------------------------------------------
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
      `[vaatluste-orch] done run_id=${orch.runId} ee=${payload.estonia_entries.length} eu=${payload.europe_entries.length} elapsed=${
        elapsedOf(orch)
      }`,
    );
  } catch (e) {
    const message = errMsg(e);
    console.error(`[vaatluste-orch] failed stage=${orch.stage}`, message);
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
      console.error("[vaatluste-orch] close failed", errMsg(closeErr));
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

  const rowId = await openRun(sb, "vaatluste-raport", runId, 0, baseState);
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

  const work = run(sb, orch, { dryRun, maxTokensOverride });
  const registered = keepAlive(work);
  if (!registered) {
    work.catch((e) =>
      console.error("[vaatluste-orch] unawaited run", errMsg(e))
    );
  }

  console.log(
    `[vaatluste-orch] start run_id=${runId} row=${rowId} source=${source} dry_run=${dryRun} wait_until=${baseState.wait_until}`,
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
