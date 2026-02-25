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
  },
  emptyByTab: {
    tulevased: "Ei leitud tulevasi üritusi.",
    moodunud: "Ei leitud möödunud üritusi.",
    muud: "Ei leitud üritusi.",
  },
  detailsTitle: "Ürituse detailid",
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
