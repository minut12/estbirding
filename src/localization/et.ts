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

const CHIPS = {
  koik: "Kõik",
  estbirding: "EstBirding",
  eoy: "EOÜ",
  muud: "Muu",
};

export const et = {
  eventsTitle: "Üritused",
  backToEvents: "Kõik üritused",
  refresh: "Värskenda",
  searchPlaceholder: "Otsi üritusi…",
  tabs: {
    tulevased: "Tulevased",
    moodunud: "Möödunud",
  },
  chips: CHIPS,
  emptyUpcoming: "Tulevasi üritusi pole.",
  emptyPast: "Möödunud üritusi pole.",
  monthCount: (n: number): string => `${n} üritust`,
  confirmDelete: "Kinnita kustutamine",
  metaSeparator: " · ",
  edit: "Muuda",
  delete: "Kustuta",
  eventDeleted: "Üritus kustutatud",
  loadingEvents: "Laen üritusi...",
  adminModeOn: "Admin režiim: sees",
  adminModeOff: "Admin režiim: väljas (admin rolli vaja)",
  addToCalendar: "Lisa kalendrisse",
  nextEvent: "Järgmine",
  viewEvent: "Vaata üritust",
  openOnMap: "Ava kaardil",
  openOriginal: "Ava algallikas",
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
    noteFacebookMeta: "Facebookist saime pealkirja, kuupäeva ja koha. Lisa kellaaeg, lõpp ja kirjeldus käsitsi.",
    hintGeocode: "Asukohta ei leitud, salvestame nimena",
    hintLlm: "Automaatne lugemine ei õnnestunud, täida käsitsi",
    hintFacebookImage: "Facebook ei anna pilti välja. Lisa pilt käsitsi.",
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
    if (category === "EOY") return CHIPS.eoy;
    if (category === "Muud") return CHIPS.muud;
    return CHIPS.estbirding;
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
  if (diffDays > 1) return `${diffDays} päeva pärast`;
  if (diffDays === -1) return "Eile";
  return `${Math.abs(diffDays)} päeva tagasi`;
}

const MONTH_ABBRS = [
  "jaan", "veebr", "märts", "apr", "mai", "juuni",
  "juuli", "aug", "sept", "okt", "nov", "dets",
];

/** Short month name for the event date block ("" when the date is invalid). */
export function formatEventMonthAbbr(startAtIso: string): string {
  const d = new Date(startAtIso);
  if (Number.isNaN(d.getTime())) return "";
  return MONTH_ABBRS[d.getMonth()] ?? "";
}

/** Month section label, e.g. "Oktoober 2026". monthIndex is 0-based. */
export function formatEventMonthLabel(year: number, monthIndex: number): string {
  const name = MONTHS[monthIndex] ?? String(monthIndex + 1);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}
