export const COUNTRY_TO_ISO2: Record<string, string> = {
  latvia: "LV",
  latvija: "LV",
  läti: "LV",
  lati: "LV",
};

export function normalizeCountryToIso2(input: string | null | undefined): string {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  return COUNTRY_TO_ISO2[raw] || raw.toUpperCase();
}
