import type { EventCategory } from "@/data/events";

const MONTHS = [
  "jaanuar",
  "veebruar",
  "märts",
  "aprill",
  "mai",
  "juuni",
  "juuli",
  "august",
  "september",
  "oktoober",
  "november",
  "detsember",
];

export const et = {
  eventsTitle: "Üritused",
  refresh: "Värskenda",
  searchPlaceholder: "Otsi üritusi…",
  tabs: {
    tulevased: "Tulevased",
    moodunud: "Möödunud",
    muud: "Muud",
  },
  chips: {
    koik: "Kõik",
    estbirding: "EstBirding",
    muud: "Muud",
    eoy: "EOÜ",
  },
  emptyByTab: {
    tulevased: "Ei leitud tulevasi üritusi.",
    moodunud: "Ei leitud möödunud üritusi.",
    muud: "Ei leitud üritusi.",
  },
  detailsTitle: "Ürituse detailid",
  eventLink: {
    titleCreate: "Lisa üritus",
    titleEdit: "Muuda üritust",
    description: "Kleebi ürituse link, kontrolli välju ja salvesta.",
    urlLabel: "Ürituse link",
    urlPlaceholder: "https://",
    readButton: "Loe link",
    manualButton: "Täida käsitsi",
    progressLoaded: "Leht laeti",
    progressParsed: "Pealkiri, aeg ja kirjeldus loetud",
    progressLocating: "Otsin asukohta",
    fieldTitle: "Pealkiri*",
    fieldStart: "Algus*",
    fieldEnd: "Lõpp",
    fieldLocation: "Koht",
    fieldSource: "Allikas",
    fieldImage: "Pilt",
    fieldDescription: "Kirjeldus",
    sourceOther: "Muu",
    noteFacebook: "Facebooki lehelt saime ainult pealkirja ja pildi. Lisa aeg ja koht käsitsi.",
    hintGeocode: "Asukohta ei leitud, salvestame nimena",
    hintLlm: "Automaatne lugemine ei õnnestunud, täida käsitsi",
    errForbidden: "Ainult administraator saab üritusi lisada",
    errFetchFailed: "Lehte ei õnnestunud laadida",
    errGeneric: "Linki ei õnnestunud lugeda",
    errUrlRequired: "Sisesta link.",
    errTitleRequired: "Pealkiri on kohustuslik.",
    errStartRequired: "Algusaeg on kohustuslik.",
    errStartInvalid: "Algusaeg on vigane.",
    errEndInvalid: "Lõpuaeg on vigane.",
    errEndBeforeStart: "Lõpuaeg peab olema suurem või võrdne algusajaga.",
    imageTooLarge: "Pilt liiga suur — vähenda (või vali väiksem pilt).",
    imageProcessFailed: "Pildi töötlemine ebaõnnestus",
    imageAlt: "Ürituse eelvaade",
    removeImage: "Eemalda pilt",
    back: "Tagasi",
    cancel: "Tühista",
    save: "Salvesta",
    saving: "Salvestan…",
    saved: "Üritus salvestatud",
  },
  categoryLabel(category: EventCategory): string {
    return category;
  },
};

export function formatEventDate(startAtIso: string): string {
  const d = new Date(startAtIso);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()] ?? "";
  const hours = String(d.getHours());
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}. ${month} | ${hours}:${minutes}`;
}

export function formatEventCountdown(startsAtIso: string, now = new Date()): string {
  const startsAt = new Date(startsAtIso);
  const startDay = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((startDay.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Täna";
  if (diffDays === 1) return "Homme";
  if (diffDays > 1) return `${diffDays} päeva jäänud`;
  if (diffDays === -1) return "Eile";
  return `Toimus ${Math.abs(diffDays)} päeva tagasi`;
}
