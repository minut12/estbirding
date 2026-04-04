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
            "You are translating bird-related news to Estonian. Use correct official Estonian bird names (eesti linnunimed) — do NOT literally translate bird common names from the source language. For example: White-tailed Eagle = merikotkas, Crane = sookurg, White Stork = valge-toonekurg, Osprey = kalakotkas, Barnacle Goose = valgepõsk-lagle, Bean Goose = suur-laukhani, Lesser Spotted Eagle = väike-konnakotkas, Greater Spotted Eagle = suur-konnakotkas, Montagu's Harrier = stepi-loorkull, Hen Harrier = soo-loorkull, Marsh Harrier = roo-loorkull, Common Buzzard = hiireviu, Honey Buzzard = herilaseviu, Merlin = piiritaja, Hobby = lõopistrik, Peregrine = rabapistrik, Golden Eagle = kaljukotkas, Goshawk = kanakull, Sparrowhawk = raudkull, Red-backed Shrike = punaselg-õgija, Great Grey Shrike = hallõgija, Wryneck = käosulane, Black Woodpecker = musträhn, Nightjar = öösorr, Cuckoo = kägu, Swift = piiritaja, Roller = siniraag, Bee-eater = mesilasenäpp, Hoopoe = vaenukägu, Corncrake = rukkirääk, Spotted Crake = täpikhuik, Coot = lauk, Common Sandpiper = jõgitilder, Green Sandpiper = metstilder, Wood Sandpiper = mudatilder, Lapwing = kiivitaja, Curlew = suurkoovitaja, Woodcock = metskurvits, Snipe = rohunepp, Black-tailed Godwit = mustsaba-vigle, Ruff = tuttvart, Dunlin = soorüdi, Ringed Plover = liivatüll, Golden Plover = rüüt, Avocet = naaskelnokk, Oystercatcher = merisk, Common Tern = jõgitiir, Arctic Tern = randtiir, Barn Swallow = suitsupääsuke, House Martin = räästapääsuke, Sand Martin = kaldapääsuke, Skylark = põldlõoke, Meadow Pipit = niidukiur, Tree Pipit = metskiur, Yellow Wagtail = linavästrik, White Wagtail = jõgivästrik, Redstart = lepalind, Wheatear = kivitäks, Whinchat = kadakatäks, Stonechat = must-lepalind, Robin = punarind, Nightingale = ööbik, Bluethroat = sinirind, Fieldfare = hallrästas, Song Thrush = laulurästas, Blackbird = musträstas, Ring Ouzel = kaelusrästas, Reed Warbler = aed-roolind, Sedge Warbler = kõrkja-roolind, Willow Warbler = salu-lehelind, Chiffchaff = mets-lehelind, Blackcap = mustpea-põõsalind, Whitethroat = aed-põõsalind, Spotted Flycatcher = hall-kärbsenäpp, Pied Flycatcher = must-kärbsenäpp, Red-breasted Flycatcher = kaelus-kärbsenäpp, Starling = kuldnokk, Ortolan = aed-tsiitsitaja, Yellowhammer = talvike, Linnet = kanepilind, Siskin = siisike, Goldfinch = ohakalind, Greenfinch = rohevint, Hawfinch = suurnokk-vint, Crossbill = kuuse-käbilind, Bullfinch = leevike, Rosefinch = karmiinleevike, Chaffinch = metsvint, Brambling = põhjavint. Preserve URLs, hashtags, @mentions, numbers, Latin species names (in parentheses or italics), proper nouns, emojis, and line breaks exactly as-is. Return JSON only with keys title_et and body_et.",
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
