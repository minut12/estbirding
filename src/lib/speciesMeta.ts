import { normalizeSpeciesName, normalizeUiText } from "@/lib/textNormalize";
import { LINNULIIGID_SCOPE, RARILIIN_SCOPE, type SpeciesScopeConfig } from "@/lib/mapScope";
export const SPECIES_META_KEY = LINNULIIGID_SCOPE.speciesMetaStorageKey;
const SPECIES_META_MIGRATED_KEY = LINNULIIGID_SCOPE.speciesMetaMigratedKey;
export const SPECIES_META_LOCAL_UPDATED_AT_KEY = LINNULIIGID_SCOPE.speciesMetaLocalUpdatedAtKey;

export type SpeciesMeta = {
  name: string;
  ebirdCode?: string;
  rarityLevel?: "none" | "rare" | "super" | "mega";
  avatarUrl?: string;
  scientificName?: string;
  rariliinCode?: string;
  notificationNote?: string;
};

export type SpeciesMetaMap = Record<string, SpeciesMeta>;
export type SpeciesMetaLookupFallback = Record<string, Partial<SpeciesMeta>>;
export type SpeciesMetaLookupResult = SpeciesMeta & {
  resolvedKey: string;
  found: boolean;
};

const STATIC_EBIRD_CODE_FALLBACKS: Record<string, string> = {
  'punakurk-kaur': 'retloo',
};

const DEFAULT_EBIRD_CODES: Record<string, string> = {"Aed-lepalind":"comred2","Aed-põõsalind":"garwar1","Aed-roolind":"blrwar1","Aedporr":"shtre1","Alk":"razorb","Alverüdi":"shtsan","Ameerika piilpart":"amewig","Atlantise tormilind":"scoshe1","Aul":"lotduc","Baleaari tormilind":"balshe1","Euroopa kaelustäks":"stonec4","Habekakk":"grgowl","Habeviires":"whiter2","Hahk":"comeid","Hakk":"eurjac","Hall-kärbsenäpp":"spofly1","Hallhaigur":"graher1","Hallhani":"gragoo","Hallkibu":"tersan","Hallpea-rähn":"gyfwoo1","Hallpõsk-pütt":"rengre","Hallrästas":"fiethr1","Hallrüdi":"semsan","Halltsiitsitaja":"corbun1","Hallvares":"hoocro1","Hallõgija":"norshr1","Hangelind":"snobun","Harakas":"eurmag1","Haugaskotkas":"boneag2","Hele-urvalind":"hoared1","Heletilder":"comgre","Herilaseviu":"euhbuz1","Hiireviu":"combuz1","Hoburästas":"misthr1","Händkakk":"uraowl1","Hänilane":"eaywag1","Hõbehaigur":"greegr","Hõbehaugas":"norgos2","Hõbekajakas":"hergul","Hüüp":"grebit1","Ida-mustvaeras":"blksco2","Jahipistrik":"gyrfal","Jämejalg":"eutkne1","Järvekaur":"arcloo","Jääkajakas":"glagul","Jääkaur":"comloo","Jääkoskel":"commrg","Jõgi-ritsiklind":"eurwar2","Jõgitiir":"comter","Jõgitilder":"comsan","Jõgivästrik":"grywag","Kadakatäks":"whinch1","Kaelus-kärbsenäpp":"colfly1","Kaelus-turteltuvi":"eucdov","Kaeluskotkas":"eurgr1","Kaelusrästas":"rinouz1","Kaelustuvi":"cowpig1","Kalakajakas":"mewgul","Kalakotkas":"osprey","Kalda-rädilind":"cetwar1","Kaldapääsuke":"banswa","Kaljukajakas":"bklkit","Kaljukotkas":"goleag","Kanada lagle":"cangoo","Kanakull":"norgos1","Kanepilind":"eurlin","Karbuskajakas":"medgul1","Karkjalg":"bkwsti","Karmiinleevike":"comros","Karvasjalg-kakk":"borowl","Karvasjalg-viu":"rolhaw","Kassikakk":"eueowl1","Kiivitaja":"norlap","Kiripugu-rüdi":"pecsan","Kirjuhahk":"steeid","Kivikakk":"litowl1","Kivirullija":"rudtur","Kivitäks":"norwhe","Kodukakk":"tawowl1","Kodutuvi":"rocpig","Koduvarblane":"houspa","Koldhaigur":"squher1","Koldjalg-hõbekajakas":"casgul2","Koldvint":"eurser1","Kormoran":"grecor","Krüüsel":"blkguj","Kukkurtihane":"penitr1","Kuld-lehelind":"palwar5","Kuldhänilane":"citwag","Kuldnokk":"eursta","Kuldtsiitsitaja":"yebbun","Kuninghahk":"kineid","Kuuse-käbilind":"redcro","Käblik":"winwre4","Kägu":"comcuc","Käharpelikan":"dalpel1","Käosulane":"ictwar1","Kääbuskormoran":"pygcor2","Kääbuskotkas":"booeag1","Kõnnuõgija":"isashr1","Kõrbe-kivitäks":"deswhe1","Kõrbe-põõsalind":"asdwar1","Kõrkja-roolind":"sedwar1","Kõrvukräts":"loeowl","Kõvernokk-rüdi":"cursan","Kühmnokk-luik":"mutswa","Künnivares":"rook1","Laanenäär":"sibjay1","Laanepüü":"hazgro1","Laanerähn":"ettwoo1","Laisaba-änn":"pomjae","Lammitilder":"marsan","Lapi tsiitsitaja":"laplon","Lasuurtihane":"azutit2","Lauk":"eurcoo","Laululuik":"whoswa","Laulurästas":"sonthr1","Leeterüdi":"sander","Leevike":"eurbul","Liiv-kivitäks":"isawhe1","Liivatüll":"corplo","Linavästrik":"whiwag","Loorkakk":"webowl1","Luitsnokk-iibis":"eurspo1","Luitsnokk-part":"norsho","Lumehani":"snogoo","Lumekakk":"snoowl1","Lääne-lehelind":"webwar1","Lääne-pöialpoiss":"firecr1","Lõopistrik":"eurhob","Lõuna-hõbekajakas":"yelgul1","Lühinokk-hani":"pifgoo","Madukotkas":"shteag1","Mandariinpart":"manduc","Merikajakas":"gbbgul","Merikotkas":"wtheag","Merirüdi":"pursan","Merisk":"eursoy1","Merivart":"gresca","Mesilasenäpp":"eubeat1","Mets-lehelind":"woowar","Metsis":"wescap1","Metskiur":"trapip1","Metskurvits":"eurwoo","Metstilder":"grnsad1","Metsvint":"comcha","Mudanepp":"jacsni","Mudatilder":"woosad1","Must-harksaba":"blakit1","Must-kärbsenäpp":"piefly1","Must-lepalind":"blared1","Must-toonekurg":"blasto1","Mustjalg-tüll":"kenplo1","Mustkael-pütt":"eargre","Mustkurk-raat":"bltacc1","Mustlagle":"brant","Mustlauk-õgija":"legshr2","Mustpea-põõsalind":"blackc1","Mustpea-tsiitsitaja":"blhbun1","Mustpugu-rästas":"retthr1","Musträhn":"blawoo1","Musträstas":"euabla1","Mustsaba-vigle":"bltgod","Musttihane":"coatit3","Mustvaeras":"blksco1","Mustvares":"carcro1","Mustviires":"blkter","Mägi-kanepilind":"twite1","Mägikiur":"watpip1","Männi-käbilind":"parcro2","Männileevike":"pingro","Männitalvike":"pinbun","Mänsak":"eurmut3","Naaskelnokk":"pieav01","Naerukajakas":"bkhgul","Naerutiir":"gubter2","Niidu-kaelustäks":"sibsto1","Niidu-ritsiklind":"pagwar1","Niidukiur":"ricpip1","Nunn-kivitäks":"piewhe1","Nurmkana":"grypar","Nõgipart":"ambduc","Nõlva-lehelind":"grewar3","Nõmmekiur":"tawpip1","Nõmmelõoke":"woolar1","Ohakalind":"eurgol","Ohhoota hõbekajakas":"slbgul","Padu-roolind":"padwar1","Pasknäär":"eurjay1","Peegel-tormilind":"sooshe","Pelikan":"grwpel1","Peoleo":"eugori2","Piilpart":"gnwtea","Piiritaja":"comswi","Pikksaba-änn":"lotjae","Plütt":"brbsan","Plüü":"bkbplo","Polaarkajakas":"y00478","Porr":"dunnoc1","Prillvaeras":"sursco","Pruunselg-põõsalind":"grewhi1","Puna-harksaba":"redkit1","Puna-veetallaja":"redpha1","Punajalg-pistrik":"reffal1","Punajalg-tilder":"comred1","Punakael-lagle":"rebgoo1","Punakurk-kaur":"retloo","Punanokk-vart":"recpoc","Punapea-vart":"compoc","Punapea-õgija":"wooshr1","Punarind":"eurrob1","Punasaba-õgija":"rutshr2","Punaselg-õgija":"rebshr1","Purpurhaigur":"purher1","Puukoristaja":"euanut1","Põhja-kirjurästas":"scathr2","Põhja-lehelind":"arcwar1","Põhja-tormipääsu":"lcspet","Põhjatihane":"wiltit1","Põhjatsiitsitaja":"rusbun","Põhjavint":"brambl","Põldlõoke":"skylar","Põldtsiitsitaja":"ortbun1","Põldvarblane":"eutspa","Põldvutt":"comqua1","Pöialpoiss":"goldcr1","Rabapistrik":"perfal","Rabapüü":"wilpta","Raisakotkas":"cinvul1","Randkajakas":"laugul","Randkiur":"rocpip1","Randtiir":"arcter","Rasvatihane":"gretit1","Raudkull":"eurspa1","Ristpart":"comshe","Roherähn":"eugwoo2","Rohevint":"eurgre1","Rohukoskel":"rebmer","Rohunepp":"gresni1","Ronk":"comrav","Roo-loorkull":"wemhar1","Roo-ritsiklind":"gwcwar1","Roohabekas":"bebrdt1","Rooruik":"watrai1","Roosa-kuldnokk":"rossta2","Roosakajakas":"rosgul","Roosatiir":"roster","Roostepääsuke":"redrma2","Roosterind-tüll":"lesplo1","Rootsiitsitaja":"yebbun","Rubiinööbik":"sibrub1","Rukkirääk":"corcra","Ruugerüdi":"redkno","Rägapart":"gargan","Rästas-roolind":"grrwar1","Räusktiir":"caster1","Rääkspart":"gadwal","Räästapääsuke":"coumra1","Rüüt":"eugplo","Sabatihane":"lotitx1","Salu-lehelind":"wilwar","Salupäll":"ictwar1","Salutihane":"martit1","Sarviklõoke":"horlar","Sarvikpütt":"grcgre1","Siberi lehelind":"radwar1","Siberi raat":"sibacc","Siidhaigur":"litegr","Siidisaba":"bohwax","Siisike":"eursis","Sinikael-part":"mallar3","Siniraag":"euorol1","Sinirind":"bltblu2","Sinisaba":"bltred1","Sinitihane":"blutit1","Soo-loorkull":"norhar1","Soo-roolind":"marwar1","Sookiur":"merpip1","Sookurg":"comcra","Soopart":"nortea","Sooräts":"sheowl","Soorüdi":"dunlin","Stepi-loorkull":"monhar2","Stepikajakas":"stegul1","Stepikiivitaja":"soclap","Stepikotkas":"steeag1","Stepipistrik":"sakfal","Stepiviu":"lobuz1","Suitsupääsuke":"barswa","Suula":"nangan","Suur-kirjurähn":"grswoo1","Suur-konnakotkas":"grseag1","Suur-laukhani":"gwfgoo","Suurkoovitaja":"eurcur","Suurnokk-vint":"hawfin","Suurrüdi":"gresan","Suuränn":"grskua","Sõtkas":"comgol","Söödikänn":"langer1","Tait":"mooga1","Talvike":"redpol","Tamme-kirjurähn":"midswo1","Teder":"blagro1","Tiigi-roolind":"eurrwa","Tikutaja":"eutwre1","Triip-ritsiklind":"crgwar1","Tuhk-lehelind":"bonwar1","Tumetilder":"sposan1","Tundra-rabahani":"tubgoo","Tundrakaur":"artloo","Tundrakiur":"repip1","Tutkas":"norpin","Tutt-tihane":"cretit2","Tutt-tiir":"santer1","Tuttlõoke":"crlar1","Tuttpütt":"grcgre1","Tuttvart":"ruff","Tuuletallaja":"comkes","Täpikhuik":"spotc1","Tõmmu-lehelind":"duwwar1","Tõmmuiibis":"gloibi","Tõmmukajakas":"lbbgul","Tõmmuvaeras":"velsco1","Urvalind":"comlin","Vaaraohani":"egygoo","Vaenukägu":"eurhoo","Vainurästas":"redwi","Valge-toonekurg":"whisto1","Valgepõsk-lagle":"bargoo","Valgeselg-kirjurähn":"whbwoo1","Valgesilm-vart":"ferduc","Valgetiib-viires":"whwter","Veetallaja":"renpha","Veisehaigur":"categr","Vesipapp":"whtdip2","Vihitaja":"comsan","Viupart":"eurwig","Väike-kirjurähn":"lsswo1","Väike-konnakotkas":"leseag1","Väike-käosulane":"boowar1","Väike-kärbsenäpp":"rebfly","Väike-laukhani":"lwfgoo","Väike-lehelind":"comchi1","Väike-põõsalind":"leswhi4","Väikealk":"litauk","Väikehuik":"ltrcra1","Väikehüüp":"litbit1","Väikekajakas":"litgul","Väikekoovitaja":"whimbr","Väikekoskel":"smew","Väikeluik":"tunswa","Väikepistrik":"merlin","Väikepütt":"litgre1","Väikerüdi":"litsti","Väiketiir":"litter1","Väiketrapp":"litbus1","Väiketsiitsitaja":"litbun","Väiketüll":"ltrplo","Välja-loorkull":"norhar1","Välja-väikelõoke":"gstlar1","Värbkakk":"eupowl1","Värbrüdi":"temsti","Väänkael":"eurrwry","Võsa-ritsiklind":"cogwar1","Võsaraat":"dunnoc1","Vööt-käbilind":"whwcro","Vööt-põõsalind":"barwar1","Vööthani":"bahgoo","Vöötkakk":"nohowl","Vöötnokk-kajakas":"ribgul","Vöötsaba-vigle":"batgod","Õõnetuvi":"stodov1","Ööbik":"thrnig1","Ööhaigur":"bcnher","Öösorr":"eurnig1"};

type ScopeSpeciesMeta = {
  estonianName: string;
  scientificName?: string;
  rariliinCode?: string;
  notificationNote?: string;
};

function safeParseRecord(value: string | null): Record<string, any> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, any>;
  } catch {
    return {};
  }
}

function normalizeRarityLevel(raw: any): "none" | "rare" | "super" | "mega" {
  const lvl = typeof raw?.rarityLevel === "string" ? raw.rarityLevel.trim().toLowerCase() : "";
  if (lvl === "rare" || lvl === "super" || lvl === "mega" || lvl === "none") return lvl;
  if (raw?.isRarity === true) return "rare";
  if (typeof raw?.rarity === "string" && raw.rarity.trim()) {
    const legacy = raw.rarity.trim().toLowerCase();
    if (legacy.includes("mega")) return "mega";
    if (legacy.includes("very") || legacy.includes("super")) return "super";
    return "rare";
  }
  return "none";
}

function sanitizeMeta(name: string, raw: any): SpeciesMeta {
  const normalizedName = normalizeSpeciesName(name);
  const ebirdCode = typeof raw?.ebirdCode === "string" ? normalizeUiText(raw.ebirdCode) : "";
  const avatarUrl = typeof raw?.avatarUrl === "string" ? normalizeUiText(raw.avatarUrl) : "";
  const scientificName = typeof raw?.scientificName === "string" ? normalizeUiText(raw.scientificName) : "";
  const rariliinCode = typeof raw?.rariliinCode === "string" ? normalizeUiText(raw.rariliinCode) : "";
  const notificationNote = typeof raw?.notificationNote === "string" ? normalizeUiText(raw.notificationNote) : "";
  const rarityLevel = normalizeRarityLevel(raw);
  return {
    name: normalizedName,
    ...(ebirdCode ? { ebirdCode } : {}),
    rarityLevel,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(scientificName ? { scientificName } : {}),
    ...(rariliinCode ? { rariliinCode } : {}),
    ...(notificationNote ? { notificationNote } : {}),
  };
}

function mergeIn(map: SpeciesMetaMap, name: string, partial: Partial<SpeciesMeta>) {
  const key = normalizeSpeciesName(name);
  if (!key) return;
  const prev = map[key] ?? { name: key };
  map[key] = sanitizeMeta(key, { ...prev, ...partial });
}

function migrateLegacyIfNeeded(current: SpeciesMetaMap, scope: SpeciesScopeConfig): SpeciesMetaMap {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return current;
  if (localStorage.getItem(scope.speciesMetaMigratedKey) === "1") return current;
  if (scope.id !== "linnuliigid") return current;

  const next: SpeciesMetaMap = { ...current };

  const avatarSources = [
    "bm_global_avatars",
    "bm_rari_avatars",
    "linnuliigid_avatars_v1",
    "linnuliigid_avatar_defaults_v1",
  ];
  for (const key of avatarSources) {
    const map = safeParseRecord(localStorage.getItem(key));
    for (const [name, avatarUrl] of Object.entries(map)) {
      if (typeof avatarUrl === "string" && avatarUrl.trim()) {
        mergeIn(next, name, { avatarUrl: avatarUrl.trim() });
      }
    }
  }

  const codeMap = safeParseRecord(localStorage.getItem("bm_global_ebird_codes"));
  for (const [name, ebirdCode] of Object.entries(codeMap)) {
    if (typeof ebirdCode === "string" && ebirdCode.trim()) {
      mergeIn(next, name, { ebirdCode: ebirdCode.trim() });
    }
  }

  const europePoints = safeParseRecord(localStorage.getItem("bm_eu_points"));
  for (const [name, point] of Object.entries(europePoints)) {
    if (!point || typeof point !== "object") continue;
    const ebirdCode = typeof (point as any).ebirdCode === "string" ? (point as any).ebirdCode.trim() : "";
    const rarityLevel = normalizeRarityLevel(point as any);
    if (ebirdCode) mergeIn(next, name, { ebirdCode });
    mergeIn(next, name, { rarityLevel });
  }

  localStorage.setItem(scope.speciesMetaMigratedKey, "1");
  return next;
}

export function saveSpeciesMeta(map: SpeciesMetaMap, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const out: SpeciesMetaMap = {};
  Object.entries(map || {}).forEach(([name, meta]) => {
    out[name] = sanitizeMeta(name, meta);
  });
  localStorage.setItem(scope.speciesMetaStorageKey, JSON.stringify(out));
  localStorage.setItem(scope.speciesMetaLocalUpdatedAtKey, new Date().toISOString());
}

export function loadSpeciesMeta(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): SpeciesMetaMap {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  const raw = safeParseRecord(localStorage.getItem(scope.speciesMetaStorageKey));
  const cleaned: SpeciesMetaMap = {};
  Object.entries(raw).forEach(([name, meta]) => {
    const key = normalizeSpeciesName(name);
    if (!key) return;
    cleaned[key] = sanitizeMeta(key, meta);
  });
  const migrated = migrateLegacyIfNeeded(cleaned, scope);

  // Fill in default eBird codes for any species that don't have one
  let defaultsApplied = 0;
  for (const [speciesName, ebirdCode] of Object.entries(DEFAULT_EBIRD_CODES)) {
    const key = normalizeSpeciesName(speciesName);
    if (!key) continue;
    if (!migrated[key]) {
      migrated[key] = { name: key };
    }
    if (!migrated[key].ebirdCode) {
      migrated[key].ebirdCode = ebirdCode;
      defaultsApplied++;
    }
  }
  if (defaultsApplied > 0) {
    console.info(`[speciesMeta] Applied ${defaultsApplied} default eBird codes`);
  }

  saveSpeciesMeta(migrated, scope);
  return migrated;
}

export function getSpeciesMeta(name: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): SpeciesMeta {
  const map = loadSpeciesMeta(scope);
  const key = normalizeSpeciesName(name);
  const meta = map[key] ?? { name: key };
  if (!meta.ebirdCode && DEFAULT_EBIRD_CODES[name]) {
    meta.ebirdCode = DEFAULT_EBIRD_CODES[name];
  }
  return meta;
}

export function getDefaultEbirdCode(name: string): string | undefined {
  return DEFAULT_EBIRD_CODES[name];
}

export function getScopedSpeciesMeta(
  name: string,
  scope: SpeciesScopeConfig = LINNULIIGID_SCOPE,
  fallbackMap?: SpeciesMetaLookupFallback,
): SpeciesMetaLookupResult {
  const key = normalizeSpeciesName(name);
  const map = loadSpeciesMeta(scope);
  const stored = map[key];
  const fallback = fallbackMap?.[key];
  const ebirdFallback = STATIC_EBIRD_CODE_FALLBACKS[key];
  const merged = sanitizeMeta(key, {
    ...(fallback || {}),
    ...(stored || {}),
    ...(ebirdFallback && !stored?.ebirdCode && !(fallback as SpeciesMeta | undefined)?.ebirdCode ? { ebirdCode: ebirdFallback } : {}),
    name: key,
  });
  return {
    ...merged,
    resolvedKey: key,
    found: Boolean(stored || fallback || ebirdFallback),
  };
}

export function getRariliinSpeciesMeta(name: string, fallbackMap?: SpeciesMetaLookupFallback): SpeciesMetaLookupResult {
  return getScopedSpeciesMeta(name, RARILIIN_SCOPE, fallbackMap);
}

export function buildSpeciesMetaLookupFallback(items: unknown): SpeciesMetaLookupFallback {
  const next: SpeciesMetaLookupFallback = {};
  if (!Array.isArray(items)) return next;
  items.forEach((item) => {
    const key = normalizeUiText(String((item as ScopeSpeciesMeta | null)?.estonianName || ""));
    if (!key) return;
    next[key] = {
      scientificName: normalizeUiText(String((item as ScopeSpeciesMeta | null)?.scientificName || "")) || undefined,
      rariliinCode: normalizeUiText(String((item as ScopeSpeciesMeta | null)?.rariliinCode || "")) || undefined,
      notificationNote: normalizeUiText(String((item as ScopeSpeciesMeta | null)?.notificationNote || "")) || undefined,
    };
  });
  return next;
}

export function seedSpeciesMetaFallback(
  fallbackMap: SpeciesMetaLookupFallback,
  scope: SpeciesScopeConfig = LINNULIIGID_SCOPE,
): { changed: boolean; map: SpeciesMetaMap } {
  const current = loadSpeciesMeta(scope);
  const next: SpeciesMetaMap = { ...current };
  let changed = false;

  Object.entries(fallbackMap || {}).forEach(([name, fallback]) => {
    const key = normalizeSpeciesName(name);
    if (!key) return;
    const prev = next[key] ?? { name: key };
    const patch: Partial<SpeciesMeta> = {};

    if (!prev.scientificName && fallback.scientificName) patch.scientificName = fallback.scientificName;
    if (!prev.rariliinCode && fallback.rariliinCode) patch.rariliinCode = fallback.rariliinCode;
    if (!prev.notificationNote && fallback.notificationNote) patch.notificationNote = fallback.notificationNote;

    if (Object.keys(patch).length === 0) {
      if (!next[key]) next[key] = sanitizeMeta(key, prev);
      return;
    }

    next[key] = sanitizeMeta(key, { ...prev, ...patch, name: key });
    changed = true;
  });

  if (changed) saveSpeciesMeta(next, scope);
  return { changed, map: changed ? next : current };
}

export function upsertSpeciesMeta(name: string, partial: Partial<SpeciesMeta>, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  const key = normalizeSpeciesName(name);
  if (!key) return;
  const map = loadSpeciesMeta(scope);
  const prev = map[key] ?? { name: key };
  map[key] = sanitizeMeta(key, { ...prev, ...partial, name: key });
  saveSpeciesMeta(map, scope);
}

export function replaceSpeciesMeta(map: SpeciesMetaMap, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  saveSpeciesMeta(map, scope);
}
