/**
 * Authoritative Latin scientific name → Estonian common name dictionary.
 * Used as post-processing after AI translation to fix incorrect bird names.
 */
export const LATIN_TO_ESTONIAN = new Map<string, string>([
  // Divers / Loons
  ["gavia stellata", "punakurk-kaur"],
  ["gavia arctica", "järvekaur"],
  ["gavia immer", "jääkaur"],
  // Grebes
  ["podiceps cristatus", "tuttpütt"],
  ["podiceps grisegena", "hallpõsk-pütt"],
  ["podiceps auritus", "sarvikpütt"],
  ["podiceps nigricollis", "mustkael-pütt"],
  ["tachybaptus ruficollis", "väikepütt"],
  // Shearwaters & Petrels
  ["ardenna grisea", "peegel-tormilind"],
  ["puffinus puffinus", "atlantise tormilind"],
  ["fulmarus glacialis", "põhja-tormipääsu"],
  // Cormorants
  ["phalacrocorax carbo", "kormoran"],
  ["microcarbo pygmaeus", "kääbuskormoran"],
  // Herons
  ["ardea cinerea", "hallhaigur"],
  ["ardea alba", "hõbehaigur"],
  ["ardea purpurea", "purpurhaigur"],
  ["egretta garzetta", "siidhaigur"],
  ["bubulcus ibis", "veisehaigur"],
  ["ixobrychus minutus", "hüüp"],
  ["botaurus stellaris", "hüüp"],
  ["nycticorax nycticorax", "ööshaigur"],
  // Storks
  ["ciconia ciconia", "valge-toonekurg"],
  ["ciconia nigra", "must-toonekurg"],
  // Ibises
  ["platalea leucorodia", "luitsnokk-iibis"],
  ["plegadis falcinellus", "tõmmuiibis"],
  // Swans
  ["cygnus olor", "kühmnokk-luik"],
  ["cygnus cygnus", "laululuik"],
  ["cygnus bewickii", "väikeluik"],
  ["cygnus columbianus", "väikeluik"],
  // Geese
  ["anser fabalis", "suur-laukhani"],
  ["anser brachyrhynchus", "lühinokk-hani"],
  ["anser albifrons", "valgepõsk-lagle"],
  ["anser erythropus", "kiljuhani"],
  ["anser anser", "hallhani"],
  ["anser caerulescens", "lumehani"],
  ["branta leucopsis", "valgepõsk-lagle"],
  ["branta bernicla", "mustlagle"],
  ["branta canadensis", "kanada lagle"],
  ["branta ruficollis", "punakael-lagle"],
  // Ducks
  ["tadorna tadorna", "ristpart"],
  ["anas platyrhynchos", "sinikael-part"],
  ["anas crecca", "piilpart"],
  ["anas acuta", "sõtkas"],
  ["spatula clypeata", "luitsnokk-part"],
  ["spatula querquedula", "rägapart"],
  ["mareca penelope", "viupart"],
  ["mareca strepera", "rääkspart"],
  ["aythya ferina", "punapea-vart"],
  ["aythya fuligula", "tuttvart"],
  ["aythya marila", "merivart"],
  ["aythya nyroca", "valgesilm-vart"],
  ["aythya collaris", "lannuvart"],
  ["bucephala clangula", "sõtkas"],
  ["clangula hyemalis", "aul"],
  ["melanitta fusca", "tõmmuvaeras"],
  ["melanitta nigra", "mustvaeras"],
  ["melanitta stejnegeri", "siberi tõmmuvaeras"],
  ["melanitta deglandi", "ida-mustvaeras"],
  ["somateria mollissima", "hahk"],
  ["somateria spectabilis", "kuninghahk"],
  ["polysticta stelleri", "kirjuhahk"],
  ["mergus merganser", "jääkoskel"],
  ["mergus serrator", "rohukoskel"],
  ["mergellus albellus", "väikekoskel"],
  // Raptors
  ["haliaeetus albicilla", "merikotkas"],
  ["aquila chrysaetos", "kaljukotkas"],
  ["aquila clanga", "suur-konnakotkas"],
  ["clanga clanga", "suur-konnakotkas"],
  ["aquila pomarina", "väike-konnakotkas"],
  ["clanga pomarina", "väike-konnakotkas"],
  ["aquila nipalensis", "stepikotkas"],
  ["hieraaetus pennatus", "kääbuskotkas"],
  ["pandion haliaetus", "kalakotkas"],
  ["buteo buteo", "hiireviu"],
  ["buteo lagopus", "karvasjalg-viu"],
  ["pernis apivorus", "herilaseviu"],
  ["milvus milvus", "puna-harksaba"],
  ["milvus migrans", "must-harksaba"],
  ["circus aeruginosus", "roo-loorkull"],
  ["circus cyaneus", "soo-loorkull"],
  ["circus pygargus", "stepi-loorkull"],
  ["circus macrourus", "stepi-loorkull"],
  ["accipiter gentilis", "kanakull"],
  ["accipiter nisus", "raudkull"],
  ["falco peregrinus", "rabapistrik"],
  ["falco subbuteo", "lõopistrik"],
  ["falco columbarius", "piiritaja"],
  ["falco tinnunculus", "tuuletallaja"],
  ["falco vespertinus", "punajalg-pistrik"],
  ["falco rusticolus", "jahipistrik"],
  // Gamebirds
  ["tetrao urogallus", "metsis"],
  ["lyrurus tetrix", "teder"],
  ["tetrastes bonasia", "laanepüü"],
  ["lagopus lagopus", "rabapüü"],
  ["perdix perdix", "nurmkana"],
  ["coturnix coturnix", "põldvutt"],
  // Rails & Crane
  ["grus grus", "sookurg"],
  ["rallus aquaticus", "rooruik"],
  ["crex crex", "rukkirääk"],
  ["porzana porzana", "täpikhuik"],
  ["gallinula chloropus", "tait"],
  ["fulica atra", "lauk"],
  // Waders
  ["haematopus ostralegus", "merisk"],
  ["recurvirostra avosetta", "naaskelnokk"],
  ["vanellus vanellus", "kiivitaja"],
  ["pluvialis apricaria", "rüüt"],
  ["pluvialis squatarola", "tundrarüüt"],
  ["charadrius dubius", "väiketüll"],
  ["charadrius hiaticula", "liivatüll"],
  ["numenius arquata", "suurkoovitaja"],
  ["numenius phaeopus", "väikekoovitaja"],
  ["limosa limosa", "mustsaba-vigle"],
  ["limosa lapponica", "punapõsk-vigle"],
  ["scolopax rusticola", "metskurvits"],
  ["gallinago gallinago", "rohunepp"],
  ["lymnocryptes minimus", "mudanepp"],
  ["tringa totanus", "punajalg-tilder"],
  ["tringa nebularia", "heletilder"],
  ["tringa glareola", "mudatilder"],
  ["tringa ochropus", "metstilder"],
  ["actitis hypoleucos", "jõgitilder"],
  ["philomachus pugnax", "tuttvart"],
  ["calidris pugnax", "tuttvart"],
  ["calidris alpina", "soorüdi"],
  ["calidris minuta", "väikerüdi"],
  ["calidris temminckii", "leeterüdi"],
  ["calidris ferruginea", "kõvernokk-rüdi"],
  ["calidris canutus", "ruugerüdi"],
  ["calidris alba", "alverüdi"],
  ["arenaria interpres", "kivirullija"],
  ["phalaropus lobatus", "veetallaja"],
  // Skuas & Gulls
  ["larus ridibundus", "naerukajakas"],
  ["chroicocephalus ridibundus", "naerukajakas"],
  ["larus argentatus", "hõbekajakas"],
  ["larus fuscus", "tõmmukajakas"],
  ["larus canus", "kalakajakas"],
  ["larus marinus", "merikajakas"],
  ["larus minutus", "väikekajakas"],
  ["hydrocoloeus minutus", "väikekajakas"],
  // Terns
  ["sterna hirundo", "jõgitiir"],
  ["sterna paradisaea", "randtiir"],
  ["sternula albifrons", "väiketiir"],
  ["chlidonias niger", "mustviires"],
  ["chlidonias leucopterus", "valgetiib-viires"],
  // Auks
  ["alca torda", "alk"],
  // Pigeons & Doves
  ["columba livia", "kodutuvi"],
  ["columba palumbus", "kaelustuvi"],
  ["streptopelia turtur", "kaelus-turteltuvi"],
  ["streptopelia decaocto", "kaelus-turteltuvi"],
  // Owls
  ["bubo bubo", "kassikakk"],
  ["strix aluco", "kodukakk"],
  ["strix uralensis", "händkakk"],
  ["strix nebulosa", "habekakk"],
  ["asio otus", "kõrvukräts"],
  ["asio flammeus", "soo-loorkull"],
  ["aegolius funereus", "karvasjalg-kakk"],
  ["glaucidium passerinum", "värbkakk"],
  ["surnia ulula", "loorkakk"],
  ["nyctea scandiaca", "lumekakk"],
  ["bubo scandiacus", "lumekakk"],
  // Nightjars & Swifts
  ["caprimulgus europaeus", "öösorr"],
  ["apus apus", "piiritaja"],
  // Kingfisher, Bee-eater, Roller, Hoopoe
  ["alcedo atthis", "jäälind"],
  ["merops apiaster", "mesilasenäpp"],
  ["coracias garrulus", "siniraag"],
  ["upupa epops", "vaenukägu"],
  // Cuckoo
  ["cuculus canorus", "kägu"],
  // Woodpeckers
  ["dryocopus martius", "musträhn"],
  ["dendrocopos major", "suur-kirjurähn"],
  ["dendrocopos minor", "väike-kirjurähn"],
  ["dendrocopos leucotos", "valgeselg-kirjurähn"],
  ["dendrocopos medius", "tamme-kirjurähn"],
  ["picus canus", "hallpea-rähn"],
  ["picus viridis", "roherähn"],
  ["picoides tridactylus", "laanerähn"],
  ["jynx torquilla", "käosulane"],
  // Larks
  ["alauda arvensis", "põldlõoke"],
  ["lullula arborea", "nõmmelõoke"],
  ["eremophila alpestris", "sarviklõoke"],
  ["galerida cristata", "tuttlõoke"],
  // Swallows & Martins
  ["hirundo rustica", "suitsupääsuke"],
  ["delichon urbicum", "räästapääsuke"],
  ["riparia riparia", "kaldapääsuke"],
  // Pipits & Wagtails
  ["anthus pratensis", "niidukiur"],
  ["anthus trivialis", "metskiur"],
  ["anthus campestris", "nõmmekiur"],
  ["anthus cervinus", "tundrakiur"],
  ["anthus spinoletta", "mägikiur"],
  ["motacilla flava", "linavästrik"],
  ["motacilla alba", "jõgivästrik"],
  // Wrens & Dippers
  ["troglodytes troglodytes", "käblik"],
  ["cinclus cinclus", "vesipapp"],
  // Accentors
  ["prunella modularis", "metsporr"],
  // Thrushes & Chats
  ["erithacus rubecula", "punarind"],
  ["luscinia luscinia", "ööbik"],
  ["luscinia svecica", "sinirind"],
  ["phoenicurus phoenicurus", "lepalind"],
  ["phoenicurus ochruros", "must-lepalind"],
  ["saxicola rubetra", "kadakatäks"],
  ["saxicola rubicola", "euroopa must-lepalind"],
  ["oenanthe oenanthe", "kivitäks"],
  ["turdus merula", "musträstas"],
  ["turdus pilaris", "hallrästas"],
  ["turdus philomelos", "laulurästas"],
  ["turdus iliacus", "vainurästas"],
  ["turdus viscivorus", "hoburästas"],
  ["turdus torquatus", "kaelusrästas"],
  // Warblers
  ["acrocephalus scirpaceus", "aed-roolind"],
  ["acrocephalus schoenobaenus", "kõrkja-roolind"],
  ["acrocephalus arundinaceus", "rästas-roolind"],
  ["acrocephalus palustris", "soo-roolind"],
  ["locustella naevia", "niidu-ritsiklind"],
  ["locustella fluviatilis", "jõgi-ritsiklind"],
  ["phylloscopus trochilus", "salu-lehelind"],
  ["phylloscopus collybita", "mets-lehelind"],
  ["phylloscopus sibilatrix", "kuld-lehelind"],
  ["phylloscopus borealis", "põhja-lehelind"],
  ["phylloscopus trochiloides", "nõlva-lehelind"],
  ["sylvia atricapilla", "mustpea-põõsalind"],
  ["sylvia communis", "aed-põõsalind"],
  ["sylvia borin", "aed-põõsalind"],
  ["sylvia curruca", "väike-põõsalind"],
  ["sylvia nisoria", "pruunselg-põõsalind"],
  ["hippolais icterina", "koldvint"],
  ["regulus regulus", "pöialpoiss"],
  // Flycatchers
  ["muscicapa striata", "hall-kärbsenäpp"],
  ["ficedula hypoleuca", "must-kärbsenäpp"],
  ["ficedula parva", "kaelus-kärbsenäpp"],
  ["ficedula albicollis", "valgekaelus-kärbsenäpp"],
  // Tits
  ["parus major", "rasvatihane"],
  ["cyanistes caeruleus", "sinitihane"],
  ["periparus ater", "musttihane"],
  ["poecile montanus", "põhjatihane"],
  ["poecile palustris", "salutihane"],
  ["lophophanes cristatus", "tutt-tihane"],
  ["aegithalos caudatus", "sabatihane"],
  ["remiz pendulinus", "kukkurtihane"],
  ["panurus biarmicus", "roohabekas"],
  // Nuthatches & Treecreepers
  ["sitta europaea", "puukoristaja"],
  ["certhia familiaris", "porr"],
  // Shrikes
  ["lanius collurio", "punaselg-õgija"],
  ["lanius excubitor", "hallõgija"],
  ["lanius minor", "mustlauk-õgija"],
  ["lanius senator", "punapea-õgija"],
  // Crows & allies
  ["corvus corax", "ronk"],
  ["corvus cornix", "hallvares"],
  ["corvus frugilegus", "künnivares"],
  ["corvus monedula", "hakk"],
  ["coloeus monedula", "hakk"],
  ["pica pica", "harakas"],
  ["garrulus glandarius", "pasknäär"],
  ["nucifraga caryocatactes", "laanenäär"],
  ["perisoreus infaustus", "koldvint"],
  // Starling
  ["sturnus vulgaris", "kuldnokk"],
  ["pastor roseus", "roosa-kuldnokk"],
  // Sparrows
  ["passer domesticus", "koduvarblane"],
  ["passer montanus", "põldvarblane"],
  // Finches
  ["fringilla coelebs", "metsvint"],
  ["fringilla montifringilla", "põhjavint"],
  ["carduelis carduelis", "ohakalind"],
  ["chloris chloris", "rohevint"],
  ["spinus spinus", "siisike"],
  ["linaria cannabina", "kanepilind"],
  ["acanthis flammea", "urvalind"],
  ["loxia curvirostra", "kuuse-käbilind"],
  ["loxia pytyopsittacus", "männi-käbilind"],
  ["pyrrhula pyrrhula", "leevike"],
  ["carpodacus erythrinus", "karmiinleevike"],
  ["coccothraustes coccothraustes", "suurnokk-vint"],
  ["pinicola enucleator", "männileevike"],
  // Buntings
  ["emberiza citrinella", "talvike"],
  ["emberiza hortulana", "aed-tsiitsitaja"],
  ["emberiza schoeniclus", "rootsiitsitaja"],
  ["emberiza rustica", "põhjatsiitsitaja"],
  ["calcarius lapponicus", "lapi tsiitsitaja"],
  ["plectrophenax nivalis", "hangelind"],
  // Other
  ["bombycilla garrulus", "siidisaba"],
  ["oriolus oriolus", "peoleo"],
]);

/**
 * Post-process translated text to fix bird names using Latin→Estonian dictionary.
 * Looks for Latin binomials (in parentheses or standalone) and corrects the
 * preceding Estonian name if it doesn't match the dictionary.
 */
export function fixBirdNamesInText(text: string): string {
  if (!text) return text;

  // Pattern 1: "some-name (Genus species)" → "correct-name (Genus species)"
  // Matches word(s) before a parenthesized Latin binomial
  let result = text.replace(
    /([\p{L}\-]+(?:\s+[\p{L}\-]+){0,3})\s*\(([A-Z][a-z]+\s+[a-z]+)\)/gu,
    (match, _estName, latinName) => {
      const correct = LATIN_TO_ESTONIAN.get(latinName.toLowerCase());
      if (correct) {
        return `${correct} (${latinName})`;
      }
      return match;
    },
  );

  // Pattern 2: Standalone Latin binomials NOT already inside parentheses.
  // Only replace if the Latin name is in our dictionary (avoids false positives
  // on place/person names). Adds the Estonian name before the Latin name.
  result = result.replace(
    /(?<!\()(?<!\w)\b([A-Z][a-z]+\s+[a-z]+)\b(?!\))/g,
    (match, latinName) => {
      const correct = LATIN_TO_ESTONIAN.get(latinName.toLowerCase());
      if (correct) {
        return `${correct} (${latinName})`;
      }
      return match;
    },
  );

  return result;
}
