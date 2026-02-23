export function normalizeLocale(locale: string | null | undefined): string {
  const raw = String(locale || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.split(/[-_]/)[0] || raw;
}

export function isEstonianLocale(locale: string | null | undefined): boolean {
  return normalizeLocale(locale) === "et";
}

export function resolveAppLocale(): string {
  if (typeof document !== "undefined" && document.documentElement?.lang) {
    return document.documentElement.lang;
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "";
}
