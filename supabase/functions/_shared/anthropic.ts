import { fixBirdNamesInText } from "./bird-names-et.ts";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export function getAnthropicConfig(): AnthropicConfig | null {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim() || "";
  if (!apiKey) return null;
  const model = Deno.env.get("ANTHROPIC_TRANSLATION_MODEL") || "claude-haiku-4-5-20251001";
  return { apiKey, model };
}

export async function callClaude(
  config: AnthropicConfig,
  system: string,
  userMessage: string,
  maxTokens = 2048,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Claude API error: ${res.status} ${details.slice(0, 400)}`);
  }

  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

function parseJsonFromText(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error(`Failed to parse JSON from Claude response: ${text.slice(0, 200)}`);
  }
}

const TRANSLATION_SYSTEM_PROMPT = `You are translating bird-related news articles to Estonian.
CRITICAL RULE: Use correct official Estonian bird names (eesti linnunimed). NEVER literally translate bird common names from Polish, English, or any other language. Bird species have specific established Estonian names that must be used.
Key species mappings (Polish → Estonian):
bielik/White-tailed Eagle = merikotkas, żuraw/Crane = sookurg, bocian biały/White Stork = valge-toonekurg, rybołów/Osprey = kalakotkas, bernikla białolica/Barnacle Goose = valgepõsk-lagle, gęś zbożowa/Bean Goose = suur-laukhani, orlik krzykliwy/Lesser Spotted Eagle = väike-konnakotkas, orlik grubodzioby/Greater Spotted Eagle = suur-konnakotkas, błotniak łąkowy/Montagu's Harrier = stepi-loorkull, błotniak zbożowy/Hen Harrier = soo-loorkull, błotniak stawowy/Marsh Harrier = roo-loorkull, myszołów/Common Buzzard = hiireviu, trzmielojad/Honey Buzzard = herilaseviu, drzemlik/Merlin = piiritaja, kobuz/Hobby = lõopistrik, sokół wędrowny/Peregrine = rabapistrik, orzeł przedni/Golden Eagle = kaljukotkas, jastrząb/Goshawk = kanakull, krogulec/Sparrowhawk = raudkull, gąsiorek/Red-backed Shrike = punaselg-õgija, srokosz/Great Grey Shrike = hallõgija, krętogłów/Wryneck = käosulane, dzięcioł czarny/Black Woodpecker = musträhn, lelek/Nightjar = öösorr, kukułka/Cuckoo = kägu, jerzyk/Swift = piiritaja, kraska/Roller = siniraag, żołna/Bee-eater = mesilasenäpp, dudek/Hoopoe = vaenukägu, derkacz/Corncrake = rukkirääk, kropiatka/Spotted Crake = täpikhuik, łyska/Coot = lauk, brodziec piskliwy/Common Sandpiper = jõgitilder, samotnik/Green Sandpiper = metstilder, łęczak/Wood Sandpiper = mudatilder, czajka/Lapwing = kiivitaja, kulik wielki/Curlew = suurkoovitaja, słonka/Woodcock = metskurvits, kszyk/Snipe = rohunepp, rycyk/Black-tailed Godwit = mustsaba-vigle, batalion/Ruff = tuttvart, biegus zmienny/Dunlin = soorüdi, sieweczka obrożna/Ringed Plover = liivatüll, siewka złota/Golden Plover = rüüt, szablodziób/Avocet = naaskelnokk, ostrygojad/Oystercatcher = merisk, rybitwa rzeczna/Common Tern = jõgitiir, rybitwa popielata/Arctic Tern = randtiir, dymówka/Barn Swallow = suitsupääsuke, oknówka/House Martin = räästapääsuke, brzegówka/Sand Martin = kaldapääsuke, skowronek/Skylark = põldlõoke, świergotek łąkowy/Meadow Pipit = niidukiur, świergotek drzewny/Tree Pipit = metskiur, pliszka żółta/Yellow Wagtail = linavästrik, pliszka siwa/White Wagtail = jõgivästrik, pleszka/Redstart = lepalind, białorzytka/Wheatear = kivitäks, pokrzywnica/Whinchat = kadakatäks, kląskawka/Stonechat = must-lepalind, rudzik/Robin = punarind, słowik/Nightingale = ööbik, podróżniczek/Bluethroat = sinirind, kwiczoł/Fieldfare = hallrästas, śpiewak/Song Thrush = laulurästas, kos/Blackbird = musträstas, droździk/Ring Ouzel = kaelusrästas, trzciniak/Reed Warbler = aed-roolind, rokitniczka/Sedge Warbler = kõrkja-roolind, piecuszek/Willow Warbler = salu-lehelind, pierwiosnek/Chiffchaff = mets-lehelind, kapturka/Blackcap = mustpea-põõsalind, cierniówka/Whitethroat = aed-põõsalind, muchołówka szara/Spotted Flycatcher = hall-kärbsenäpp, muchołówka żałobna/Pied Flycatcher = must-kärbsenäpp, muchołówka mała/Red-breasted Flycatcher = kaelus-kärbsenäpp, szpak/Starling = kuldnokk, ortolan/Ortolan = aed-tsiitsitaja, trznadel/Yellowhammer = talvike, makolągwa/Linnet = kanepilind, czyż/Siskin = siisike, szczygieł/Goldfinch = ohakalind, dzwoniec/Greenfinch = rohevint, grubodziób/Hawfinch = suurnokk-vint, krzyżodziób świerkowy/Crossbill = kuuse-käbilind, gil/Bullfinch = leevike, dzwoniec/Rosefinch = karmiinleevike, zięba/Chaffinch = metsvint, jer/Brambling = põhjavint, łabędź niemy/Mute Swan = kühmnokk-luik, łabędź krzykliwy/Whooper Swan = laululuik, czapla siwa/Grey Heron = hallhaigur, czapla biała/Great Egret = hõbehaigur, kormoran/Cormorant = kormoran, gęś białoczelna/White-fronted Goose = suur-laukhani, kaczka krzyżówka/Mallard = sinikael-part, cyranka/Garganey = rägapart, cyraneczka/Teal = piilpart, czernica/Tufted Duck = tuttvart, gągoł/Goldeneye = sõtkas, nurogęś/Goosander = jääkoskel, szlachar/Red-breasted Merganser = rohukoskel, perkoz dwuczuby/Great Crested Grebe = tuttpütt, perkoz rdzawoszyi/Red-necked Grebe = hallpõsk-pütt, mewa śmieszka/Black-headed Gull = naerukajakas, mewa srebrzysta/Herring Gull = hõbekajakas, gołąb miejski/Feral Pigeon = kodutuvi, grzywacz/Woodpigeon = kaelustuvi, turkawka/Turtle Dove = kaelus-turteltuvi, pustułka/Kestrel = tuuletallaja, kobczyk/Red-footed Falcon = punajalg-pistrik, kania ruda/Red Kite = puna-harksaba, kania czarna/Black Kite = must-harksaba
If you encounter a bird species not in this list, use your knowledge of Estonian ornithology to find the correct Estonian name. When uncertain, keep the original name and add the Latin name in parentheses.
Preserve URLs, hashtags, @mentions, numbers, Latin species names (in parentheses or italics), proper nouns, emojis, and line breaks exactly as-is.
Return JSON only: {"title_et": "...", "body_et": "..."}`;

export async function translateToEstonianClaude(input: {
  title: string;
  body: string;
  sourceLang: string;
}): Promise<{ title_et: string; body_et: string }> {
  const cfg = getAnthropicConfig();
  if (!cfg) throw new Error("Anthropic API not configured");

  const userMessage = `source_lang=${input.sourceLang}\ntarget_lang=et\n\nTITLE:\n${input.title || ""}\n\nBODY:\n${input.body || ""}`;
  const text = await callClaude(cfg, TRANSLATION_SYSTEM_PROMPT, userMessage);
  const parsed = parseJsonFromText(text);

  return {
    title_et: fixBirdNamesInText(typeof parsed?.title_et === "string" ? parsed.title_et : ""),
    body_et: fixBirdNamesInText(typeof parsed?.body_et === "string" ? parsed.body_et : ""),
  };
}

export async function classifyLanguageClaude(title: string, body: string): Promise<string> {
  const cfg = getAnthropicConfig();
  if (!cfg) throw new Error("Anthropic API not configured");

  const text = await callClaude(
    cfg,
    "Detect the language of this text. Respond with ONLY a two-letter ISO 639-1 language code, nothing else.",
    `TITLE:\n${title}\n\nBODY:\n${body}`,
    32,
  );

  return text.trim().toLowerCase().slice(0, 2);
}

export const BIRD_TRANSLATION_SYSTEM_HINT =
  "When translating bird-related content, use correct Estonian bird names (eesti linnunimed), never literally translate bird common names.";

export function getSimpleTranslationSystemPrompt(targetLang: string): string {
  return (
    `You are a translation engine specializing in bird-related content. Translate the user text to ${targetLang}. ` +
    `Use correct Estonian bird names (eesti linnunimed), never literally translate bird common names. ` +
    `Return ONLY the translation, preserve paragraphs, no commentary.`
  );
}
