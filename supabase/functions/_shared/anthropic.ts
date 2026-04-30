import { fixBirdNamesInText } from "./bird-names-et.ts";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export function getAnthropicConfig(): AnthropicConfig | null {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim() || "";
  if (!apiKey) return null;
  const model = Deno.env.get("ANTHROPIC_TRANSLATION_MODEL") || "claude-sonnet-4-6";
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
      temperature: 0.2,
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

const TRANSLATION_SYSTEM_PROMPT = `You translate bird-related news articles to Estonian for an Estonian birdwatching audience. Write NATURAL, FLUENT Estonian — not literal word-for-word output.

STRUCTURAL RULES (apply BEFORE consulting the species mappings below):

1) LATIN BINOMIALS (e.g. "Vanellus gregarius", "Haliaeetus albicilla") — preserve EXACTLY. Never translate, decline, or change capitalization. Keep italics/parentheses if the source has them.

2) COMPOUND SPECIES NAMES — Estonian uses HYPHENS: "väike-konnakotkas", "must-toonekurg", "stepi-loorkull", "valgepõsk-lagle", "mustsaba-vigle", "punajalg-tilder". When the source has a qualified species (e.g. PL "czajka stepowa", EN "sociable lapwing", LV "steppes ķīvīte"), produce the Estonian compound form (here: "stepikiivitaja"). If a species is NOT in the dictionary below and you are unsure, KEEP THE LATIN NAME VISIBLE rather than guess.

3) PLACE NAMES — preserve original spelling. Do NOT estonianize Polish/Finnish/Latvian/Dutch toponyms. "Zarszyn" stays "Zarszyn". Use Estonian forms only for established exonyms: "Helsinki" → "Helsingi", "Riga" → "Riia", "Warszawa" → "Varssavi", "Sankt-Peterburg" → "Peterburi". Add "(piirkond)" or "(maakond)" only when natural.

4) SOURCE-LANGUAGE MORPHOLOGY:
   • FINNISH: never carry Finnish stems into Estonian. "lintu-" → "lind-" or "linnu-" (e.g. "lintuvaatlus" → "linnuvaatlus", NOT "lintuvaatlus"). "Suomi" → "Soome".
   • LATVIAN: Latvian declensional endings are not Estonian. "Engures ezerā" → "Engure järvel" (Estonian inessive), not "Engures järvel".
   • POLISH: do not calque compounds literally. Preserve diacritics (ł ą ę ś ż) in proper names.
   • DUTCH/FLEMISH: "Vlaanderen" → "Flandria", "Wallonië" → "Valloonia".

5) TONE — natural Estonian birding-news prose, present tense for current events. If a literal translation reads awkwardly, RESTRUCTURE the sentence so it reads naturally in Estonian.

CRITICAL RULE: Use correct official Estonian bird names (eesti linnunimed). NEVER literally translate bird common names from Polish, English, or any other language. Bird species have specific established Estonian names that must be used.
Key species mappings (Polish → Estonian):
bielik/White-tailed Eagle = merikotkas, żuraw/Crane = sookurg, bocian biały/White Stork = valge-toonekurg, rybołów/Osprey = kalakotkas, bernikla białolica/Barnacle Goose = valgepõsk-lagle, gęś zbożowa/Bean Goose = suur-laukhani, orlik krzykliwy/Lesser Spotted Eagle = väike-konnakotkas, orlik grubodzioby/Greater Spotted Eagle = suur-konnakotkas, błotniak łąkowy/Montagu's Harrier = stepi-loorkull, błotniak zbożowy/Hen Harrier = soo-loorkull, błotniak stawowy/Marsh Harrier = roo-loorkull, myszołów/Common Buzzard = hiireviu, trzmielojad/Honey Buzzard = herilaseviu, drzemlik/Merlin = piiritaja, kobuz/Hobby = lõopistrik, sokół wędrowny/Peregrine = rabapistrik, orzeł przedni/Golden Eagle = kaljukotkas, jastrząb/Goshawk = kanakull, krogulec/Sparrowhawk = raudkull, gąsiorek/Red-backed Shrike = punaselg-õgija, srokosz/Great Grey Shrike = hallõgija, krętogłów/Wryneck = käosulane, dzięcioł czarny/Black Woodpecker = musträhn, lelek/Nightjar = öösorr, kukułka/Cuckoo = kägu, jerzyk/Swift = piiritaja, kraska/Roller = siniraag, żołna/Bee-eater = mesilasenäpp, dudek/Hoopoe = vaenukägu, derkacz/Corncrake = rukkirääk, kropiatka/Spotted Crake = täpikhuik, łyska/Coot = lauk, brodziec piskliwy/Common Sandpiper = jõgitilder, samotnik/Green Sandpiper = metstilder, łęczak/Wood Sandpiper = mudatilder, czajka/Lapwing = kiivitaja, kulik wielki/Curlew = suurkoovitaja, słonka/Woodcock = metskurvits, kszyk/Snipe = rohunepp, rycyk/Black-tailed Godwit = mustsaba-vigle, batalion/Ruff = tuttvart, biegus zmienny/Dunlin = soorüdi, sieweczka obrożna/Ringed Plover = liivatüll, siewka złota/Golden Plover = rüüt, szablodziób/Avocet = naaskelnokk, ostrygojad/Oystercatcher = merisk, rybitwa rzeczna/Common Tern = jõgitiir, rybitwa popielata/Arctic Tern = randtiir, dymówka/Barn Swallow = suitsupääsuke, oknówka/House Martin = räästapääsuke, brzegówka/Sand Martin = kaldapääsuke, skowronek/Skylark = põldlõoke, świergotek łąkowy/Meadow Pipit = niidukiur, świergotek drzewny/Tree Pipit = metskiur, pliszka żółta/Yellow Wagtail = linavästrik, pliszka siwa/White Wagtail = jõgivästrik, pleszka/Redstart = lepalind, białorzytka/Wheatear = kivitäks, pokrzywnica/Whinchat = kadakatäks, kląskawka/Stonechat = must-lepalind, rudzik/Robin = punarind, słowik/Nightingale = ööbik, podróżniczek/Bluethroat = sinirind, kwiczoł/Fieldfare = hallrästas, śpiewak/Song Thrush = laulurästas, kos/Blackbird = musträstas, droździk/Ring Ouzel = kaelusrästas, trzciniak/Reed Warbler = aed-roolind, rokitniczka/Sedge Warbler = kõrkja-roolind, piecuszek/Willow Warbler = salu-lehelind, pierwiosnek/Chiffchaff = mets-lehelind, kapturka/Blackcap = mustpea-põõsalind, cierniówka/Whitethroat = aed-põõsalind, muchołówka szara/Spotted Flycatcher = hall-kärbsenäpp, muchołówka żałobna/Pied Flycatcher = must-kärbsenäpp, muchołówka mała/Red-breasted Flycatcher = kaelus-kärbsenäpp, szpak/Starling = kuldnokk, ortolan/Ortolan = aed-tsiitsitaja, trznadel/Yellowhammer = talvike, makolągwa/Linnet = kanepilind, czyż/Siskin = siisike, szczygieł/Goldfinch = ohakalind, dzwoniec/Greenfinch = rohevint, grubodziób/Hawfinch = suurnokk-vint, krzyżodziób świerkowy/Crossbill = kuuse-käbilind, gil/Bullfinch = leevike, dzwoniec/Rosefinch = karmiinleevike, zięba/Chaffinch = metsvint, jer/Brambling = põhjavint, łabędź niemy/Mute Swan = kühmnokk-luik, łabędź krzykliwy/Whooper Swan = laululuik, czapla siwa/Grey Heron = hallhaigur, czapla biała/Great Egret = hõbehaigur, kormoran/Cormorant = kormoran, gęś białoczelna/White-fronted Goose = suur-laukhani, kaczka krzyżówka/Mallard = sinikael-part, cyranka/Garganey = rägapart, cyraneczka/Teal = piilpart, czernica/Tufted Duck = tuttvart, gągoł/Goldeneye = sõtkas, nurogęś/Goosander = jääkoskel, szlachar/Red-breasted Merganser = rohukoskel, perkoz dwuczuby/Great Crested Grebe = tuttpütt, perkoz rdzawoszyi/Red-necked Grebe = hallpõsk-pütt, mewa śmieszka/Black-headed Gull = naerukajakas, mewa srebrzysta/Herring Gull = hõbekajakas, gołąb miejski/Feral Pigeon = kodutuvi, grzywacz/Woodpigeon = kaelustuvi, turkawka/Turtle Dove = kaelus-turteltuvi, pustułka/Kestrel = tuuletallaja, kobczyk/Red-footed Falcon = punajalg-pistrik, kania ruda/Red Kite = puna-harksaba, kania czarna/Black Kite = must-harksaba
Key species mappings (Finnish → Estonian):
selkälokki = tõmmukajakas, merikotka = merikotkas, kurki = sookurg, kottarainen = kuldnokk, haarahaukka = puna-harksaba, varpushaukka = raudkull, kanahaukka = kanakull, hiirihaukka = hiireviu, piekana = karvasjalg-viu, mehiläishaukka = herilaseviu, sääksi = kalakotkas, maakotka = kaljukotkas, kiljukotka = väike-konnakotkas, pikkukiljukotka = suur-konnakotkas, muuttohaukka = rabapistrik, nuolihaukka = lõopistrik, ampuhaukka = piiritaja, tuulihaukka = tuuletallaja, punajalkahaukka = punajalg-pistrik, valkoposkihanhi = valgepõsk-lagle, merihanhi = hallhani, metsähanhi = suur-laukhani, lyhytnokkahanhi = lühinokk-hani, valkootsahanhi = suur-laukhani, kiljuhanhi = kiljuhani, sepelhanhi = mustlagle, punakaulahanhi = punakael-lagle, kanadanhanhi = kanada lagle, laulujoutsen = laululuik, kyhmyjoutsen = kühmnokk-luik, pikkujoutsen = väikeluik, haahka = hahk, alli = aul, pilkkasiipi = tõmmuvaeras, mustalintu = mustvaeras, tukkasotka = tuttvart, punasotka = punapea-vart, lapasotka = merivart, telkkä = sõtkas, isokoskelo = jääkoskel, tukkakoskelo = rohukoskel, uivelo = väikekoskel, sinisorsa = sinikael-part, tavi = piilpart, haapana = viupart, jouhisorsa = sõtkas, lapasorsa = luitsnokk-part, heinätavi = rägapart, harmaahaigara = hallhaigur, jalohaikara = hõbehaigur, silkkihaikara = siidhaigur, kattohaikara = purpurhaigur, merimetso = kormoran, kaulushaikara = hüüp, valkohaikara = valge-toonekurg, mustahaikara = must-toonekurg, kuovi = suurkoovitaja, pikkukuovi = väikekoovitaja, lehtokurppa = metskurvits, taivaanvuohi = rohunepp, jänkäkurppa = mudanepp, punajalkaviklo = punajalg-tilder, valkoviklo = heletilder, liro = mudatilder, metsäviklo = metstilder, rantasipi = jõgitilder, suokukko = tuttvart, töyhtöhyyppä = kiivitaja, tylli = liivatüll, kapustarinta = rüüt, meriharakka = merisk, avosetti = naaskelnokk, kalatiira = jõgitiir, lapintiira = randtiir, räyskä = räusktiir, naurulokki = naerukajakas, harmaalokki = hõbekajakas, merilokki = merikajakas, kalalokki = kalakajakas, haarapääsky = suitsupääsuke, räystäspääsky = räästapääsuke, törmäpääsky = kaldapääsuke, kiuru = põldlõoke, niittykirvinen = niidukiur, metsäkirvinen = metskiur, keltavästäräkki = linavästrik, västäräkki = jõgivästrik, punarinta = punarind, satakieli = ööbik, sinirinta = sinirind, leppälintu = lepalind, pensastasku = kadakatäks, kivitasku = kivitäks, mustarastas = musträstas, räkättirastas = hallrästas, laulurastas = laulurästas, punakylkirastas = vainurästas, kulorastas = hoburästas, ruokokerttunen = kõrkja-roolind, rytikertunen = aed-roolind, pajulintu = salu-lehelind, tiltaltti = mets-lehelind, mustapääkerttu = mustpea-põõsalind, pensaskerttu = aed-põõsalind, hernekerttu = väike-põõsalind, kirjosieppo = must-kärbsenäpp, harmaasieppo = hall-kärbsenäpp, pikkusieppo = kaelus-kärbsenäpp, talitiainen = rasvatihane, sinitiainen = sinitihane, kuusitiainen = musttihane, hömötiainen = põhjatihane, töyhtötiainen = tutt-tihane, pyrstötiainen = sabatihane, pikkulepinkäinen = punaselg-õgija, isolepinkäinen = hallõgija, käenpiika = käosulane, palokärki = musträhn, käpytikka = suur-kirjurähn, pikkutikka = väike-kirjurähn, harmaapäätikka = hallpea-rähn, vihertikka = roherähn, kehrääjä = öösorr, käki = kägu, tervapääsky = piiritaja, kuningaskalastaja = jäälind, mehiläissyöjä = mesilasenäpp, sininärhi = siniraag, harjalintu = vaenukägu, ruisrääkkä = rukkirääk, luhtahuitti = täpikhuik, nokikana = lauk, sepelkyyhky = kaelustuvi, turturikyyhky = kaelus-turteltuvi, huuhkaja = kassikakk, varpuspöllö = värbkakk, helmipöllö = karvasjalg-kakk, hiiripöllö = loorkakk, tunturipöllö = lumekakk, viirupöllö = händkakk, lapinpöllö = habekakk, sarvipöllö = kõrvukräts, suopöllö = soo-loorkull, metso = metsis, teeri = teder, pyy = laanepüü, riekko = rabapüü, peltopyy = nurmkana, viiriäinen = põldvutt, peippo = metsvint, järripeippo = põhjavint, tikli = ohakalind, vihervarpunen = rohevint, tuhkimo = siisike, hemppo = kanepilind, urpiainen = urvalind, pikkukäpylintu = kuuse-käbilind, isokäpylintu = männi-käbilind, punatulkku = leevike, punavarpunen = karmiinleevike, nokkavarpunen = suurnokk-vint, keltasirkku = talvike, peltosirkku = aed-tsiitsitaja, pajusirkku = rootsiitsitaja, tilhi = siidisaba, kuhankeittäjä = peoleo
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
  return `You translate bird-related news content to ${targetLang} for an Estonian birdwatching audience. Write NATURAL, FLUENT ${targetLang.toUpperCase()} — not literal word-for-word output.

STRUCTURAL RULES (apply BEFORE consulting the species mappings):

1) LATIN BINOMIALS (e.g. "Vanellus gregarius", "Haliaeetus albicilla") — preserve EXACTLY. Never translate, decline, or change capitalization. Keep italics/parentheses if present.

2) COMPOUND SPECIES NAMES — Estonian uses HYPHENS: "väike-konnakotkas", "must-toonekurg", "stepi-loorkull", "valgepõsk-lagle", "mustsaba-vigle", "punajalg-tilder". When the source has a qualified species (e.g. PL "czajka stepowa", EN "sociable lapwing", LV "steppes ķīvīte"), produce the Estonian compound form (here: "stepikiivitaja"). If unsure of the exact name, KEEP THE LATIN NAME VISIBLE rather than guess.

3) PLACE NAMES — preserve original spelling. Do NOT estonianize Polish/Finnish/Latvian/Dutch toponyms ("Zarszyn" stays "Zarszyn"). Use Estonian forms only for established exonyms: "Helsinki" → "Helsingi", "Riga" → "Riia", "Warszawa" → "Varssavi", "Sankt-Peterburg" → "Peterburi".

4) SOURCE-LANGUAGE MORPHOLOGY:
   • FINNISH: never leak Finnish stems. "lintu-" → "lind-/linnu-" (e.g. "lintuvaatlus" → "linnuvaatlus"). "Suomi" → "Soome".
   • LATVIAN: Latvian endings are not Estonian. "Engures ezerā" → "Engure järvel" (Estonian inessive), not "Engures järvel".
   • POLISH: do not calque compounds literally. Preserve diacritics (ł ą ę ś ż) in proper names.
   • DUTCH/FLEMISH: "Vlaanderen" → "Flandria", "Wallonië" → "Valloonia".

5) TONE — natural Estonian birding-news prose, present tense for current events. If a literal translation reads awkwardly, restructure the sentence.

6) Preserve URLs, hashtags, @mentions, numbers, emojis, paragraph breaks EXACTLY.

COMMON SPECIES MAPPINGS (FI/PL/LV/EN → Estonian):
merikotka/bielik/jūras ērglis/White-tailed Eagle = merikotkas
kurki/żuraw/dzērve/Crane = sookurg
valkohaikara/bocian biały/baltais stārķis/White Stork = valge-toonekurg
mustahaikara/bocian czarny/melnais stārķis/Black Stork = must-toonekurg
sääksi/rybołów/zivjērglis/Osprey = kalakotkas
maakotka/orzeł przedni/klinšu ērglis/Golden Eagle = kaljukotkas
kiljukotka/orlik krzykliwy/mazais ērglis/Lesser Spotted Eagle = väike-konnakotkas
pikkukiljukotka/orlik grubodzioby/Greater Spotted Eagle = suur-konnakotkas
sininärhi/kraska/zilā vārna/Roller = siniraag
mehiläissyöjä/żołna/bišu dzenis/Bee-eater = mesilasenäpp
harjalintu/dudek/pupuķis/Hoopoe = vaenukägu
ruisrääkkä/derkacz/grieze/Corncrake = rukkirääk
satakieli/słowik/lakstīgala/Nightingale = ööbik
sinirinta/podróżniczek/zilrīklīte/Bluethroat = sinirind
kottarainen/szpak/mājas strazds/Starling = kuldnokk
valkoposkihanhi/bernikla białolica/baltvaigu zoss/Barnacle Goose = valgepõsk-lagle
metsähanhi/gęś zbożowa/sējas zoss/Bean Goose = suur-laukhani
laulujoutsen/łabędź krzykliwy/ziemeļu gulbis/Whooper Swan = laululuik
selkälokki/mewa żółtonoga/Lesser Black-backed Gull = tõmmukajakas
naurulokki/mewa śmieszka/lielais ķīris/Black-headed Gull = naerukajakas
kalalokki/mewa pospolita/kajak/Common Gull = kalakajakas
sociable lapwing/czajka stepowa/steppes ķīvīte = stepikiivitaja
töyhtöhyyppä/czajka/ķīvīte/Lapwing = kiivitaja
peregrine/sokół wędrowny/lielais piekūns = rabapistrik
hobby/kobuz/bezdelīgu piekūns = lõopistrik

For species not listed: use your knowledge of Estonian ornithology. When uncertain, keep the original name and add the Latin name in parentheses.

Return ONLY the translation. No commentary, no quotes around the result, no markdown fences.`;
}
