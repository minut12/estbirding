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
      temperature: 0.1,
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

1) LATIN BINOMIALS (e.g. "Vanellus gregarius", "Haliaeetus albicilla", "Pelecanus crispus") — preserve EXACTLY in nominative form. Never translate them. Never add Estonian declension suffixes (NEVER write "Vanellus spinosus'e", "Pelecanus crispust", "Haliaeetus albicillaga" — these are WRONG). Never change capitalization. Latin names are foreign words used as scientific references; treat them as inert tokens. Output as PLAIN TEXT — do NOT add markdown italics (asterisks '*X*' or underscores '_X_'), do NOT add '<i>' HTML tags, do NOT bold them. Only preserve such formatting if the source had it in that exact form. If a sentence requires the species in a grammatical case other than nominative, restructure the sentence so the Latin stays nominative (e.g. instead of "Vanellus spinosust nähti", write "lindu (Vanellus spinosus) nähti").

2) NEVER CALQUE BIRD NAMES. Estonian bird names are NOT formed by translating qualifiers from the source language. The Estonian name often bears NO RESEMBLANCE to the source name. Examples of WRONG calques you must avoid:
   ❌ "Dalmaatsia pelikan" (calque from Latvian "Dalmācijas pelikāns" / English "Dalmatian Pelican") → ✅ käharpelikan
   ❌ "rabakonnakotkas" (literal "bog frog-eagle") → ✅ väike-konnakotkas
   ❌ "stepi-kiivitaja" with hyphen (calque structure) → ✅ stepikiivitaja (one word)
   ❌ "must-saba vigle" (space + calque) → ✅ mustsaba-vigle
   ❌ "valge-toonekurg" capitalised in mid-sentence → ✅ valge-toonekurg (lowercase, hyphenated)
   If the species is NOT in the dictionary below AND you are not 100% certain of the correct Estonian name, KEEP THE LATIN NAME with no Estonian gloss (e.g. write "<i>Sylvia melanocephala</i>"). DO NOT invent an Estonian name by translating qualifier words.

3) ESTONIAN COMPOUND BIRD NAMES — the convention is inconsistent: some are hyphenated (väike-konnakotkas, must-toonekurg, valgepõsk-lagle, punajalg-tilder, mustsaba-vigle), others are written as one word (stepikiivitaja, käharpelikan, kalakotkas, merikotkas, sookurg, naerukajakas). When you don't know which form a species takes, USE THE LATIN NAME instead of guessing.

4) PLACE NAMES — preserve original spelling. Do NOT estonianize Polish/Finnish/Latvian/Dutch toponyms ("Zarszyn" stays "Zarszyn"). Use Estonian forms only for established exonyms: Helsinki → Helsingi, Riga → Riia, Warszawa → Varssavi, Sankt-Peterburg → Peterburi, Vilnius → Vilnius (unchanged). Add "(piirkond)" or "(maakond)" only when natural.

5) SOURCE-LANGUAGE MORPHOLOGY:
   • FINNISH: never carry Finnish stems into Estonian. "lintu-" → "lind-" or "linnu-" (e.g. "lintuvaatlus" → "linnuvaatlus", "lintuharrastus" → "linnuhuvi"). "Suomi" → "Soome".
   • LATVIAN: Latvian declensional endings are not Estonian. "Engures ezerā" → "Engure järvel" (Estonian inessive). Drop Latvian -s/-š endings on borrowed proper names where natural.
   • POLISH: do not calque compounds literally. Preserve diacritics (ł ą ę ś ż ć ź ń) in proper names exactly.
   • DUTCH/FLEMISH: "Vlaanderen" → "Flandria", "Wallonië" → "Valloonia".

6) FAITHFULNESS — translate every sentence of the source. Do NOT summarize, condense, paraphrase loosely, or omit details. Each fact in the source must appear in the Estonian output (place names, dates, numbers, person names, qualifiers, exclamations). Restructure individual sentences for natural Estonian word order, but never collapse multiple source sentences into one or drop sentences entirely. The Estonian output should be roughly the same length as the source content (or longer — Estonian morphology often needs more words than Polish/English/Latvian).
   IMPORTANT EXCEPTION FOR SPECIES NAMES: faithfulness DOES NOT mean "invent an Estonian species name to fill in the meaning". If a species is not in the dictionary below AND you are not 100% certain of the official Estonian name, you MUST use the Latin binomial name (e.g. write "Vanellus spinosus" or, if no Latin is available, leave the source-language name in italics). Calquing — translating qualifiers like "spur-winged" → "kannus-" or "white-tailed" → "valgesaba-" and gluing them onto a Estonian root — is a SEVERE error. The Estonian name "valgekael-kiivitaja" for Vanellus spinosus has nothing in common with "spur-winged"; you cannot derive it from the source. Better to write the Latin name than to invent.

7) TONE — natural Estonian birding-news prose, present tense for current events. Use standard verb forms ("nähti", "leiti", "jäädvustati", "tagasi pöördus") rather than creative paraphrases.

8) BILINGUAL SOURCES — some BirdLife / birding posts include the same content in two languages, e.g. a Polish paragraph followed by an English courtesy translation, or vice versa. In that case:
   • Produce ONE Estonian translation, not two.
   • Combine all details from BOTH versions — if one version mentions "(woj. podkarpackie)" and the other says "(Podkarpacie region)", include both pieces of information in the Estonian output if they add detail.
   • Do not output the Estonian translation twice. One paragraph or one set of paragraphs is sufficient.
   • The single Estonian translation must still be FAITHFUL (rule 6) — include every concrete detail from any source version.

9) Preserve URLs, hashtags, @mentions, numbers, dates, emojis, and paragraph breaks EXACTLY (single-version source paragraphs map 1:1 to Estonian paragraphs; bilingual duplicate paragraphs collapse to one Estonian paragraph per rule 8).

STYLE EXAMPLE — preferred Estonian birding-news phrasing.

Source (Latvian):
"Dalmācijas pelikāns nofotografēts lidojam pār Engures ezeru 18. aprīlī, autori S.E.Lukstiņa un M.Lukstiņš. 2. novērojums Latvijā, pirmais reģistrēts 1896. gadā. Iespējams, ka 19.–20. aprīlī Zviedrijā novērotais ir tas pats putns, kurš pērn atgriezās Ziemeļeiropā."

Preferred Estonian translation:
"Käharpelikan jäädvustati 18. aprillil Engure järve kohal lendamas, autorid S.E.Lukstiņa ja M.Lukstiņš. Tegemist on Läti teise vaatlusega, esimene pärineb aastast 1896. Tõenäoliselt on tegemist sama linnuga, keda nähti 19.–20. aprillil Rootsis, ja võib-olla on see sama lind, kes eelmisel aastal Põhja-Euroopasse tagasi pöördus."

Style notes from this example — apply consistently:
- Predicate nominals: "Tegemist on X-ga" / "tegemist on Y-ga", NOT bare "X on Y"
- Months: spelled out with case ending ("18. aprillil", "19.–20. aprillil"), NOT numeric ("18.04", "19.-20.04")
- Verbs: prefer concrete standard forms — "tagasi pöördus", "jäädvustati", "nähti", "leiti" — over creative paraphrases like "taas lennanud" or "tuttav isend"
- Faithfulness: every fact, place, date, name, qualifier from the source appears in the Estonian. Output is roughly the same word count as the source (or longer due to Estonian morphology). Do not skip sentences.
- Authors/photographers introduced with "autorid" / "pildistasid" / "leidsid", not Latvian/Polish/Finnish patterns
- "X is the Nth observation" → "Tegemist on N. vaatlusega" (compact, idiomatic)

ADDITIONAL EXAMPLE — general spring/autumn migration news.

Source (Finnish):
"Muutto on vilkastunut ja viime viikolla on kevään uusina muuttolintuina havaittu mm. keltavästäräkki, leppälintu, pensastasku, törmäpääsky, ruisrääkkä ja kehrääjä."

Preferred Estonian translation:
"Rändlindude ränne on hoogustunud ning möödunud nädalal on kevadiste uute rändajate seas täheldatud muu hulgas linavästrikku, lepalinda, kadakatäksi, kaldapääsukest, rukkirääku ja öösorri."

Style notes for migration-roundup articles:
- "Migratory birds" generically → "rändlinnud" / "rändlindude". DO NOT translate generic "muuttolinnut" / "migratory birds" / "migrants" as "rästad" (thrushes) unless the article is specifically about thrush family species (Turdidae). The photograph at the top of an article is NOT a signal of which species the article covers — read the BODY to identify the topic.
- "Migration has intensified / picked up" → "ränne on hoogustunud" (NOT "elavnenud"). "Hoogustunud" is the standard verb for migration activity in Estonian birding press.
- "Among the new spring/autumn migrants" → "kevadiste/sügiseste uute rändajate seas" — use "seas" (among) with genitive case. AVOID the essive "rändajatena" (as migrants), which sounds technical/awkward in this context.
- Adjectival forms: "kevadiste uute" (spring's new) and "sügiseste uute" (autumn's new) are more idiomatic than the genitive constructions "kevade uute" / "sügise uute".
- "muu hulgas" (among others) is the standard introducer for an enumerated list of species in migration news.

CRITICAL RULE: Use correct official Estonian bird names (eesti linnunimed). NEVER literally translate bird common names from Polish, English, or any other language. Bird species have specific established Estonian names that must be used.
Key species mappings (Polish → Estonian):
bielik/White-tailed Eagle = merikotkas, żuraw/Crane = sookurg, bocian biały/White Stork = valge-toonekurg, rybołów/Osprey = kalakotkas, bernikla białolica/Barnacle Goose = valgepõsk-lagle, gęś zbożowa/Bean Goose = suur-laukhani, orlik krzykliwy/Lesser Spotted Eagle = väike-konnakotkas, orlik grubodzioby/Greater Spotted Eagle = suur-konnakotkas, błotniak łąkowy/Montagu's Harrier = stepi-loorkull, błotniak zbożowy/Hen Harrier = soo-loorkull, błotniak stawowy/Marsh Harrier = roo-loorkull, myszołów/Common Buzzard = hiireviu, trzmielojad/Honey Buzzard = herilaseviu, drzemlik/Merlin = piiritaja, kobuz/Hobby = lõopistrik, sokół wędrowny/Peregrine = rabapistrik, orzeł przedni/Golden Eagle = kaljukotkas, jastrząb/Goshawk = kanakull, krogulec/Sparrowhawk = raudkull, gąsiorek/Red-backed Shrike = punaselg-õgija, srokosz/Great Grey Shrike = hallõgija, krętogłów/Wryneck = käosulane, dzięcioł czarny/Black Woodpecker = musträhn, lelek/Nightjar = öösorr, kukułka/Cuckoo = kägu, jerzyk/Swift = piiritaja, kraska/Roller = siniraag, żołna/Bee-eater = mesilasenäpp, dudek/Hoopoe = vaenukägu, derkacz/Corncrake = rukkirääk, kropiatka/Spotted Crake = täpikhuik, łyska/Coot = lauk, brodziec piskliwy/Common Sandpiper = jõgitilder, samotnik/Green Sandpiper = metstilder, łęczak/Wood Sandpiper = mudatilder, czajka/Lapwing = kiivitaja, kulik wielki/Curlew = suurkoovitaja, słonka/Woodcock = metskurvits, kszyk/Snipe = rohunepp, rycyk/Black-tailed Godwit = mustsaba-vigle, batalion/Ruff = tuttvart, biegus zmienny/Dunlin = soorüdi, sieweczka obrożna/Ringed Plover = liivatüll, siewka złota/Golden Plover = rüüt, szablodziób/Avocet = naaskelnokk, ostrygojad/Oystercatcher = merisk, rybitwa rzeczna/Common Tern = jõgitiir, rybitwa popielata/Arctic Tern = randtiir, dymówka/Barn Swallow = suitsupääsuke, oknówka/House Martin = räästapääsuke, brzegówka/Sand Martin = kaldapääsuke, skowronek/Skylark = põldlõoke, świergotek łąkowy/Meadow Pipit = niidukiur, świergotek drzewny/Tree Pipit = metskiur, pliszka żółta/Yellow Wagtail = linavästrik, pliszka siwa/White Wagtail = jõgivästrik, pleszka/Redstart = lepalind, białorzytka/Wheatear = kivitäks, pokrzywnica/Whinchat = kadakatäks, kląskawka/Stonechat = must-lepalind, rudzik/Robin = punarind, słowik/Nightingale = ööbik, podróżniczek/Bluethroat = sinirind, kwiczoł/Fieldfare = hallrästas, śpiewak/Song Thrush = laulurästas, kos/Blackbird = musträstas, droździk/Ring Ouzel = kaelusrästas, trzciniak/Reed Warbler = aed-roolind, rokitniczka/Sedge Warbler = kõrkja-roolind, piecuszek/Willow Warbler = salu-lehelind, pierwiosnek/Chiffchaff = mets-lehelind, kapturka/Blackcap = mustpea-põõsalind, cierniówka/Whitethroat = aed-põõsalind, muchołówka szara/Spotted Flycatcher = hall-kärbsenäpp, muchołówka żałobna/Pied Flycatcher = must-kärbsenäpp, muchołówka mała/Red-breasted Flycatcher = kaelus-kärbsenäpp, szpak/Starling = kuldnokk, ortolan/Ortolan = aed-tsiitsitaja, trznadel/Yellowhammer = talvike, makolągwa/Linnet = kanepilind, czyż/Siskin = siisike, szczygieł/Goldfinch = ohakalind, dzwoniec/Greenfinch = rohevint, grubodziób/Hawfinch = suurnokk-vint, krzyżodziób świerkowy/Crossbill = kuuse-käbilind, gil/Bullfinch = leevike, dzwoniec/Rosefinch = karmiinleevike, zięba/Chaffinch = metsvint, jer/Brambling = põhjavint, łabędź niemy/Mute Swan = kühmnokk-luik, łabędź krzykliwy/Whooper Swan = laululuik, czapla siwa/Grey Heron = hallhaigur, czapla biała/Great Egret = hõbehaigur, kormoran/Cormorant = kormoran, gęś białoczelna/White-fronted Goose = suur-laukhani, kaczka krzyżówka/Mallard = sinikael-part, cyranka/Garganey = rägapart, cyraneczka/Teal = piilpart, czernica/Tufted Duck = tuttvart, gągoł/Goldeneye = sõtkas, nurogęś/Goosander = jääkoskel, szlachar/Red-breasted Merganser = rohukoskel, perkoz dwuczuby/Great Crested Grebe = tuttpütt, perkoz rdzawoszyi/Red-necked Grebe = hallpõsk-pütt, mewa śmieszka/Black-headed Gull = naerukajakas, mewa srebrzysta/Herring Gull = hõbekajakas, gołąb miejski/Feral Pigeon = kodutuvi, grzywacz/Woodpigeon = kaelustuvi, turkawka/Turtle Dove = kaelus-turteltuvi, pustułka/Kestrel = tuuletallaja, kobczyk/Red-footed Falcon = punajalg-pistrik, kania ruda/Red Kite = puna-harksaba, kania czarna/Black Kite = must-harksaba, pelikan kędzierzawy/Dalmatian Pelican = käharpelikan, biegus arktyczny/Pectoral Sandpiper = alverüdi, czajka stepowa/Sociable Lapwing = stepikiivitaja, czajka szponiasta/Spur-winged Lapwing = valgekael-kiivitaja, rybitwa wielkodzioba/Caspian Tern = räusktiir, mewa czarnogłowa/Mediterranean Gull = mustpea-kajakas, mewa romańska/Yellow-legged Gull = vahemerekajakas, mewa białogłowa/Caspian Gull = stepikajakas, błotniak stepowy/Pallid Harrier = aru-loorkull, raniuszek/Long-tailed Tit = sabatihane, sosnówka/Coal Tit = musttihane, czubatka/Crested Tit = tutt-tihane, mysikrólik/Goldcrest = pöialpoiss, zniczek/Firecrest = punapea-pöialpoiss, cyranka modroskrzydła/Blue-winged Teal = sini-rägapart, kaniuk/Black-winged Kite = hõbehaugas
Key species mappings (Finnish → Estonian):
selkälokki = tõmmukajakas, merikotka = merikotkas, kurki = sookurg, kottarainen = kuldnokk, haarahaukka = must-harksaba, varpushaukka = raudkull, kanahaukka = kanakull, hiirihaukka = hiireviu, piekana = karvasjalg-viu, mehiläishaukka = herilaseviu, sääksi = kalakotkas, maakotka = kaljukotkas, kiljukotka = väike-konnakotkas, pikkukiljukotka = suur-konnakotkas, muuttohaukka = rabapistrik, nuolihaukka = lõopistrik, ampuhaukka = piiritaja, tuulihaukka = tuuletallaja, punajalkahaukka = punajalg-pistrik, valkoposkihanhi = valgepõsk-lagle, merihanhi = hallhani, metsähanhi = suur-laukhani, lyhytnokkahanhi = lühinokk-hani, valkootsahanhi = suur-laukhani, kiljuhanhi = kiljuhani, sepelhanhi = mustlagle, punakaulahanhi = punakael-lagle, kanadanhanhi = kanada lagle, laulujoutsen = laululuik, kyhmyjoutsen = kühmnokk-luik, pikkujoutsen = väikeluik, haahka = hahk, alli = aul, pilkkasiipi = tõmmuvaeras, mustalintu = mustvaeras, tukkasotka = tuttvart, punasotka = punapea-vart, lapasotka = merivart, telkkä = sõtkas, isokoskelo = jääkoskel, tukkakoskelo = rohukoskel, uivelo = väikekoskel, sinisorsa = sinikael-part, tavi = piilpart, haapana = viupart, jouhisorsa = sõtkas, lapasorsa = luitsnokk-part, heinätavi = rägapart, harmaahaigara = hallhaigur, jalohaikara = hõbehaigur, silkkihaikara = siidhaigur, kattohaikara = purpurhaigur, merimetso = kormoran, kaulushaikara = hüüp, valkohaikara = valge-toonekurg, mustahaikara = must-toonekurg, kuovi = suurkoovitaja, pikkukuovi = väikekoovitaja, lehtokurppa = metskurvits, taivaanvuohi = rohunepp, jänkäkurppa = mudanepp, punajalkaviklo = punajalg-tilder, valkoviklo = heletilder, liro = mudatilder, mustaviklo = tumetilder, metsäviklo = metstilder, rantasipi = jõgitilder, suokukko = tutkas, töyhtöhyyppä = kiivitaja, tylli = liivatüll, kapustarinta = rüüt, meriharakka = merisk, avosetti = naaskelnokk, kalatiira = jõgitiir, lapintiira = randtiir, räyskä = räusktiir, naurulokki = naerukajakas, harmaalokki = hõbekajakas, merilokki = merikajakas, kalalokki = kalakajakas, haarapääsky = suitsupääsuke, räystäspääsky = räästapääsuke, törmäpääsky = kaldapääsuke, kiuru = põldlõoke, niittykirvinen = niidukiur, metsäkirvinen = metskiur, keltavästäräkki = linavästrik, västäräkki = jõgivästrik, punarinta = punarind, satakieli = ööbik, sinirinta = sinirind, leppälintu = lepalind, pensastasku = kadakatäks, kivitasku = kivitäks, mustarastas = musträstas, räkättirastas = hallrästas, laulurastas = laulurästas, punakylkirastas = vainurästas, kulorastas = hoburästas, ruokokerttunen = kõrkja-roolind, rytikertunen = aed-roolind, pajulintu = salu-lehelind, tiltaltti = mets-lehelind, mustapääkerttu = mustpea-põõsalind, pensaskerttu = aed-põõsalind, hernekerttu = väike-põõsalind, kirjosieppo = must-kärbsenäpp, harmaasieppo = hall-kärbsenäpp, pikkusieppo = kaelus-kärbsenäpp, talitiainen = rasvatihane, sinitiainen = sinitihane, kuusitiainen = musttihane, hömötiainen = põhjatihane, töyhtötiainen = tutt-tihane, pyrstötiainen = sabatihane, pikkulepinkäinen = punaselg-õgija, isolepinkäinen = hallõgija, käenpiika = käosulane, palokärki = musträhn, käpytikka = suur-kirjurähn, pikkutikka = väike-kirjurähn, harmaapäätikka = hallpea-rähn, vihertikka = roherähn, kehrääjä = öösorr, käki = kägu, tervapääsky = piiritaja, kuningaskalastaja = jäälind, mehiläissyöjä = mesilasenäpp, sininärhi = siniraag, harjalintu = vaenukägu, ruisrääkkä = rukkirääk, luhtahuitti = täpikhuik, nokikana = lauk, sepelkyyhky = kaelustuvi, turturikyyhky = kaelus-turteltuvi, huuhkaja = kassikakk, varpuspöllö = värbkakk, helmipöllö = karvasjalg-kakk, hiiripöllö = loorkakk, tunturipöllö = lumekakk, viirupöllö = händkakk, lapinpöllö = habekakk, sarvipöllö = kõrvukräts, suopöllö = soo-loorkull, metso = metsis, teeri = teder, pyy = laanepüü, riekko = rabapüü, peltopyy = nurmkana, viiriäinen = põldvutt, peippo = metsvint, järripeippo = põhjavint, tikli = ohakalind, vihervarpunen = rohevint, tuhkimo = siisike, hemppo = kanepilind, urpiainen = urvalind, pikkukäpylintu = kuuse-käbilind, isokäpylintu = männi-käbilind, punatulkku = leevike, punavarpunen = karmiinleevike, nokkavarpunen = suurnokk-vint, keltasirkku = talvike, peltosirkku = aed-tsiitsitaja, pajusirkku = rootsiitsitaja, tilhi = siidisaba, kuhankeittäjä = peoleo, kiharapelikaani = käharpelikan, tundraviklo = alverüdi, arokiitäjä = stepikiivitaja, mustanmerenlokki = mustpea-kajakas, etelänharmaalokki = vahemerekajakas, aroharmaalokki = stepikajakas, arosuohaukka = aru-loorkull, hippiäinen = pöialpoiss, tulipäähippiäinen = punapea-pöialpoiss
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
