// P86d: news bird-name corrector (supabase/functions/_shared/bird-names.ts)
// and the "[retry N]" error prefix (supabase/functions/_shared/retry-prefix.ts).
// The fixture is a verbatim subset of Linnud.txt (header + lines 75, 111,
// 1451, 1484, 2385, 2395, 8245). Real sentences come from news_items
// fa876bd4, a8df7b22, 3be4f385, e6a6f8cd; their raw Sonnet drafts are
// reconstructed from the stored corrector output.

import { describe, expect, it } from "vitest";
import {
  buildHeadWords,
  deCyrillic,
  fixBirdNames,
  fixItemBirdNames,
  isSentenceStart,
  parseLinnud,
  sameSpecies,
  type ItemText,
} from "../../../../supabase/functions/_shared/bird-names.ts";
import {
  retryCount,
  withRetryPrefix,
} from "../../../../supabase/functions/_shared/retry-prefix.ts";

const FIXTURE_TSV = [
  "selts_lk\tselts_ek\tsugukond_lk\tsugukond_ek\tnimi_lk\tnimi_ek\tnimi_ik",
  "Accipitriformes\thaukalised (kullilised)\tAccipitridae\thaugaslased\tButeo rufinus, Buteo ferox\tstepiviu\tLong-legged Buzzard",
  "Accipitriformes\thaukalised (kullilised)\tAccipitridae\thaugaslased\tCircus macrourus\tstepi-loorkull\tPallid Harrier",
  "Charadriiformes\tkurvitsalised\tLaridae\tkajaklased\tThalasseus sandvicensis, Sterna sandvicensis\ttutt-tiir\tSandwich Tern, Yellow-nibbed Tern",
  "Charadriiformes\tkurvitsalised\tScolopacidae\tkurvitslased\tCalidris falcinellus, Limicola falcinellus\tplütt\tBroad-billed Sandpiper",
  "Falconiformes\tpistrikulised\tFalconidae\tpistriklased\tFalco cherrug\tstepipistrik\tSaker Falcon, Saker",
  "Falconiformes\tpistrikulised\tFalconidae\tpistriklased\tFalco eleonorae\tvahemere pistrik\tEleonora's Falcon",
  "Passeriformes\tvärvulised\tSturnidae\tkuldnoklased\tSturnus vulgaris\tkuldnokk (harilik kuldnokk)\tCommon Starling, European Starling, Starling",
].join("\r\n");

const DICT = parseLinnud(FIXTURE_TSV);

const fixItem = (title: string, body: string): ItemText =>
  fixItemBirdNames({ title, body }, DICT);

describe("parseLinnud (PL1)", () => {
  it("maps every Latin alias to the Estonian name and strips parentheticals", () => {
    expect(Object.keys(DICT)).toHaveLength(10);
    expect(DICT["sterna sandvicensis"]).toBe("tutt-tiir");
    expect(DICT["thalasseus sandvicensis"]).toBe("tutt-tiir");
    expect(DICT["buteo ferox"]).toBe("stepiviu");
    expect(DICT["sturnus vulgaris"]).toBe("kuldnokk");
    expect(DICT["falco eleonorae"]).toBe("vahemere pistrik");
  });

  it("collects the last words of multi-word names as head words", () => {
    const heads = buildHeadWords(DICT);
    expect(heads.has("pistrik")).toBe(true);
    expect(heads.has("stepiviu")).toBe(false);
    expect(heads.has("tutttiir")).toBe(false);
  });
});

describe("sameSpecies (S1-S7 + adversarial)", () => {
  const cases: Array<[string, string, boolean]> = [
    ["stepiviu", "stepipistrik", false],
    ["stepiviu", "stepi-loorkull", false],
    ["soo-loorkull", "stepi-loorkull", false],
    ["tutt-tiiru", "tutt-tiir", true],
    ["kuldnoka", "kuldnokk", true],
    ["plüti", "plütt", true],
    ["pistrik", "pistrik", true],
    ["valgekurg", "valgekurk-sarvlind", false],
    ["valgetiib-tuvi", "valgetiib-tuulas", false],
    ["stepikotkas", "stepikiivitaja", false],
    ["hallhaigur", "hallrästas", false],
    ["merikotkas", "merikajakas", false],
    ["kalakotkas", "kalakajakas", false],
    ["Rifftiir", "tutt-tiir", false],
    ["laiudsaba-risla", "plütt", false],
    ["pistrik", "vahemere pistrik", false],
    ["mustkuldnokk", "kuldnokk", false],
    ["tutt-tiir", "tuttpütt", false],
    ["väike-konnakotkas", "suur-konnakotkas", false],
    ["raudkull", "raudkullid", true],
    ["pistrik", "pistrikud", true],
    ["kull", "kullid", true],
    ["hõbehaugas", "hõbehauka", true],
    ["hõbehaugast", "hõbehaugas", true],
    ["kuldnokkadele", "kuldnokk", true],
    ["tutt-tiirudega", "tutt-tiir", true],
    ["pistrikutega", "pistrik", true],
    ["stepiloorkulli", "stepi-loorkull", true],
    ["väikekonnakotka", "väike-konnakotkas", true],
    ["vahemere pistriku", "vahemere pistrik", true],
  ];
  it.each(cases)("%s vs %s -> %s", (a, b, expected) => {
    expect(sameSpecies(a, b)).toBe(expected);
  });

  it("is case-insensitive and rejects empty input", () => {
    expect(sameSpecies("Stepipistrik", "stepipistrik")).toBe(true);
    expect(sameSpecies("", "plütt")).toBe(false);
  });
});

describe("isSentenceStart (D6)", () => {
  it("treats string start, sentence end and new line as a start, but not a colon", () => {
    const t = "Rekord: Eleonora. Eile\nKotkas";
    expect(isSentenceStart(t, 0)).toBe(true);
    expect(isSentenceStart(t, t.indexOf("Eleonora"))).toBe(false);
    expect(isSentenceStart(t, t.indexOf("Eile"))).toBe(true);
    expect(isSentenceStart(t, t.indexOf("Kotkas"))).toBe(true);
  });
});

describe("rule 2: multi-word dictionary names (R1-R4)", () => {
  it("R1 Eleonora pistrik -> vahemere pistrik", () => {
    expect(fixBirdNames("Eleonora pistrik (Falco eleonorae)", DICT))
      .toBe("vahemere pistrik (Falco eleonorae)");
  });
  it("R2 inserts the missing dictionary prefix and keeps a lowercase verb", () => {
    expect(fixBirdNames("vaatlesid pistrik (Falco eleonorae)", DICT))
      .toBe("vaatlesid vahemere pistrik (Falco eleonorae)");
  });
  it("R3 repairs the old corrector output", () => {
    expect(fixBirdNames("Eleonora vahemere pistrik (Falco eleonorae)", DICT))
      .toBe("vahemere pistrik (Falco eleonorae)");
  });
  it("R4 keeps a place name before a complete name", () => {
    expect(fixBirdNames("Poola vahemere pistrik (Falco eleonorae)", DICT))
      .toBe("Poola vahemere pistrik (Falco eleonorae)");
    expect(fixBirdNames("nähti Poola vahemere pistrik (Falco eleonorae)", DICT))
      .toBe("nähti Poola vahemere pistrik (Falco eleonorae)");
  });
});

describe("inflection is preserved when the species matches (I1-I2)", () => {
  it("I1 leaves an inflected single-word name alone", () => {
    const s = "tutt-tiiru (Thalasseus sandvicensis) pesa";
    expect(fixBirdNames(s, DICT)).toBe(s);
  });
  it("I2 replaces only the leading word of an inflected multi-word name", () => {
    expect(fixBirdNames("Eleonora pistrikuga (Falco eleonorae)", DICT))
      .toBe("vahemere pistrikuga (Falco eleonorae)");
  });
});

describe("propagation to unanchored mentions and the title (P1-P7)", () => {
  it("P1 a8df7b22: Rifftiir* -> tutt-tiir in body and title, suffix kept", () => {
    const title =
      "Rifftiiru vaatlusi registreeriti Tiira linnuandmebaasis sel suvel üle kümne korra keskmisest rohkem";
    const body =
      "Rifftiiru (Sterna sandvicensis) vaatlusi registreeriti Tiira linnuandmebaasis sel suvel üle kümne korra keskmisest rohkem. " +
      "Suurimas parves täheldati Kotkas 68 rifftiiru (Sterna sandvicensis), mis ületab mõne aasta kogu Soomes registreeritud isendite arvu. " +
      "Esinemine koondus ida-Soome lahele, kus enamikul hilissuvedel nähakse vaid käputäit rifftiirusid \u2013 kui sedagi. " +
      "Lääne-Eestis on rifftiir (Sterna sandvicensis) üsna tavaline, kohati pesitsev liik. " +
      "Porvoo saarestikus õnnestus nüüd ühelt rifftiirult (Sterna sandvicensis) rõngas lugeda.";
    expect(fixItem(title, body)).toEqual({
      title:
        "Tutt-tiiru vaatlusi registreeriti Tiira linnuandmebaasis sel suvel üle kümne korra keskmisest rohkem",
      body:
        "tutt-tiir (Sterna sandvicensis) vaatlusi registreeriti Tiira linnuandmebaasis sel suvel üle kümne korra keskmisest rohkem. " +
        "Suurimas parves täheldati Kotkas 68 tutt-tiir, mis ületab mõne aasta kogu Soomes registreeritud isendite arvu. " +
        "Esinemine koondus ida-Soome lahele, kus enamikul hilissuvedel nähakse vaid käputäit tutt-tiirusid \u2013 kui sedagi. " +
        "Lääne-Eestis on tutt-tiir üsna tavaline, kohati pesitsev liik. " +
        "Porvoo saarestikus õnnestus nüüd ühelt tutt-tiir rõngas lugeda.",
    });
  });

  it("P2 the body's replacement fixes a title without a Latin anchor", () => {
    expect(fixItem("Rifftiir rõngastati Poolas", "Poolas rõngastati rifftiir (Thalasseus sandvicensis)."))
      .toEqual({
        title: "Tutt-tiir rõngastati Poolas",
        body: "Poolas rõngastati tutt-tiir (Thalasseus sandvicensis).",
      });
  });

  it("P3 e6a6f8cd: hyphenated calque, place parenthetical survives", () => {
    const title = "Noorlind laiudsaba-risla leiti Wintamist (Antwerpeni provints)";
    const body =
      "Eile õhtul avastasid Erik De Keersmaecker, Pieter Van den Cruyce ja Jan Ledeganck Wintamist (Antwerpeni provints) noorlindi laiudsaba-risla (Calidris falcinellus). Lind viibis piirkonnas ka täna.";
    expect(fixItem(title, body)).toEqual({
      title: "Noorlind plütt leiti Wintamist (Antwerpeni provints)",
      body:
        "Eile õhtul avastasid Erik De Keersmaecker, Pieter Van den Cruyce ja Jan Ledeganck Wintamist (Antwerpeni provints) noorlindi plütt (Calidris falcinellus). Lind viibis piirkonnas ka täna.",
    });
  });

  it("P4 3be4f385: phrase propagation, colon is not a sentence start, de-dupe", () => {
    const title = "MEGA! Seitsmes Poola rekord: Eleonora pistrik Krynica Morskis";
    const body =
      "Suur haruldus Poolas! Dorota Łukasik ja kaaslased vaatlesid 18. septembril Krynica Morska rändevaatluspostil (Stowarzyszenie Drapolicz) Eleonora pistrik (Falco eleonorae) \u2013 see on liigi seitsmes registreering Poolas. " +
      "Tegemist on tänavu teise Eleonora pistrikuga samal vaatluspostil: esimene, ebaküps isend, nähti seal juba 5. septembril. " +
      "Eleonora pistrik (Falco eleonorae) pesitseb Vahemere piirkonnas. Fotod: Piotr Zieliński. Palju õnne!";
    expect(fixItem(title, body)).toEqual({
      title: "MEGA! Seitsmes Poola rekord: vahemere pistrik Krynica Morskis",
      body:
        "Suur haruldus Poolas! Dorota Łukasik ja kaaslased vaatlesid 18. septembril Krynica Morska rändevaatluspostil (Stowarzyszenie Drapolicz) vahemere pistrik (Falco eleonorae) \u2013 see on liigi seitsmes registreering Poolas. " +
        "Tegemist on tänavu teise vahemere pistrikuga samal vaatluspostil: esimene, ebaküps isend, nähti seal juba 5. septembril. " +
        "vahemere pistrik pesitseb Vahemere piirkonnas. Fotod: Piotr Zieliński. Palju õnne!",
    });
  });

  it("P5 fa876bd4: stepiviu (Falco cherrug) -> stepipistrik in both fields, leading words kept", () => {
    const title =
      "Belgia esimene stepiviu (Falco cherrug) \u2013 Uitkerke'i isend leiti lõpuks ilma rõngasteta";
    const body =
      "Pärast peaaegu nädal aega kestnud tabamatu käitumist õnnestus täna lõpuks Uitkerke'i ümbruses (Lääne-Flandria provints) liikuvat stepiviu (Falco cherrug) piisavalt lähedalt vaadelda.";
    expect(fixItem(title, body)).toEqual({
      title:
        "Belgia esimene stepipistrik (Falco cherrug) \u2013 Uitkerke'i isend leiti lõpuks ilma rõngasteta",
      body:
        "Pärast peaaegu nädal aega kestnud tabamatu käitumist õnnestus täna lõpuks Uitkerke'i ümbruses (Lääne-Flandria provints) liikuvat stepipistrik (Falco cherrug) piisavalt lähedalt vaadelda.",
    });
  });

  it("P7 stepiviu -> stepi-loorkull, title keeps its sentence-start capital", () => {
    expect(fixItem("Stepiviu rändel", "üks stepiviu (Circus macrourus) lendas")).toEqual({
      title: "Stepi-loorkull rändel",
      body: "üks stepi-loorkull (Circus macrourus) lendas",
    });
  });
});

describe("propagation guards (G1-G3)", () => {
  it("G1 never rewrites a correctly anchored same-stem mention, and leaves bare mentions ambiguous", () => {
    const body =
      "Täna nähti stepiviu (Buteo rufinus) ja stepiviu (Falco cherrug); hiljem lendas stepiviu üle.";
    expect(fixBirdNames(body, DICT)).toBe(
      "Täna nähti stepiviu (Buteo rufinus) ja stepipistrik (Falco cherrug); hiljem lendas stepiviu üle.",
    );
  });
  it("G2 does not propagate a shared head word", () => {
    expect(fixBirdNames("vaatlesid pistrik (Falco eleonorae). Pistrikud on kiired.", DICT))
      .toBe("vaatlesid vahemere pistrik (Falco eleonorae). Pistrikud on kiired.");
  });
  it("G3 does not absorb a sentence-start capital", () => {
    expect(fixBirdNames("Vaatlesid pistrik (Falco eleonorae).", DICT))
      .toBe("Vaatlesid vahemere pistrik (Falco eleonorae).");
  });
});

describe("de-dupe, bare binomials, calques, Cyrillic (D1-D2, B1, C1, Cy1)", () => {
  it("D1 shows a dictionary binomial once and keeps a place parenthetical", () => {
    expect(fixBirdNames(
      "kuldnokk (Sturnus vulgaris) laulis; teine kuldnokk (Sturnus vulgaris) Tartus (Tartu maakond).",
      DICT,
    )).toBe("kuldnokk (Sturnus vulgaris) laulis; teine kuldnokk Tartus (Tartu maakond).");
  });
  it("D2 de-dupes title and body separately", () => {
    expect(fixItem(
      "plütt (Calidris falcinellus)",
      "plütt (Calidris falcinellus) ja plütt (Calidris falcinellus)",
    )).toEqual({
      title: "plütt (Calidris falcinellus)",
      body: "plütt (Calidris falcinellus) ja plütt",
    });
  });
  it("B1 names a bare binomial", () => {
    expect(fixBirdNames("nähti Calidris falcinellus rannal", DICT))
      .toBe("nähti plütt (Calidris falcinellus) rannal");
  });
  it("C1 applies calques last", () => {
    expect(fixBirdNames("Dalmaatsia pelikani (Pelecanus crispus)", DICT))
      .toBe("käharpelikani (Pelecanus crispus)");
  });
  it("Cy1 transliterates Cyrillic", () => {
    expect(deCyrillic("Лебедь")).toBe("Lebed");
    expect(deCyrillic("plütt")).toBe("plütt");
  });
});

describe("idempotency", () => {
  const items: Array<[string, string]> = [
    ["Rifftiiru vaatlusi", "Rifftiiru (Sterna sandvicensis) vaatlusi; 68 rifftiiru (Sterna sandvicensis) ja rifftiirusid."],
    ["Eleonora pistrik Krynica Morskis", "Nähti Eleonora pistrik (Falco eleonorae). Teise Eleonora pistrikuga. Eleonora pistrik (Falco eleonorae) pesitseb."],
    ["Belgia esimene stepiviu (Falco cherrug)", "liikuvat stepiviu (Falco cherrug) ja stepiviu (Buteo rufinus)"],
    ["Noorlind laiudsaba-risla leiti", "noorlindi laiudsaba-risla (Calidris falcinellus) Wintamist (Antwerpeni provints)"],
    ["", "kuldnokk (Sturnus vulgaris) ja kuldnokk (Sturnus vulgaris); Dalmaatsia pelikan (Pelecanus crispus)"],
  ];
  it.each(items)("fixItemBirdNames twice equals once: %s", (title, body) => {
    const once = fixItem(title, body);
    expect(fixItem(once.title, once.body)).toEqual(once);
  });
});

describe("withRetryPrefix (RT1-RT3)", () => {
  it("RT1 first failure -> [retry 1]", () => {
    expect(withRetryPrefix(null, "sonnet: max_tokens hit")).toBe("[retry 1] sonnet: max_tokens hit");
    expect(withRetryPrefix(undefined, "x")).toBe("[retry 1] x");
    expect(retryCount("plain error")).toBe(0);
  });
  it("RT2 increments an existing marker", () => {
    expect(withRetryPrefix("[retry 2] old", "x")).toBe("[retry 3] x");
    expect(retryCount("[retry 2] old")).toBe(2);
  });
  it("RT3 keeps the prefix inside the 800-char limit", () => {
    const out = withRetryPrefix(null, "m".repeat(900));
    expect(out).toHaveLength(800);
    expect(out.startsWith("[retry 1] ")).toBe(true);
  });
});
