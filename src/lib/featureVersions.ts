// src/lib/featureVersions.ts
// Per-feature versions and changelog. Versions are DERIVED from the change list:
// the first change is 1.0.0; each later 'major' / 'minor' / 'patch' bumps that part.
// To bump a feature: append ONE change (oldest -> newest order) with today's date
// (Europe/Tallinn), the P-number as ref, the kind and a short Estonian text.
// Keep this file ASCII: write Estonian letters as \u escapes (\u00e4 = a-umlaut,
// \u00f5 = o-tilde, \u00f6 = o-umlaut, \u00fc = u-umlaut, \u00c4 \u00d5 \u00d6 \u00dc).
// featureVersions.test.ts enforces order, kinds and ASCII.

export type FeatureArea = 'kaart' | 'ulevaade' | 'uudised' | 'uritused' | 'seaded' | 'rakendus';
export type FeatureId =
  | 'linnuliigid'
  | 'euroopa'
  | 'rariliin'
  | 'ebird-ee'
  | 'tuulekaart'
  | 'kevadranne'
  | 'toenaosus'
  | 'toenaosus-ruudud'
  | 'randeajad'
  | 'ennustus'
  | 'trektellen'
  | 'juhend'
  | 'ulevaade'
  | 'ulevaade-eesti'
  | 'ulevaade-euroopa'
  | 'ulevaade-saabujad'
  | 'ulevaade-toenaosus'
  | 'ulevaade-naabermaad'
  | 'uudised'
  | 'uudised-tolge'
  | 'uritused'
  | 'uritused-lisamine'
  | 'seaded'
  | 'seaded-kasutajad'
  | 'seaded-liigid'
  | 'seaded-uudiste-allikad'
  | 'seaded-diagnostika'
  | 'navigeerimine'
  | 'teavitused';
export type ChangeKind = 'major' | 'minor' | 'patch';

export type FeatureChange = {
  readonly date: string;
  readonly ref: string;
  readonly kind: ChangeKind;
  readonly text: string;
};

export type Feature = {
  readonly id: FeatureId;
  readonly area: FeatureArea;
  readonly name: string;
  /** Oldest first. */
  readonly changes: readonly FeatureChange[];
};

export type VersionedChange = FeatureChange & { readonly version: string };

export const FEATURE_AREAS: readonly { readonly id: FeatureArea; readonly name: string }[] = [
  { id: 'kaart', name: 'Kaart' },
  { id: 'ulevaade', name: '\u00dclevaade' },
  { id: 'uudised', name: 'Uudised' },
  { id: 'uritused', name: '\u00dcritused' },
  { id: 'seaded', name: 'Seaded' },
  { id: 'rakendus', name: 'Rakendus' },
];

export const FEATURES: readonly Feature[] = [
  {
    id: 'linnuliigid',
    area: 'kaart',
    name: 'Linnuliigid (EE)',
    changes: [
      { date: '2026-02-19', ref: 'ee15a21', kind: 'major', text: 'Linnuliigid kaart rakenduses: 7 p\u00e4eva filter ja liigiavatarid' },
      { date: '2026-02-20', ref: 'c6750ef', kind: 'minor', text: 'Serveri hetkt\u00f5mmis ja kaardi automaatne v\u00e4rskendus' },
      { date: '2026-03-04', ref: '873d4a5', kind: 'minor', text: 'Elurikkuse v\u00e4rsked vaatlused koos koordinaatidega' },
      { date: '2026-03-08', ref: '30d59e7', kind: 'minor', text: 'Kasutajap\u00f5hised filtrid ja liikide valik' },
      { date: '2026-09-18', ref: 'P37a', kind: 'major', text: 'Uus k\u00fclgriba: kompaktsed read, Filtrid ja mobiili t\u00e4isekraaniloend' },
      { date: '2026-09-18', ref: 'P38a', kind: 'minor', text: 'Elurikkuse andmekaart laiendatud reas' },
      { date: '2026-09-21', ref: 'P55', kind: 'patch', text: 'Elurikkuse silt n\u00e4itab kohalikku uuendusaega' },
      { date: '2026-09-21', ref: 'P56', kind: 'patch', text: 'Topeltliik J\u00f5gitilder eemaldatud (= Vihitaja)' },
      { date: '2026-09-22', ref: 'P58c', kind: 'minor', text: 'Liigipinnid ja vaatluskaart v2' },
      { date: '2026-09-22', ref: 'P58b', kind: 'minor', text: 'Vaatluse kellaaeg kaardil ja h\u00fcpikaknas' },
      { date: '2026-09-22', ref: 'P59', kind: 'patch', text: 'Puhtam asukoht ja vaatlusaeg, kaardi read kahel real' },
      { date: '2026-09-22', ref: 'P60b', kind: 'minor', text: 'Kompaktsed kaardid Elurikkuse, eBirdi ja GBIF-i vaatlustele ning harulduse sildid' },
      { date: '2026-09-22', ref: 'P61', kind: 'minor', text: 'Allikakaardid liigikaardi \u00fclesehitusega' },
      { date: '2026-09-22', ref: 'P63', kind: 'patch', text: 'Kaardid sulguvad kaugemale suumides' },
      { date: '2026-09-22', ref: 'P68', kind: 'patch', text: 'Markerite kattumine ja kaardi vilkumine parandatud' },
      { date: '2026-09-23', ref: 'P71', kind: 'minor', text: 'Filtrid: l\u00fcliti \u201ePeida n\u00e4htud liigid\u201c' },
      { date: '2026-09-24', ref: 'P80b', kind: 'minor', text: 'Elurikkuse kaardil m\u00e4rkus ja fotod' },
      { date: '2026-09-25', ref: 'P82', kind: 'minor', text: 'Meediariba sildiga \u201eFotoga vaatlus\u201c' },
      { date: '2026-09-25', ref: 'P83', kind: 'patch', text: 'Telefonis v\u00e4iksemad kaardid, mis ei j\u00e4\u00e4 valiku ega doki alla' },
      { date: '2026-09-30', ref: 'P87a+b', kind: 'patch', text: 'T\u00e4psed koordinaadid ei kao hetkt\u00f5mmise uuendamisel' },
      { date: '2026-09-30', ref: 'P88c+d', kind: 'minor', text: 'Elurikkuse andmed tuuakse andmebaasi kaudu (pg_net)' },
      { date: '2026-09-30', ref: 'P89c', kind: 'minor', text: 'Elurikkuse uute vaatluste kontroll iga 30 minuti j\u00e4rel' },
      { date: '2026-09-30', ref: 'P91a', kind: 'patch', text: 'Vanem hetkt\u00f5mmis ei kirjuta uuemat vaatlust \u00fcle' },
      { date: '2026-10-07', ref: 'P96', kind: 'patch', text: 'Elurikkuse t\u00e4isuuendus neli korda p\u00e4evas' },
      { date: '2026-10-07', ref: 'P97c4b', kind: 'minor', text: 'Foto autori rida kaartidel' },
      { date: '2026-10-07', ref: 'P100', kind: 'patch', text: 'V\u00e4ikeste markerite nihutus ainult sama koha markeritele' },
      { date: '2026-10-08', ref: 'P103', kind: 'patch', text: 'Filtrid n\u00e4itab Elurikkuse serveri p\u00e4ringu aega' },
    ],
  },
  {
    id: 'euroopa',
    area: 'kaart',
    name: 'Euroopa',
    changes: [
      { date: '2026-02-20', ref: 'cec85ce', kind: 'major', text: 'Euroopa kaart: eBirdi vaatlused riikide kaupa' },
      { date: '2026-02-21', ref: 'c16120d', kind: 'minor', text: 'Kaart laeb serveri hetkt\u00f5mmise' },
      { date: '2026-02-28', ref: 'd02fdb0', kind: 'minor', text: 'Avatarmarkerid koos arvu ja haruldusega, suurus s\u00f5ltub suumist' },
      { date: '2026-08-30', ref: 'M7.1', kind: 'minor', text: 'eBirdi ajastatud v\u00e4rskendus Netlify kaudu' },
      { date: '2026-09-24', ref: 'P74b', kind: 'major', text: 'Nimi Euroopa ja uus k\u00fclgriba' },
      { date: '2026-09-24', ref: 'P74c', kind: 'minor', text: 'Pinnimarkerid v2 ja eBirdi kaardid' },
      { date: '2026-09-24', ref: 'P75b+c', kind: 'minor', text: 'Kontrollnimekirja lingid ja r\u00e4ndeaeg R\u00e4ndeaegade andmetest' },
      { date: '2026-09-24', ref: 'P76', kind: 'minor', text: 'Haruldaste liikide k\u00e4sitsi m\u00e4\u00e4ratud r\u00e4ndeajad' },
      { date: '2026-09-24', ref: 'P77c', kind: 'minor', text: 'Riigilipud pinnidel, kommentaarikast ja viimased vaatlused riigiti' },
      { date: '2026-09-24', ref: 'P78a', kind: 'minor', text: 'eBirdi meediafailide arv kaardil' },
      { date: '2026-09-24', ref: 'P79b', kind: 'patch', text: 'Kiirem liigiandmete laadimine ja pinnid ilma CSS-filtriteta' },
      { date: '2026-09-25', ref: 'P82', kind: 'minor', text: 'Meediariba sildiga \u201eFotoga vaatlus\u201c' },
      { date: '2026-09-25', ref: 'P83', kind: 'patch', text: 'Telefonis v\u00e4iksemad kaardid, mis ei j\u00e4\u00e4 valiku ega doki alla' },
      { date: '2026-10-07', ref: 'P97c4c', kind: 'minor', text: 'Foto autori rida kaardil' },
      { date: '2026-10-08', ref: 'P104d', kind: 'minor', text: 'T\u00e4iesti uued liigid lisatakse automaatselt eBirdi teadetest' },
      { date: '2026-10-08', ref: 'P107', kind: 'minor', text: 'Kaart n\u00e4itab liigi k\u00f5iki 7 p\u00e4eva asukohti riigis' },
      { date: '2026-10-09', ref: 'P107c', kind: 'minor', text: '7 p\u00e4eva asukohad liigiavataridena koos vaatluskaardiga' },
      { date: '2026-10-09', ref: 'P107d', kind: 'patch', text: '\u201eUusim riik\u201c kaart laeb asukohad k\u00f5igist aktiivsetest riikidest' },
      { date: '2026-10-09', ref: 'P110', kind: 'patch', text: 'Peidetud liigid tulevad 1. jaanuaril tagasi n\u00e4htavale' },
      { date: '2026-10-09', ref: 'P105d', kind: 'minor', text: 'GPS-saatjaga lindude kiht Movebankist' },
      { date: '2026-10-09', ref: 'P105f', kind: 'patch', text: 'GPS-kihist eemaldatud Movebanki vigased asukohad' },
      { date: '2026-10-09', ref: 'P105g', kind: 'patch', text: 'GPS-linnu kaardil uuringu viide' },
    ],
  },
  {
    id: 'rariliin',
    area: 'kaart',
    name: 'Rariliin',
    changes: [
      { date: '2026-03-10', ref: 'e0bf108', kind: 'major', text: 'Rariliini kaart' },
      { date: '2026-07-17', ref: '4ef5917', kind: 'minor', text: 'eBird EE kiht ja Elurikkuse koordinaadid serverist' },
      { date: '2026-09-25', ref: 'P84b', kind: 'major', text: 'Uus k\u00fclgriba Linnuliigid kaardi eeskujul' },
      { date: '2026-09-25', ref: 'P84c', kind: 'minor', text: 'Pinnimarkerid v2 ning Elurikkuse ja eBirdi kaardid' },
      { date: '2026-09-25', ref: 'P84d', kind: 'minor', text: 'Teade \u201eUued leiud\u201c ja rea kl\u00f5ps avab markeri kaardi' },
      { date: '2026-09-25', ref: 'P84e', kind: 'patch', text: '\u00dclevaatuse parandused: kaardid, sortimine, teated' },
      { date: '2026-09-25', ref: 'P84g', kind: 'minor', text: 'Elurikkuse ja eBirdi vaatluste ajalugu kaardil' },
      { date: '2026-10-04', ref: 'P93', kind: 'patch', text: 'Uute leidude teade uueneb p\u00e4rast Elurikkuse v\u00e4rskendust' },
      { date: '2026-10-07', ref: 'P97c4c', kind: 'minor', text: 'Foto autori rida h\u00fcpikaknas' },
      { date: '2026-10-08', ref: 'P104f', kind: 'minor', text: 'Automaatselt lisatud uued liigid j\u00f5uavad ka Rariliini' },
      { date: '2026-10-09', ref: 'P110', kind: 'patch', text: 'Peidetud liigid tulevad 1. jaanuaril tagasi n\u00e4htavale' },
    ],
  },
  {
    id: 'ebird-ee',
    area: 'kaart',
    name: 'eBird EE kiht',
    changes: [
      { date: '2026-04-03', ref: '14f3c3d', kind: 'major', text: 'eBirdi Eesti vaatluste kiht Linnuliigid kaardil' },
      { date: '2026-04-10', ref: 'd298cb9', kind: 'minor', text: 'eBirdi v\u00e4rskendusahel ja vahem\u00e4lu' },
      { date: '2026-08-30', ref: 'M7.1', kind: 'minor', text: 'Ajastatud v\u00e4rskendus Netlify kaudu (n8n asemel)' },
      { date: '2026-09-22', ref: 'P64', kind: 'major', text: 'eBirdi marker ja kaart kasutavad liigipinni ja liigikaarti' },
      { date: '2026-09-22', ref: 'P64c', kind: 'minor', text: 'Liigi 7 p\u00e4eva voog: tegelik arv ja viimased vaatlused' },
      { date: '2026-09-22', ref: 'P65', kind: 'patch', text: 'Avatud kaart avaneb uuesti p\u00e4rast markerite uuendamist' },
      { date: '2026-09-24', ref: 'P80a', kind: 'minor', text: 'Vaatleja kommentaar ja meediafailide arv' },
      { date: '2026-09-25', ref: 'P80c', kind: 'patch', text: 'Kommentaarikast k\u00f5igil eBirdi kaartidel' },
    ],
  },
  {
    id: 'tuulekaart',
    area: 'kaart',
    name: 'Tuulekaart',
    changes: [
      { date: '2026-02-19', ref: '77667d0', kind: 'major', text: 'Tuulekaart r\u00e4nde hindamiseks' },
      { date: '2026-04-02', ref: '3edf7bc', kind: 'patch', text: 'Paneel t\u00e4idab kogu k\u00f5rguse' },
      { date: '2026-09-22', ref: 'P57', kind: 'patch', text: 'Paneel nihutatud, Ennustuse nupp ei kata sulgemisnuppu' },
    ],
  },
  {
    id: 'kevadranne',
    area: 'kaart',
    name: 'Kevadr\u00e4nne',
    changes: [
      { date: '2026-02-19', ref: '77667d0', kind: 'major', text: 'Kevadr\u00e4nne: liikide saabumiskuup\u00e4evad' },
      { date: '2026-03-08', ref: '6b79fd6', kind: 'minor', text: 'Kuup\u00e4evad s\u00fcnkroonitakse pilve' },
      { date: '2026-04-02', ref: 'a60a930', kind: 'patch', text: 'Paneeli paigutus parandatud' },
      { date: '2026-09-21', ref: 'P51', kind: 'major', text: 'Automaatsed saabumised Elurikkusest, T\u00f5en\u00e4osuse stiilis paneel' },
      { date: '2026-09-21', ref: 'P51c', kind: 'patch', text: 'K\u00fclgriba silt \u201eKevadine saabumine\u201c' },
      { date: '2026-09-21', ref: 'P53', kind: 'minor', text: 'R\u00e4ndeaja ajajoon iga saabunud liigi all' },
      { date: '2026-09-21', ref: 'P54b', kind: 'patch', text: 'Aasta vahetus Tallinna aja j\u00e4rgi, eelmise aasta saabumised kustuvad 1. jaanuaril' },
    ],
  },
  {
    id: 'toenaosus',
    area: 'kaart',
    name: 'T\u00f5en\u00e4osus',
    changes: [
      { date: '2026-04-03', ref: '0b708f9', kind: 'major', text: 'T\u00f5en\u00e4osuse paneel' },
      { date: '2026-04-14', ref: '7d5a097', kind: 'minor', text: 'Pilvevahem\u00e4lu' },
      { date: '2026-07-08', ref: '5d45691', kind: 'minor', text: '\u00dchendatud paneel: allikad, v\u00e4rskus ja plaadid' },
      { date: '2026-07-08', ref: 'fdfe16f', kind: 'minor', text: 'K\u00fclgriba graafik: vaatluste tulbad ja t\u00f5en\u00e4osuse joon' },
      { date: '2026-07-08', ref: 'cccbe19', kind: 'minor', text: 'Graafikul kogu aasta telg (jaanuar\u2013detsember)' },
      { date: '2026-07-14', ref: 'f0997b5', kind: 'minor', text: 'Elurikkuse ajalugu serverist' },
      { date: '2026-09-19', ref: 'P43', kind: 'major', text: 'Uus paneel: v\u00f6\u00f6filter, jaotised, protsendir\u00f5ngad, eBirdi ja eElurikkuse andmed' },
      { date: '2026-09-19', ref: 'P43c', kind: 'patch', text: 'V\u00f6\u00f6 sildid murduvad uuele reale' },
      { date: '2026-09-19', ref: 'P44b', kind: 'minor', text: 'Read n\u00e4itavad eBirdi 7 p\u00e4eva vaatlusi' },
      { date: '2026-09-19', ref: 'P45c', kind: 'minor', text: 'Telefonis infokaart vasakus alanurgas' },
      { date: '2026-09-20', ref: 'P47', kind: 'patch', text: 'GBIF-i andmed ainult Eestist' },
    ],
  },
  {
    id: 'toenaosus-ruudud',
    area: 'kaart',
    name: 'T\u00f5en\u00e4osuse ruudud',
    changes: [
      { date: '2026-04-04', ref: 'c7a2d37', kind: 'major', text: 'T\u00f5en\u00e4osuse ruudud kaardil' },
      { date: '2026-07-06', ref: '89e233c', kind: 'minor', text: 'Serveripoolne t\u00f5en\u00e4osuse arvutus' },
      { date: '2026-07-07', ref: 'aae4bd7', kind: 'minor', text: 'Ruudustik serveri vahem\u00e4lust k\u00f5igile kasutajatele' },
      { date: '2026-07-07', ref: 'c96cf61', kind: 'minor', text: 'Eestikeelne ruudu h\u00fcpikaken' },
      { date: '2026-07-08', ref: 'a3612b7', kind: 'minor', text: 'Trendi silt, \u201eParim aeg\u201c ja p\u00f5hjuste sildid' },
      { date: '2026-07-09', ref: '4cfa42a', kind: 'patch', text: 'Elurikkuse hiljutised vaatlused ajaloos' },
      { date: '2026-09-19', ref: 'P42', kind: 'major', text: 'Uus h\u00fcpikaken: statistika, parim aeg ja 12 kuu graafik' },
    ],
  },
  {
    id: 'randeajad',
    area: 'kaart',
    name: 'R\u00e4ndeajad',
    changes: [
      { date: '2026-09-19', ref: 'P46b', kind: 'major', text: 'R\u00e4ndeajad Linnuliigid k\u00fclgribal' },
      { date: '2026-09-19', ref: 'P46c', kind: 'minor', text: 'Reegel v3: l\u00e4bir\u00e4nde tipp suvise taseme kohal' },
      { date: '2026-09-20', ref: 'P46d', kind: 'minor', text: 'Aknad kaalutud loendatud isendite j\u00e4rgi' },
      { date: '2026-09-20', ref: 'P46f', kind: 'patch', text: 'N\u00e4dalakaalud normitud vaatluste hulga j\u00e4rgi' },
      { date: '2026-09-21', ref: 'P49', kind: 'minor', text: 'Rida \u201eenim isendeid\u201c kummagi r\u00e4ndeaja all' },
      { date: '2026-09-21', ref: 'P50', kind: 'minor', text: 'Reegel v5: aken h\u00f5lmab 70% \u00fclej\u00e4\u00e4gist' },
      { date: '2026-10-02', ref: 'P90', kind: 'patch', text: 'Koduvarblane paigaliste liikide hulka' },
      { date: '2026-10-06', ref: 'P95', kind: 'patch', text: 'Andmete vahem\u00e4lu ja kordus eba\u00f5nnestunud p\u00e4ringul' },
    ],
  },
  {
    id: 'ennustus',
    area: 'kaart',
    name: 'Ennustus',
    changes: [
      { date: '2026-03-12', ref: '8df632e', kind: 'major', text: 'Liigip\u00f5hine ennustus (Ennusta-nupp)' },
      { date: '2026-09-02', ref: 'M7.6', kind: 'minor', text: 'Sonneti anal\u00fc\u00fcs serveris (n8n asemel)' },
      { date: '2026-09-05', ref: 'Ennustus P6b', kind: 'major', text: 'Ennustatud saabumiskohtade kiht kaardil' },
      { date: '2026-09-07', ref: 'P6b.2', kind: 'minor', text: 'L\u00e4htemarker, j\u00e4rjestatud teekond ja kompaktne h\u00fcpikaken' },
      { date: '2026-09-09', ref: 'P5', kind: 'minor', text: 'Saabumise aeg igasse kohta 850 hPa tuule j\u00e4rgi' },
      { date: '2026-09-09', ref: 'P8b', kind: 'minor', text: 'V\u00e4rskeim l\u00e4htevaatlus liigi r\u00e4ndesektoris' },
      { date: '2026-09-10', ref: 'P9b', kind: 'minor', text: 'Teekonnad r\u00e4ndekoridore pidi lennut\u00fc\u00fcbi j\u00e4rgi' },
      { date: '2026-09-10', ref: 'P12', kind: 'minor', text: 'Seitse ankurkohta kirderannikul, Peipsi \u00e4\u00e4res, Tallinnas ja l\u00e4\u00e4nes' },
      { date: '2026-09-11', ref: 'P17b', kind: 'minor', text: 'Iga l\u00e4htevaatluse jaoks oma teekond' },
      { date: '2026-09-11', ref: 'P18', kind: 'minor', text: 'Naabermaade vaatluste arv markeril ja h\u00fcpikaknas' },
      { date: '2026-09-15', ref: 'P23', kind: 'minor', text: 'Vaatlused liigi hooajaliste l\u00e4htepiirkondade j\u00e4rgi' },
      { date: '2026-09-17', ref: 'P34', kind: 'patch', text: 'Koridoride kavandid 6\u201317' },
      { date: '2026-09-19', ref: 'P41', kind: 'minor', text: 'Ennustuse nupp ikoonina koos kohtade arvuga' },
      { date: '2026-09-24', ref: 'P73b', kind: 'patch', text: 'Fenoloogia: Soome ja Rootsi l\u00e4hted, s\u00fcgisene k\u00f5rvalekalle' },
    ],
  },
  {
    id: 'trektellen',
    area: 'kaart',
    name: 'Trektellen',
    changes: [
      { date: '2026-10-02', ref: 'P91', kind: 'major', text: 'Trektelleni 26 Eesti loenduskohta (kiht ainult linkidega)' },
    ],
  },
  {
    id: 'juhend',
    area: 'kaart',
    name: 'Juhend',
    changes: [
      { date: '2026-09-18', ref: 'P38b', kind: 'major', text: 'Juhend, \u201eMiks EstBirds\u201c ja kontakt abiaknas' },
      { date: '2026-09-25', ref: 'P84b', kind: 'minor', text: 'Juhend ka Rariliini kaardil' },
      { date: '2026-09-25', ref: 'P84e', kind: 'patch', text: 'Rariliini juhendi tekstid' },
    ],
  },
  {
    id: 'ulevaade',
    area: 'ulevaade',
    name: 'P\u00e4is ja hooaeg',
    changes: [
      { date: '2026-05-01', ref: '39b294f', kind: 'major', text: '\u00dclevaate vaheleht' },
      { date: '2026-05-02', ref: '67ec99d', kind: 'minor', text: 'Avatarid kaartidel' },
      { date: '2026-05-21', ref: '177570b', kind: 'minor', text: 'Windy s\u00fcnoptiline kaart' },
      { date: '2026-09-28', ref: 'P85a', kind: 'major', text: 'Hooajap\u00f5hine vaade, Arhiivi asemel Naabermaad' },
      { date: '2026-09-28', ref: 'P85b', kind: 'minor', text: 'P\u00e4is: perioodi rida, kolm arvu ja suurharulduste riba' },
      { date: '2026-09-28', ref: 'P85b2', kind: 'patch', text: 'SVG-lipud (Windowsis n\u00e4itasid emojilipud t\u00e4hti)' },
      { date: '2026-09-30', ref: 'P85h', kind: 'patch', text: 'V\u00e4rskenda-nupud eemaldatud' },
    ],
  },
  {
    id: 'ulevaade-eesti',
    area: 'ulevaade',
    name: 'Eesti',
    changes: [
      { date: '2026-05-03', ref: 'b69105b', kind: 'major', text: 'Haruldased vaatlused Eestis' },
      { date: '2026-05-22', ref: '762293e', kind: 'minor', text: 'Harulduste voog ja filtrid' },
      { date: '2026-09-30', ref: 'P85e', kind: 'minor', text: 'Kontrollnimekirja \u00fcksikasjad, vaatleja kommentaar ja fotod' },
      { date: '2026-09-30', ref: 'P85e2', kind: 'minor', text: '\u201eN\u00e4ita kaardil\u201c avab Rariliini kaardil liigi' },
      { date: '2026-09-30', ref: 'P85e3', kind: 'patch', text: '\u201eVaata vaatlust\u201c viib \u00f5igele Elurikkuse lehele' },
      { date: '2026-10-07', ref: 'P98', kind: 'major', text: '\u00dcks kaart liigi kohta' },
      { date: '2026-10-08', ref: 'P102', kind: 'patch', text: 'Isendite arv on alati n\u00e4ha' },
    ],
  },
  {
    id: 'ulevaade-euroopa',
    area: 'ulevaade',
    name: 'Euroopa',
    changes: [
      { date: '2026-05-22', ref: '762293e', kind: 'major', text: 'Haruldased vaatlused Euroopas' },
      { date: '2026-09-30', ref: 'P85e', kind: 'minor', text: 'Kontrollnimekirja \u00fcksikasjad, vaatleja kommentaar ja fotod' },
      { date: '2026-10-07', ref: 'P98b', kind: 'major', text: '\u00dcks kaart liigi kohta, riigilipp igal real' },
      { date: '2026-10-08', ref: 'P102', kind: 'patch', text: 'Isendite arv on alati n\u00e4ha' },
    ],
  },
  {
    id: 'ulevaade-saabujad',
    area: 'ulevaade',
    name: 'Saabujad',
    changes: [
      { date: '2026-05-05', ref: 'c9bb95b', kind: 'major', text: 'Saabujad: aasta esimesed vaatlused' },
      { date: '2026-05-07', ref: 'eaa6651', kind: 'patch', text: 'Liigiandmete ja kuup\u00e4evafiltri parandused' },
      { date: '2026-09-28', ref: 'P85a', kind: 'minor', text: 'N\u00e4ha 1. jaanuarist 1. juulini' },
    ],
  },
  {
    id: 'ulevaade-toenaosus',
    area: 'ulevaade',
    name: 'T\u00f5en\u00e4osus',
    changes: [
      { date: '2026-05-09', ref: 'd463ca7', kind: 'major', text: 'T\u00f5en\u00e4osuse raport' },
      { date: '2026-05-25', ref: '2880cc0', kind: 'minor', text: 'Signaalide kogumine' },
      { date: '2026-09-02', ref: 'M7.5', kind: 'minor', text: 'Raport koostatakse serveris (n8n asemel)' },
      { date: '2026-09-05', ref: 'Ennustus P4', kind: 'major', text: 'Skoor v4: fenoloogia, naabermaade vaatlused, kalibreerimine ja EE m\u00e4rk' },
      { date: '2026-09-08', ref: 'P7a', kind: 'minor', text: 'Ennustuste hindamine' },
      { date: '2026-09-10', ref: 'P6', kind: 'minor', text: 'Kaardilt avaneb liigi t\u00f5en\u00e4osuse kaart' },
      { date: '2026-09-11', ref: 'P19', kind: 'minor', text: 'Kasutajate hinnangud m\u00f5jutavad j\u00e4rgmist raportit' },
      { date: '2026-09-12', ref: 'P20', kind: 'minor', text: 'Silt \u201emarsruut vale\u201c' },
      { date: '2026-09-16', ref: 'P24', kind: 'patch', text: 'L\u00fchikirjeldused ilma Sonnetita loendi l\u00f5pu liikidele' },
      { date: '2026-09-28', ref: 'P85c', kind: 'patch', text: 'Hinnangu t\u00fchistamine uue kl\u00f5psuga, m\u00e4rkus salvestub' },
      { date: '2026-09-30', ref: 'P85g', kind: 'minor', text: 'Kasutaja m\u00e4rkus j\u00f5uab Sonnetini' },
    ],
  },
  {
    id: 'ulevaade-naabermaad',
    area: 'ulevaade',
    name: 'Naabermaad',
    changes: [
      { date: '2026-09-28', ref: 'P85a', kind: 'major', text: 'Naabermaad (endine Arhiiv)' },
      { date: '2026-09-30', ref: 'P85f', kind: 'minor', text: 'P\u00e4evade kaupa ajajoon, lipufiltrid ja kaugus' },
      { date: '2026-09-30', ref: 'P85f2', kind: 'patch', text: 'Lippude suurus parandatud' },
    ],
  },
  {
    id: 'uudised',
    area: 'uudised',
    name: 'Uudised',
    changes: [
      { date: '2026-02-20', ref: '4c6d9da', kind: 'major', text: 'EO\u00dc uudised' },
      { date: '2026-02-22', ref: '3c45329', kind: 'minor', text: 'Mitu allikat ja RSS-vood' },
      { date: '2026-02-28', ref: '59dd957', kind: 'minor', text: 'Pildid RSS-ist ja og:image-ist' },
      { date: '2026-03-01', ref: 'd2ad500', kind: 'patch', text: 'V\u00e4rskendus ja pildid stabiilsemad' },
      { date: '2026-10-01', ref: 'P86a', kind: 'major', text: 'Uus kaardi \u00fclesehitus ja lipuga allikasildid' },
      { date: '2026-10-01', ref: 'P86a2', kind: 'patch', text: 'T\u00f5lge on alati n\u00e4ha, automaatt\u00f5lke seade eemaldatud' },
      { date: '2026-10-01', ref: 'P86b', kind: 'minor', text: 'Arvutis ajakirjalaadne paigutus, telefonis p\u00e4evade kaupa loend' },
      { date: '2026-10-01', ref: 'P86c', kind: 'minor', text: 'Artikli lugemisvaade' },
      { date: '2026-10-01', ref: 'P86c2', kind: 'patch', text: 'Allikasildid ja otsing parandatud' },
      { date: '2026-10-01', ref: 'P86c4', kind: 'minor', text: 'Piltide suurendamine artiklis' },
      { date: '2026-10-07', ref: 'P99b-2a', kind: 'patch', text: 'Allika lipp andmebaasist, Islandi lipp' },
      { date: '2026-10-08', ref: 'P105', kind: 'patch', text: 'EO\u00dc uudised uuenevad neli korda p\u00e4evas' },
    ],
  },
  {
    id: 'uudised-tolge',
    area: 'uudised',
    name: 'Uudiste t\u00f5lge',
    changes: [
      { date: '2026-02-23', ref: 'c87c677', kind: 'major', text: 'Serveripoolne eestikeelne t\u00f5lge' },
      { date: '2026-02-24', ref: '7b39da4', kind: 'minor', text: 'Eelt\u00f5lge ja ajastatud t\u00f5lkimine' },
      { date: '2026-09-01', ref: 'M7.3', kind: 'major', text: 'Uus t\u00f5lkefunktsioon (n8n asemel)' },
      { date: '2026-10-01', ref: 'P86d1', kind: 'patch', text: 'Vastuse jaotamine pealkirjaks ja sisuks t\u00f6\u00f6kindlam' },
      { date: '2026-10-01', ref: 'P86d', kind: 'minor', text: 'Linnunimede parandaja, ka mitmes\u00f5nalised EO\u00dc nimed' },
      { date: '2026-10-01', ref: 'P86d2', kind: 'patch', text: 'Lause alguses suur algust\u00e4ht' },
      { date: '2026-10-01', ref: 'P86e', kind: 'minor', text: 'S\u00f5nastiku- ja j\u00e4rjepidevuse kontroll' },
    ],
  },
  {
    id: 'uritused',
    area: 'uritused',
    name: '\u00dcritused',
    changes: [
      { date: '2026-02-25', ref: 'd482791', kind: 'major', text: '\u00dcrituste loend ja \u00fcksikasjad' },
      { date: '2026-02-27', ref: '4bd87d1', kind: 'minor', text: '\u00dcrituste haldus administraatorile' },
      { date: '2026-02-27', ref: '6efb99c', kind: 'minor', text: '\u00dcrituse pilt' },
      { date: '2026-02-27', ref: '141dd33', kind: 'patch', text: 'P\u00e4evi alguseni' },
      { date: '2026-05-01', ref: '6eea977', kind: 'patch', text: 'Arhiiv eemaldatud' },
      { date: '2026-10-05', ref: 'P92d', kind: 'major', text: 'Uus loend: Tulevased/M\u00f6\u00f6dunud, allikasildid ja kuude kaupa' },
      { date: '2026-10-05', ref: 'P92c7', kind: 'patch', text: 'Facebooki pildid puhverserveri kaudu' },
      { date: '2026-10-06', ref: 'P92e', kind: 'minor', text: '\u00dcrituse leht: koht, aeg, link ja kalendrisse lisamine' },
      { date: '2026-10-06', ref: 'P92e4', kind: 'minor', text: 'Joonistatud linnupilt, kui \u00fcritusel pilti pole' },
      { date: '2026-10-06', ref: 'P92e5', kind: 'minor', text: 'Asukohakaart \u00fcrituse lehel' },
      { date: '2026-10-06', ref: 'P92e6', kind: 'minor', text: 'Lai paigutus suurel ekraanil' },
      { date: '2026-10-06', ref: 'P92e8', kind: 'minor', text: 'Lai loend koos esile t\u00f5stetud j\u00e4rgmise \u00fcritusega' },
      { date: '2026-10-06', ref: 'P92e9', kind: 'patch', text: 'Tagasinupp ja Esc sulgeb lehe' },
    ],
  },
  {
    id: 'uritused-lisamine',
    area: 'uritused',
    name: '\u00dcrituse lisamine lingist',
    changes: [
      { date: '2026-10-04', ref: 'P92b', kind: 'major', text: 'Lingist t\u00e4idetakse \u00fcrituse andmed automaatselt' },
      { date: '2026-10-05', ref: 'P92c', kind: 'minor', text: 'Leht \u201eLisa \u00fcritus\u201c' },
      { date: '2026-10-05', ref: 'P92c2+c3', kind: 'minor', text: 'Facebooki \u00fcritused ja pildi eelvaade' },
      { date: '2026-10-05', ref: 'P92c5', kind: 'minor', text: 'Facebooki \u00fcritustest aeg, koht ja kirjeldus' },
      { date: '2026-10-05', ref: 'P92c6', kind: 'patch', text: 'Varuvariant, kui Facebook p\u00e4ringu tagasi l\u00fckkab' },
    ],
  },
  {
    id: 'seaded',
    area: 'seaded',
    name: '\u00dcldine',
    changes: [
      { date: '2026-02-19', ref: '8a246d3', kind: 'major', text: 'Seaded ja rakenduse versioon' },
      { date: '2026-03-08', ref: 'dac10b7', kind: 'minor', text: 'Sisselogimine ja rollid' },
      { date: '2026-03-10', ref: '7a73188', kind: 'minor', text: 'Kasutajatasemete \u00f5igused' },
      { date: '2026-10-06', ref: 'P93b', kind: 'major', text: 'Uus avaleht: profiilip\u00e4is ja r\u00fchmitatud jaotised' },
      { date: '2026-10-06', ref: 'P93f', kind: 'patch', text: 'Kasutamata t\u00f5lke- ja ennustuse seaded eemaldatud' },
      { date: '2026-10-07', ref: 'P93g', kind: 'minor', text: 'Arvutis kahe paaniga vaade' },
      { date: '2026-10-07', ref: 'P97a', kind: 'patch', text: 'Tagasi liikumine viib Seadetesse' },
    ],
  },
  {
    id: 'seaded-kasutajad',
    area: 'seaded',
    name: 'Kasutajad',
    changes: [
      { date: '2026-10-07', ref: 'P97d2', kind: 'major', text: 'Kasutajate loend: statistika, otsing ja rollid' },
      { date: '2026-10-07', ref: 'P97d3', kind: 'minor', text: 'Kasutaja leht: rolli ja oleku muutmine' },
      { date: '2026-10-08', ref: 'P97d4', kind: 'minor', text: 'Arvutivaade' },
      { date: '2026-10-08', ref: 'P97e2', kind: 'minor', text: 'Konto blokeerimine' },
    ],
  },
  {
    id: 'seaded-liigid',
    area: 'seaded',
    name: 'Liigid',
    changes: [
      { date: '2026-02-19', ref: 'db8c3aa', kind: 'major', text: 'Avatarihaldur' },
      { date: '2026-02-25', ref: 'df52d55', kind: 'minor', text: 'Liikide lisaandmed' },
      { date: '2026-07-17', ref: 'c5ccbb6', kind: 'minor', text: 'Rariliini seaded: 3+3 kood ja teate m\u00e4rkus' },
      { date: '2026-10-01', ref: 'P89', kind: 'patch', text: 'Rariliini harulduse tase salvestub' },
      { date: '2026-10-06', ref: 'P93c', kind: 'major', text: '\u00dcks leht kahe kaardi jaoks, loendivaade otsingu ja siltidega' },
      { date: '2026-10-07', ref: 'P97c3b', kind: 'minor', text: 'Avatari valik iNaturalistist ja Wikimediast koos litsentsiga' },
      { date: '2026-10-07', ref: 'P97c4a', kind: 'patch', text: 'Foto autori vahem\u00e4lu avatari aadressi j\u00e4rgi' },
    ],
  },
  {
    id: 'seaded-uudiste-allikad',
    area: 'seaded',
    name: 'Uudiste allikad',
    changes: [
      { date: '2026-02-22', ref: '6f3006c', kind: 'major', text: 'Uudiste allikate haldus' },
      { date: '2026-02-26', ref: '31fbd6b', kind: 'minor', text: 'Klikitavad allikalingid' },
      { date: '2026-10-06', ref: 'P93d', kind: 'major', text: 'Uus leht: allikate lisamine, r\u00fchmad ja l\u00fclitid' },
      { date: '2026-10-07', ref: 'P97b', kind: 'minor', text: 'Allikate aktiivsus 7 ja 30 p\u00e4eva kohta' },
      { date: '2026-10-07', ref: 'P99a', kind: 'patch', text: 'Muutmine ainult administraatorile' },
    ],
  },
  {
    id: 'seaded-diagnostika',
    area: 'seaded',
    name: 'Diagnostika',
    changes: [
      { date: '2026-02-26', ref: 'fdbf146', kind: 'major', text: 'S\u00fcndmuste logi' },
      { date: '2026-10-06', ref: 'P93e', kind: 'major', text: 'Diagnostika leht: teavituste olek ja testteavitus' },
      { date: '2026-10-08', ref: 'P97f3', kind: 'minor', text: 'Tehisintellekti kaart: Claude\'i ja Gemini olek' },
      { date: '2026-10-09', ref: 'P108', kind: 'minor', text: 'Mistral kolmanda mudelina' },
    ],
  },
  {
    id: 'navigeerimine',
    area: 'rakendus',
    name: 'Navigeerimine',
    changes: [
      { date: '2026-02-19', ref: 'ee15a21', kind: 'major', text: 'Vahelehed ja kaardivalik' },
      { date: '2026-09-18', ref: 'P36', kind: 'patch', text: 'Mobiili vahem\u00e4lu nupp eemaldatud' },
      { date: '2026-09-18', ref: 'P39', kind: 'minor', text: 'Kaardivalik segmentnuppudena' },
      { date: '2026-09-18', ref: 'P40', kind: 'minor', text: 'Kaardivalik h\u00f5ljub kaardi kohal' },
      { date: '2026-09-23', ref: 'P69', kind: 'major', text: 'Uus alumine riba linnuikoonidega' },
      { date: '2026-09-23', ref: 'P70', kind: 'minor', text: 'Telefonis h\u00f5ljuv dokk' },
      { date: '2026-09-23', ref: 'P72', kind: 'patch', text: 'Rakenduse nimi EstBirds' },
    ],
  },
  {
    id: 'teavitused',
    area: 'rakendus',
    name: 'Teavitused',
    changes: [
      { date: '2026-04-16', ref: '67a844c', kind: 'major', text: 'T\u00f5uketeavitused' },
      { date: '2026-05-22', ref: 'a12e0cb', kind: 'minor', text: 'Rikkalikumad teavitused' },
      { date: '2026-09-02', ref: 'M7.5', kind: 'patch', text: 'Tellimuse salvestamine sisselogitud kasutajale parandatud' },
      { date: '2026-09-17', ref: 'P35', kind: 'minor', text: 'Teavitused parandavad end ise, testteavitus' },
      { date: '2026-09-30', ref: 'P91b', kind: 'patch', text: '\u00dcle 30 uue liigi korraga ei saada teavitusi' },
      { date: '2026-10-08', ref: 'P104b', kind: 'minor', text: 'Teavitus k\u00f5igile tellijatele uue liigi kohta' },
    ],
  },
];

/** Changes with their derived version, oldest first. */
export function versionHistory(feature: Feature): VersionedChange[] {
  let major = 0;
  let minor = 0;
  let patch = 0;
  return feature.changes.map((change, index) => {
    if (index === 0) {
      major = 1;
      minor = 0;
      patch = 0;
    } else if (change.kind === 'major') {
      major += 1;
      minor = 0;
      patch = 0;
    } else if (change.kind === 'minor') {
      minor += 1;
      patch = 0;
    } else {
      patch += 1;
    }
    return { ...change, version: `${major}.${minor}.${patch}` };
  });
}

export function currentVersion(feature: Feature): string {
  const history = versionHistory(feature);
  return history.length > 0 ? history[history.length - 1].version : '0.0.0';
}

export function lastChanged(feature: Feature): string {
  const last = feature.changes[feature.changes.length - 1];
  return last ? last.date : '';
}

export function getFeature(id: FeatureId): Feature | undefined {
  return FEATURES.find((feature) => feature.id === id);
}

export function featureVersionById(id: FeatureId): string {
  const feature = getFeature(id);
  return feature ? currentVersion(feature) : '';
}

/** Compact "id:version,id:version" list passed to the map iframes as ?fv=. */
export function featureVersionParam(ids: readonly FeatureId[]): string {
  return ids
    .map((id) => {
      const version = featureVersionById(id);
      return version ? `${id}:${version}` : '';
    })
    .filter((part) => part.length > 0)
    .join(',');
}
