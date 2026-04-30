import { getAnthropicConfig, translateToEstonianClaude } from "./anthropic.ts";
import { fixBirdNamesInText } from "./bird-names-et.ts";

export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export function getOpenAIConfig(): OpenAIConfig | null {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim() || "";
  if (!apiKey) return null;
  const model = Deno.env.get("OPENAI_MODEL") || Deno.env.get("OPENAI_TRANSLATION_MODEL") || "gpt-4.1-mini";
  return { apiKey, model };
}

export async function translateToEstonian(input: {
  title: string;
  body: string;
  sourceLang: string;
}): Promise<{ title_et: string; body_et: string }> {
  // Prefer Claude for better bird name translations
  const anthropicCfg = getAnthropicConfig();
  if (anthropicCfg) {
    try {
      return await translateToEstonianClaude(input);
    } catch (e) {
      console.warn("[translate] Claude failed, falling back to OpenAI:", (e as Error).message);
    }
  }

  const cfg = getOpenAIConfig();
  if (!cfg) throw new Error("Translation not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You translate bird-related news to Estonian for an Estonian birdwatching audience. Write NATURAL, FLUENT Estonian — not literal word-for-word output.\n\nSTRUCTURAL RULES (apply BEFORE the species mappings below):\n\n1) LATIN BINOMIALS (e.g. \"Vanellus gregarius\", \"Pelecanus crispus\") — preserve EXACTLY. Never translate, decline, or change capitalization. Output as PLAIN TEXT — no markdown italics (*X* or _X_), no <i> tags, no bold. Only preserve such formatting if source had it in that exact form.\n\n2) NEVER CALQUE BIRD NAMES. Estonian bird names often bear no resemblance to source-language names. Wrong calques to avoid:\n❌ \"Dalmaatsia pelikan\" (from \"Dalmatian Pelican\") → ✅ käharpelikan\n❌ \"rabakonnakotkas\" → ✅ väike-konnakotkas\nIf a species is NOT in the dictionary below and you are not 100% certain, KEEP THE LATIN NAME (e.g. \"<i>Sylvia melanocephala</i>\") rather than invent an Estonian name.\n\n3) ESTONIAN COMPOUND NAMES are inconsistent: some hyphenated (väike-konnakotkas, must-toonekurg), some one word (stepikiivitaja, käharpelikan, kalakotkas). When unsure, use the Latin name.\n\n4) PLACE NAMES — preserve original spelling. Do NOT estonianize foreign toponyms (\"Zarszyn\" stays \"Zarszyn\"). Use Estonian forms only for major exonyms: Helsinki→Helsingi, Riga→Riia, Warszawa→Varssavi.\n\n5) SOURCE-LANGUAGE MORPHOLOGY:\n• FINNISH: never leak Finnish stems. \"lintu-\" → \"lind-/linnu-\" (e.g. \"lintuvaatlus\" → \"linnuvaatlus\"). \"Suomi\" → \"Soome\".\n• LATVIAN: Latvian endings are not Estonian. \"Engures ezerā\" → \"Engure järvel\".\n• POLISH: do not calque compounds. Preserve diacritics (ł ą ę ś ż) exactly.\n• DUTCH/FLEMISH: \"Vlaanderen\" → \"Flandria\", \"Wallonië\" → \"Valloonia\".\n\n6) FAITHFULNESS — translate every sentence. Do NOT summarize, condense, or omit details. Each fact must appear in the output. EXCEPTION: faithfulness does NOT permit inventing Estonian species names. If a species is not in the dictionary below, use the Latin binomial — never calque qualifiers like \"spur-winged\" → \"kannus-\" or \"white-tailed\" → \"valgesaba-\". The Estonian name often has nothing in common with the source name (Spur-winged Lapwing = valgekael-kiivitaja). Better to keep the Latin name than to invent.\n\n7) TONE — natural Estonian birding-news prose, present tense, standard verb forms (\"nähti\", \"leiti\", \"jäädvustati\") not creative paraphrases.\n\n8) BILINGUAL SOURCES — if the source has the same content in two languages (e.g. Polish + English), produce ONE Estonian translation combining all details from both versions. Do not output twice.\n\nUse correct official Estonian bird names (eesti linnunimed) — do NOT literally translate bird common names from the source language. For example: White-tailed Eagle = merikotkas, Crane = sookurg, White Stork = valge-toonekurg, Osprey = kalakotkas, Barnacle Goose = valgepõsk-lagle, Bean Goose = suur-laukhani, Lesser Spotted Eagle = väike-konnakotkas, Greater Spotted Eagle = suur-konnakotkas, Montagu's Harrier = stepi-loorkull, Hen Harrier = soo-loorkull, Marsh Harrier = roo-loorkull, Common Buzzard = hiireviu, Honey Buzzard = herilaseviu, Merlin = piiritaja, Hobby = lõopistrik, Peregrine = rabapistrik, Golden Eagle = kaljukotkas, Goshawk = kanakull, Sparrowhawk = raudkull, Red-backed Shrike = punaselg-õgija, Great Grey Shrike = hallõgija, Wryneck = käosulane, Black Woodpecker = musträhn, Nightjar = öösorr, Cuckoo = kägu, Swift = piiritaja, Roller = siniraag, Bee-eater = mesilasenäpp, Hoopoe = vaenukägu, Corncrake = rukkirääk, Spotted Crake = täpikhuik, Coot = lauk, Common Sandpiper = jõgitilder, Green Sandpiper = metstilder, Wood Sandpiper = mudatilder, Lapwing = kiivitaja, Curlew = suurkoovitaja, Woodcock = metskurvits, Snipe = rohunepp, Black-tailed Godwit = mustsaba-vigle, Ruff = tuttvart, Dunlin = soorüdi, Ringed Plover = liivatüll, Golden Plover = rüüt, Avocet = naaskelnokk, Oystercatcher = merisk, Common Tern = jõgitiir, Arctic Tern = randtiir, Barn Swallow = suitsupääsuke, House Martin = räästapääsuke, Sand Martin = kaldapääsuke, Skylark = põldlõoke, Meadow Pipit = niidukiur, Tree Pipit = metskiur, Yellow Wagtail = linavästrik, White Wagtail = jõgivästrik, Redstart = lepalind, Wheatear = kivitäks, Whinchat = kadakatäks, Stonechat = must-lepalind, Robin = punarind, Nightingale = ööbik, Bluethroat = sinirind, Fieldfare = hallrästas, Song Thrush = laulurästas, Blackbird = musträstas, Ring Ouzel = kaelusrästas, Reed Warbler = aed-roolind, Sedge Warbler = kõrkja-roolind, Willow Warbler = salu-lehelind, Chiffchaff = mets-lehelind, Blackcap = mustpea-põõsalind, Whitethroat = aed-põõsalind, Spotted Flycatcher = hall-kärbsenäpp, Pied Flycatcher = must-kärbsenäpp, Red-breasted Flycatcher = kaelus-kärbsenäpp, Starling = kuldnokk, Ortolan = aed-tsiitsitaja, Yellowhammer = talvike, Linnet = kanepilind, Siskin = siisike, Goldfinch = ohakalind, Greenfinch = rohevint, Hawfinch = suurnokk-vint, Crossbill = kuuse-käbilind, Bullfinch = leevike, Rosefinch = karmiinleevike, Chaffinch = metsvint, Brambling = põhjavint, Dalmatian Pelican = käharpelikan, Pectoral Sandpiper = alverüdi, Sociable Lapwing = stepikiivitaja, Caspian Tern = räusktiir, Mediterranean Gull = mustpea-kajakas, Yellow-legged Gull = vahemerekajakas, Caspian Gull = stepikajakas, Pallid Harrier = aru-loorkull, Long-tailed Tit = sabatihane, Coal Tit = musttihane, Crested Tit = tutt-tihane, Goldcrest = pöialpoiss, Firecrest = punapea-pöialpoiss, Spur-winged Lapwing = valgekael-kiivitaja. Preserve URLs, hashtags, @mentions, numbers, Latin species names (in parentheses or italics), proper nouns, emojis, and line breaks exactly as-is. Return JSON only with keys title_et and body_et.",
        },
        {
          role: "user",
          content:
            `source_lang=${input.sourceLang}\ntarget_lang=et\n\nTITLE:\n${input.title || ""}\n\nBODY:\n${input.body || ""}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI translation failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    title_et: fixBirdNamesInText(typeof parsed?.title_et === "string" ? parsed.title_et : ""),
    body_et: fixBirdNamesInText(typeof parsed?.body_et === "string" ? parsed.body_et : ""),
  };
}
