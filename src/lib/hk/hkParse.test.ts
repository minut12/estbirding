// src/lib/hk/hkParse.test.ts
import { describe, it, expect } from "vitest";
import {
  parseLeadingDate,
  parseChecklist,
  parseHkSpeciesList,
  parseAcceptedList,
  parseHirundoReport,
  restoreCompoundHyphens,
  classifyHirundoLines,
  type HkLine,
} from "./hkParse";

const body = (t: string, page = 1): HkLine => ({ page, t, role: "body" });
const head = (t: string, page = 1): HkLine => ({ page, t, role: "heading" });
const sect = (t: string, page = 1): HkLine => ({ page, t, role: "section" });

const KNOWN = [
  "Cygnus columbianus",
  "Cygnus columbianus columbianus",
  "Buteo rufinus",
  "Aythya nyroca",
  "Podiceps nigricollis",
  "Anser brachyrhynchus",
  "Stercorarius longicaudus",
  "Aix galericulata",
  "Branta bernicla nigricans",
  "Glareola nordmanni",
  "Melanitta americana",
  "Ardenna grisea",
  "Larus michahellis",
  "Pelecanus onocrotalus",
  "Emberiza aureola",
];

describe("parseLeadingDate", () => {
  it("parses a single day", () => {
    const d = parseLeadingDate("11.07.1993 Tahu, Noarootsi khk");
    expect(d).toMatchObject({ dateText: "11.07.1993", dateFrom: "1993-07-11", dateTo: "1993-07-11", precision: "day", year: 1993, rest: "Tahu, Noarootsi khk" });
  });
  it("parses a cross-month range", () => {
    expect(parseLeadingDate("27.06.-01.07.2015 Korva luht")).toMatchObject({ dateFrom: "2015-06-27", dateTo: "2015-07-01", precision: "day" });
  });
  it("parses a day range sharing the month", () => {
    expect(parseLeadingDate("03.–07.08.2025 Varudi")).toMatchObject({ dateFrom: "2025-08-03", dateTo: "2025-08-07" });
    expect(parseLeadingDate("14. - 20.10.2023 Tallinn")).toMatchObject({ dateFrom: "2023-10-14", dateTo: "2023-10-20" });
  });
  it("parses a cross-year range", () => {
    expect(parseLeadingDate("28.09.2025–08.01.2026 Sõrve")).toMatchObject({ dateFrom: "2025-09-28", dateTo: "2026-01-08", year: 2025 });
  });
  it("parses two dates joined with ja", () => {
    expect(parseLeadingDate("07.08. ja 04.09.1991 Uru jv")).toMatchObject({ dateFrom: "1991-08-07", dateTo: "1991-09-04", rest: "Uru jv" });
  });
  it("keeps month precision for Lõpp 06.1902", () => {
    expect(parseLeadingDate("Lõpp 06.1902 Irboska, Petserimaa")).toMatchObject({ dateText: "Lõpp 06.1902", dateFrom: "1902-06-01", dateTo: "1902-06-30", precision: "month" });
  });
  it("keeps seasons without inventing days", () => {
    expect(parseLeadingDate("Suvi 1989 Veisjärve Lagesoo")).toMatchObject({ dateText: "Suvi 1989", dateFrom: null, dateTo: null, precision: "season", year: 1989 });
  });
  it("treats either-or years as unknown", () => {
    expect(parseLeadingDate("06.1922/06.1923 Maalaht")).toMatchObject({ dateFrom: null, precision: "unknown", year: 1922, rest: "Maalaht" });
  });
  it("handles century phrases", () => {
    expect(parseLeadingDate("XX saj. algus Merimets, Tallinn")).toMatchObject({ dateText: "XX saj. algus", year: null, precision: "unknown", rest: "Merimets, Tallinn" });
  });
  it("reads date phrases with words between the parts", () => {
    expect(parseLeadingDate("15. ja 20.05. vahel 1968 Vilsandi, Kihelkonna khk")).toMatchObject({ dateText: "15. ja 20.05. vahel 1968", precision: "unknown", year: 1968, rest: "Vilsandi, Kihelkonna khk" });
    expect(parseLeadingDate("Lõpp 05.- keskpaik 06.2003 Palmse")).toMatchObject({ dateText: "Lõpp 05.- keskpaik 06.2003", year: 2003, rest: "Palmse" });
    expect(parseLeadingDate("1893/1897 jj. Kamenka s, Petserimaa")).toMatchObject({ dateText: "1893/1897 jj.", year: 1893, rest: "Kamenka s, Petserimaa" });
    expect(parseLeadingDate("Lõpp 07.1907 või 1908 Kargi")).toMatchObject({ dateText: "Lõpp 07.1907 või 1908", precision: "unknown", rest: "Kargi" });
    expect(parseLeadingDate("Lõpp 07./algus 08.1880 (~) Eikla")).toMatchObject({ dateText: "Lõpp 07./algus 08.1880", year: 1880, rest: "(~) Eikla" });
    expect(parseLeadingDate("1955 ja 1956 Soitsjärv")).toMatchObject({ dateText: "1955 ja 1956", precision: "year", year: 1955 });
  });
  it("reads date lists, decades and approximate days", () => {
    expect(parseLeadingDate("03.03., 19.03. ja 20.04.2015 Hargla khk, Võrumaa")).toMatchObject({ dateFrom: "2015-03-03", dateTo: "2015-04-20", precision: "day", rest: "Hargla khk, Võrumaa" });
    expect(parseLeadingDate("1920-ndad Saarde khk, Pärnumaa")).toMatchObject({ dateText: "1920-ndad", precision: "unknown", year: 1920 });
    expect(parseLeadingDate("1870-ndad? Tartu, Tartumaa juv")).toMatchObject({ dateText: "1870-ndad?", year: 1870 });
    expect(parseLeadingDate("1936 ja 1940 vahel Kullamaa khk")).toMatchObject({ dateText: "1936 ja 1940 vahel", rest: "Kullamaa khk" });
    expect(parseLeadingDate("08.-ca20.06.2005 Saksamaa, Laiuse khk")).toMatchObject({ dateText: "08.-ca20.06.2005", precision: "unknown", year: 2005 });
    expect(parseLeadingDate("16.(-20.)07.1952 Pedaspää kurm")).toMatchObject({ dateText: "16.(-20.)07.1952", year: 1952 });
    expect(parseLeadingDate("Algus 06.-lõpp 07.1957 Elistvere jv")).toMatchObject({ dateText: "Algus 06.-lõpp 07.1957", year: 1957 });
    expect(parseLeadingDate("Kevadtalv 1964 Ahu, Lüganuse khk")).toMatchObject({ dateText: "Kevadtalv 1964", year: 1964, rest: "Ahu, Lüganuse khk" });
  });
  it("reads the remaining odd date phrases from the EOÜ list", () => {
    expect(parseLeadingDate("Suvi-sügis 1898 Tulpe, Kaarma khk")).toMatchObject({ dateText: "Suvi-sügis 1898", year: 1898 });
    expect(parseLeadingDate("XX saj. algus? Lehtse, Ambla khk")).toMatchObject({ dateText: "XX saj. algus?", rest: "Lehtse, Ambla khk" });
    expect(parseLeadingDate("06.04. ja/või 26.06.1981 Enniksaare")).toMatchObject({ dateText: "06.04. ja/või 26.06.1981", precision: "unknown", year: 1981 });
    expect(parseLeadingDate("2015, 2016 ja 2017 suvi Viidu ♂")).toMatchObject({ dateText: "2015, 2016 ja 2017 suvi", rest: "Viidu ♂", year: 2015 });
    expect(parseLeadingDate("30.04.-lõpp.05.2019 Jõgela ♂")).toMatchObject({ dateText: "30.04.-lõpp.05.2019", year: 2019 });
    expect(parseLeadingDate("06. või 07.05.- II pool 05.1967 Saastna")).toMatchObject({ dateText: "06. või 07.05.- II pool 05.1967", rest: "Saastna" });
  });
  it("reads a range followed by a second date", () => {
    expect(parseLeadingDate("27.04.-25.05.2023 ja 08.06.2023 Tartu l")).toMatchObject({ dateFrom: "2023-04-27", dateTo: "2023-06-08", precision: "day", rest: "Tartu l" });
  });
  it("accepts records that continue with sex or count instead of a place", () => {
    expect(parseLeadingDate("14.05.1993 ♂ ad ja 15.05.1993 2 ♂ ad")).toMatchObject({ dateText: "14.05.1993", rest: "♂ ad ja 15.05.1993 2 ♂ ad" });
    expect(parseLeadingDate("05.08.1983 noorlinnuna HELSINKI M 16482")).toBeNull();
  });
  it("rejects prose that only starts with a year", () => {
    expect(parseLeadingDate("2025. aastal vaadeldi Eestis")).toBeNull();
    expect(parseLeadingDate("ka 15.04.2017 Tehumardi")).toBeNull();
  });
});

describe("parseChecklist", () => {
  it("reads species, alt names and subspecies", () => {
    const rows = parseChecklist([
      body("Hanelised Anseriformes"),
      body("Partlased Anatidae"),
      body("2 Väikeluik Cygnus columbianus CYGCOL Tundra Swan A"),
      body("Ameerika väikeluik Cygnus columbianus columbianus"),
      body("9 Hallhani e roohani Anser anser ANSANS Greylag Goose A"),
      body("8 Väike-lumehani Anser rossii ANSROS Ross's Goose A"),
      body("65 Kodutuvi Columba livia (f. domestica) COLLIV Feral Pigeon C"),
      body("354 Võsaraat Prunella modularis modularis PRUMOD Dunnock A"),
    ]);
    expect(rows).toHaveLength(6);
    expect(rows[4]).toMatchObject({ taxonSci: "Columba livia", etName: "Kodutuvi", code6: "COLLIV", category: "C" });
    expect(rows[5]).toMatchObject({ taxonSci: "Prunella modularis", etName: "Võsaraat", code6: "PRUMOD", checklistNo: 354 });
    expect(rows[0]).toMatchObject({ taxonSci: "Cygnus columbianus", etName: "Väikeluik", enName: "Tundra Swan", code6: "CYGCOL", checklistNo: 2, category: "A", isSubspecies: false });
    expect(rows[1]).toMatchObject({ taxonSci: "Cygnus columbianus columbianus", speciesSci: "Cygnus columbianus", etName: "Ameerika väikeluik", isSubspecies: true, category: "A" });
    expect(rows[2]).toMatchObject({ etName: "Hallhani", etAltName: "roohani" });
    expect(rows[3]).toMatchObject({ enName: "Ross's Goose" });
  });
});

describe("parseHkSpeciesList", () => {
  it("reads current, D/E and historical-only scopes", () => {
    const rows = parseHkSpeciesList(
      [
        body("I. Loodusliku päritoluga liigid ja alamliigid (kategooriad A-C)"),
        body("Wild species (Categories A-C)"),
        body("Stepiviu Buteo rufinus"),
        body("II. Ebaselge päritoluga liigid (kategooria D)"),
        body("Aafrika harksaba Milvus migrans aegyptius"),
        body("IV. Liigid ja alamliigid, millel käsitlusele tulevad ainult varasemad teated nimestikus"),
        body("Lühinokk-hani Anser brachyrhynchus -2001"),
        body("Atlandi-, kirde- või friisi tõmmukajakas"),
        body("Larus fuscus graellsii/heuglini/intermedius -2006"),
      ],
      [...KNOWN, "Milvus migrans aegyptius", "Larus fuscus"],
    );
    expect(rows).toEqual([
      { taxonSci: "Buteo rufinus", etName: "Stepiviu", section: "A-C", hkStatus: "current", scopeEt: null },
      { taxonSci: "Milvus migrans aegyptius", etName: "Aafrika harksaba", section: "D", hkStatus: "current", scopeEt: null },
      { taxonSci: "Anser brachyrhynchus", etName: "Lühinokk-hani", section: "historical", hkStatus: "historical", scopeEt: "-2001" },
      { taxonSci: "Larus fuscus graellsii/heuglini/intermedius", etName: "Atlandi-, kirde- või friisi tõmmukajakas", section: "historical", hkStatus: "historical", scopeEt: "-2006" },
    ]);
  });
});

describe("parseAcceptedList", () => {
  const lines: HkLine[] = [
    body("I Kategooriad A-C (loodusliku päritoluga või meil (või naabermaades) püsiva"),
    head("Väikeluik Cygnus columbianus suvised teated VI-VIII (kuni 1997)"),
    body("11.07.1993 Tahu, Noarootsi khk, Läänemaa ad (Margus Ots, Jüri Keskpaik jt)."),
    body("07.06.1995 Tahu ad (Ivar Ojaste, Heldi Haabel, Aivar Veide)."),
    body("03.08.1995 Matsalu siselaht, Martna/Karuse khk, Läänemaa = Pärnu mk >6 ad (Leho Luigujõe, Illu Kaljuvee)."),
    body("Suvi 1989 Veisjärve Lagesoo, Karksi/Helme khk, Viljandimaa ♂♀ ja 4 pull (Indrek Raidve, Tõnis Aaliste, Hardi"),
    body("Ilisson, Rainer Ilisson, Olev Merivee) (foto )."),
    body("1"),
    head("Pelikan e roosapelikan Pelecanus onocrotalus"),
    body("Keskpaik 05.1953 Käomardi laht, Hanila khk, Läänemaa = Pärnu mk ad (Juhan Hõbesalu)."),
    head("Ida-mustvaeras Melanitta americana"),
    body("12.10.2019 Purekkari neem, Pärispea, Kuusalu khk, Harjumaa ad (Uku Paal)."),
    body("07.09.2022 Purekkari neem (Toomas Traagel) (foto)."),
    body("II Kategooria D (ebaselge päritoluga liigid)"),
    head("Määramata pääsujooksur Glareola sp."),
    body("17.08.2022 Kodesmaa, Pärnu-Jaagupi khk, Pärnumaa (Eedi Lelov)."),
  ];
  const recs = parseAcceptedList(lines, KNOWN);

  it("splits records per heading and joins wrapped lines", () => {
    expect(recs).toHaveLength(8);
    expect(recs.map((r) => r.taxonSci)).toEqual([
      "Cygnus columbianus", "Cygnus columbianus", "Cygnus columbianus", "Cygnus columbianus", "Pelecanus onocrotalus",
      "Melanitta americana", "Melanitta americana", "Glareola sp.",
    ]);
  });
  it("inherits location from the first part of a longer place name", () => {
    expect(recs[6]).toMatchObject({ place: "Purekkari neem", kihelkond: "Kuusalu", county: "Harjumaa", locationInherited: true, evidence: ["foto"] });
  });
  it("parses place, parish, county and observers", () => {
    expect(recs[0]).toMatchObject({ place: "Tahu", kihelkond: "Noarootsi", county: "Läänemaa", individualsText: "ad", observers: ["Margus Ots", "Jüri Keskpaik"], status: "accepted", category: "A-C", seq: 0 });
  });
  it("inherits parish and county for repeated places", () => {
    expect(recs[1]).toMatchObject({ place: "Tahu", kihelkond: "Noarootsi", county: "Läänemaa", individualsText: "ad", locationInherited: true });
  });
  it("reads the 2021 county and counts", () => {
    expect(recs[2]).toMatchObject({ kihelkond: "Martna/Karuse", county: "Läänemaa", county2021: "Pärnu", individualsText: ">6 ad", countMin: 6 });
  });
  it("reads evidence, breeding and multi-line observers", () => {
    expect(recs[3]).toMatchObject({ dateText: "Suvi 1989", precision: "season", breeding: true, evidence: ["foto"], countMin: null });
    expect(recs[3].observers).toEqual(["Indrek Raidve", "Tõnis Aaliste", "Hardi Ilisson", "Rainer Ilisson", "Olev Merivee"]);
  });
  it("starts records with Keskpaik and keeps the heading clean", () => {
    expect(recs[4]).toMatchObject({ headingEt: "Pelikan e roosapelikan Pelecanus onocrotalus", dateText: "Keskpaik 05.1953", precision: "month" });
  });
  it("switches category by section", () => {
    expect(recs[7]).toMatchObject({ category: "D", kihelkond: "Pärnu-Jaagupi", county: "Pärnumaa" });
  });
});

describe("parseHirundoReport", () => {
  const lines: HkLine[] = [
    body("Kõigi HK-s käsitletavate liikide kõik"),
    sect("t eated"),
    head("Siberi tõmmuvaeras Melanitta americana – liigistaatuse kaotas"),
    body("Järgnevalt on esitatud varasemates HK aruannetes avaldamata teated."),
    sect("tunnustatud teated. a-, b- ja C-K ategooria"),
    head("Valgesilm-vart Aythya nyroca (15/ca 18 – 1/1)"),
    body("12.07.2025 Orjaku, Käina khk, Hiiumaa ♂ ad (Pekka Leskelä)."),
    body("Lõuna- ja kagupoolse levilaga liik, keda Eestis kohatakse ha-"),
    body("rva."),
    body("Linnuharuldused Eestis 2025: Eesti linnuharulduste komisjoni aruanne nr 21 Anni Miller & Uku Paal"),
    body("8 9"),
    head("Mustkael-pütt Podiceps nigricollis (37/X – 2/3)"),
    body("03.02.2025 Vergi, Haljala khk, Lääne-Virumaa ( Jon Gallagher)."),
    head("Lühinokk-hani Anser brachyrhynchus (kuni 2001)"),
    body("02.05.1999 Audru polder, Audru khk, Pärnumaa 2 is (Mauri Leivo)."),
    body("Iga-aastane väikesearvuline läbirändaja."),
    head("Pikksaba-änn Stercorarius longicaudus (alates 2005) (33/40 – 0/0)"),
    head("Stepiviu Buteo rufinus (5/5 – 3/3)"),
    body("08.07.2025 Reinu, Saarde khk, Pärnumaa 2a (anon) (foto)."),
    body("Eesti 6.-8. leid. Stepiviu on levinud Lõuna- ja Kagu-Euroopas, Lähis-"),
    body("Idas."),
    head("Peegel-tormilind Ardenna grisea (0/0 – 1/1)"),
    body("27.10.2025 Sõrve poolsaarest läänes avamerel, Saaremaa (Agata Balicka, Alexander Hagge (foto)."),
    body("Esmasleid. Peegel-tormilinnu pesitsusalad asuvad Uus-Meremaal."),
    head("Lõuna-hõbekajakas Larus michahellis (2/2 – 0/0)"),
    body("23.04.2023 Läänemeri, Meelste laht, Reigi khk, Hiiumaa ♀ ."),
    body("Sama lind ka 09.05.2023 Liivi laht.\""),
    body("Eesti 2. leid. Sateliitsaatjaga isend."),
    head("Mandariinpart Aix galericulata (44/53 – 3/4)"),
    body("Lääne-Euroopas on ta tavaline tiigilind. Mandariinpart on HK otsusega 2026. aastast"),
    body("HK-s käsitletavate liikide nimestikust välja arvatud."),
    small("2"),
    sect("tunnustamata teated"),
    head("Kirde-mustlagle Branta bernicla nigricans"),
    body("01.11.2024 Piirumi, Häädemeeste khk, Pärnumaa 1 (foto)."),
    body("Vahepealsete tunnustega isend."),
    sect("tänuavaldused"),
    body("HK tänab kõiki."),
  ];
  const r = parseHirundoReport(lines, KNOWN);

  it("reads per-species counts, origin text and nth record", () => {
    const vart = r.species.find((s) => s.taxonSci === "Aythya nyroca");
    expect(vart).toMatchObject({ recordsBefore: 15, indsBefore: 18, recordsYear: 1, indsYear: 1, countsText: "15/ca 18 – 1/1", originTextEt: "Lõuna- ja kagupoolse levilaga liik, keda Eestis kohatakse harva." });
    expect(r.species.find((s) => s.taxonSci === "Podiceps nigricollis")).toMatchObject({ indsBefore: null, indsYear: 3 });
    expect(r.species.find((s) => s.taxonSci === "Buteo rufinus")).toMatchObject({ nthRecordEt: "Eesti 6.-8. leid", originTextEt: "Stepiviu on levinud Lõuna- ja Kagu-Euroopas, Lähis-Idas." });
  });
  it("closes records with an unbalanced parenthesis or a trailing quote", () => {
    expect(r.species.find((s) => s.taxonSci === "Ardenna grisea")).toMatchObject({ nthRecordEt: "Esmasleid", originTextEt: "Peegel-tormilinnu pesitsusalad asuvad Uus-Meremaal." });
    expect(r.species.find((s) => s.taxonSci === "Larus michahellis")).toMatchObject({ nthRecordEt: "Eesti 2. leid", originTextEt: "Sateliitsaatjaga isend." });
  });
  it("reads HK scope notes and removal year", () => {
    expect(r.species.find((s) => s.taxonSci === "Anser brachyrhynchus")).toMatchObject({ scopeEt: "kuni 2001", recordsBefore: null });
    expect(r.species.find((s) => s.taxonSci === "Stercorarius longicaudus")).toMatchObject({ scopeEt: "alates 2005", recordsBefore: 33 });
    expect(r.species.find((s) => s.taxonSci === "Aix galericulata")).toMatchObject({ removedFromYear: 2026 });
  });
  it("returns rejected records with the committee reason", () => {
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ taxonSci: "Branta bernicla nigricans", status: "rejected", rejectionReasonEt: "Vahepealsete tunnustega isend.", kihelkond: "Häädemeeste", evidence: ["foto"] });
  });
  it("ignores taxon-like lines before the first records section", () => {
    expect(r.species.find((s) => s.taxonSci === "Melanitta americana")).toBeUndefined();
    expect(r.species).toHaveLength(8);
  });
  it("does not leak page headers or the acknowledgements", () => {
    const all = JSON.stringify(r);
    expect(all).not.toContain("Anni Miller");
    expect(all).not.toContain("HK tänab");
  });
});

function small(t: string): HkLine {
  return { page: 1, t, role: "small" };
}

describe("restoreCompoundHyphens", () => {
  it("puts back hyphens of known Estonian bird names lost at line breaks", () => {
    expect(restoreCompoundHyphens("Eestis kohatakse punaveetallajat sügisel. Punaveetallaja on harv.", ["Puna-veetallaja", "Väikehuik"]))
      .toBe("Eestis kohatakse puna-veetallajat sügisel. Puna-veetallaja on harv.");
  });
});

describe("parseAcceptedList edge cases", () => {
  const known = ["Ardenna grisea", "Puffinus puffinus", "Ficedula albicollis", "Ficedula hypoleuca"];
  const recs = parseAcceptedList(
    [
      head("Peegel-tormilind Ardenna grisea"),
      body("27.10.2025 Sõrve poolsaarest läänes avamerel, Saaremaa (Agata Balicka, Alexander Hagge (foto)."),
      head("Põhja-tormilind Puffinus puffinus"),
      body("11.08.2024 Põõsaspea neem (Annika Forsten) (foto)."),
      head("Kaelus-kärbsenäpp x must-kärbsenäpp Ficedula albicollis x Ficedula hypoleuca (kuni 2025)"),
      body("01.05.2025 Maidla, Kullamaa khk, Raplamaa ♂ 2a (Owen Foley) (foto)."),
    ],
    known,
  );
  it("starts a new heading even after a record with an unclosed parenthesis", () => {
    expect(recs.map((r) => r.taxonSci)).toEqual(["Ardenna grisea", "Puffinus puffinus", "Ficedula albicollis x Ficedula hypoleuca"]);
    expect(recs[0].rawText).not.toContain("Põhja-tormilind");
  });
});

describe("classifyHirundoLines", () => {
  const known = ["Branta bernicla hrota", "Branta bernicla", "Gavia immer"];
  const raw = [
    "Tunnustatud teated. Kategooriad A, B ja C",
    "Accepted records. Categories A, B and C",
    "Lääne-mustlagle Branta bernicla hrota",
    "(25/45 – 3/3)",
    "18.09.2019 Põõsaspea neem, Noarootsi",
    "khk, Läänemaa ad. (Juho Könönen, Jon",
    "Jörpeland) (foto).",
    "4 Eesti linnuharulduste komisjoni aruanne nr 17",
    "Mustlagle läänepoolne alamliik, kes pesitseb",
    "Gröönimaal.",
    "Ots, M. & Paal, U. 5",
    "32 Linnuharuldused Eestis 2022−2024: Eesti linnuharulduste komisjoni aruanne nr 20",
    "Väikehüüp Ixobrychus minutus (X/X – 3/3)",
    "02.06.2019 Jaama, Vaivara khk, Ida-Virumaa ♂ (Pelle Mellov).",
    "Lõunapoolse levilaga liik.",
    "Tunnustamata teated",
    "Jääkaur Gavia immer",
    "19.05.2018 Paldiski, Harju-Madise khk, Harjumaa (foto).",
    "Foto ei toeta määrangut.",
    "Tänuavaldus",
  ].map((t) => ({ page: 1, t }));
  const lines = classifyHirundoLines(raw, known);
  it("marks sections, running heads and headings and merges a counts line into its heading", () => {
    expect(lines.filter((l) => l.role === "section").map((l) => l.t)).toEqual(["Tunnustatud teated. Kategooriad A, B ja C", "Tunnustamata teated", "Tänuavaldus"]);
    expect(lines.filter((l) => l.role === "heading").map((l) => l.t)).toEqual([
      "Lääne-mustlagle Branta bernicla hrota (25/45 – 3/3)", "Väikehüüp Ixobrychus minutus (X/X – 3/3)", "Jääkaur Gavia immer",
    ]);
    expect(lines.find((l) => l.t.startsWith("4 Eesti"))?.role).toBe("small");
    expect(lines.find((l) => l.t.startsWith("Ots, M."))?.role).toBe("small");
    expect(lines.find((l) => l.t.startsWith("32 Linnuharuldused"))?.role).toBe("small");
  });
  it("feeds parseHirundoReport, including a heading whose genus is not in the known list", () => {
    const r = parseHirundoReport(lines, known);
    expect(r.species.map((s) => s.taxonSci)).toEqual(["Branta bernicla hrota", "Ixobrychus minutus"]);
    expect(r.species[0]).toMatchObject({ recordsBefore: 25, indsYear: 3, originTextEt: "Mustlagle läänepoolne alamliik, kes pesitseb Gröönimaal." });
    expect(r.species[1]).toMatchObject({ originTextEt: "Lõunapoolse levilaga liik." });
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ taxonSci: "Gavia immer", rejectionReasonEt: "Foto ei toeta määrangut." });
  });
});

describe("classifyHirundoLines prose guard", () => {
  it("does not take wrapped prose with capitalised place names for a heading", () => {
    const known = ["Gavia immer"];
    const roles = classifyHirundoLines(
      ["Lääne-Euroopas, Briti saartel", "Kesk-Euroopas ning", "Eestisse sattuda", "Väikehüüp Ixobrychus minutus", "Valgesilm-vart Aythya nyroca (15/ca 18 – 1/1)"].map((t) => ({ page: 1, t })),
      known,
    ).map((l) => l.role);
    expect(roles).toEqual(["body", "body", "body", "heading", "heading"]);
  });
});

describe("older Hirundo layouts", () => {
  const known = ["Circaetus gallicus", "Alca torda", "Vanellus gregarius"];
  const lines = classifyHirundoLines(
    [
      "Tunnustatud teated. Kategooriad A, B ja C",
      "Madukotkas Circaetus gallicus",
      "(kuni 2017) (x/x – 1/1)",
      "25.06.2017 Vigala khk, Läänemaa (Eedi Lelov) (foto).",
      "Lõunapoolse levilaga liik.",
      "Stepikiivitaja Vanellus gregarius (0/0 – 1/1)",
      "20.-27.06.2010 Luuri, Vändra khk., Pärnumaa ad. (Leili Mihkelson jpt.) (Foto).",
      "Esmasleid. Kesk-Aasia steppide liik.",
      "Alk Alca torda pesitsemine",
      "25.06.2006 Allirahu, Püha khk., Saaremaa ad., võimalik pesitsemine (Mati Martinson).",
      "Algi peamised pesitsusalad asuvad Loode-Euroopas.",
      "Tänuavaldus",
    ].map((t) => ({ page: 1, t })),
    known,
  );
  const r = parseHirundoReport(lines, known);
  it("merges a scope + counts line into the heading and keeps records out of the text", () => {
    expect(r.species.map((s) => s.taxonSci)).toEqual(["Circaetus gallicus", "Vanellus gregarius", "Alca torda"]);
    expect(r.species[0]).toMatchObject({ scopeEt: "kuni 2017", recordsYear: 1, indsBefore: null, originTextEt: "Lõunapoolse levilaga liik." });
    expect(r.species[1]).toMatchObject({ nthRecordEt: "Esmasleid", originTextEt: "Kesk-Aasia steppide liik." });
    expect(r.species[2]).toMatchObject({ originTextEt: "Algi peamised pesitsusalad asuvad Loode-Euroopas." });
  });
});

describe("parseAcceptedList with 'khk.'", () => {
  it("reads a parish written with a trailing period", () => {
    const recs = parseAcceptedList(
      [head("Stepikiivitaja Vanellus gregarius"), body("20.-27.06.2010 Luuri, Vändra khk., Pärnumaa ad. (Leili Mihkelson jpt.) (Foto).")],
      ["Vanellus gregarius"],
    );
    expect(recs[0]).toMatchObject({ place: "Luuri", kihelkond: "Vändra", county: "Pärnumaa", individualsText: "ad", evidence: ["Foto"], observers: ["Leili Mihkelson"] });
  });
});
