import { DEFAULT_NEWS_SOURCES, type NewsSourceConfigItem } from "@/config/newsSources";

export const NEWS_SOURCES_KEY = "estbirding.newsSources.v1";
export const NEWS_SOURCES_CLEARED_KEY = "estbirding.newsSources.cleared";

export type NewsSourcesOrigin = "default" | "stored" | "cleared";

function cloneDefaults(): NewsSourceConfigItem[] {
  return DEFAULT_NEWS_SOURCES.map((s) => ({ ...s }));
}

export function saveNewsSources(list: NewsSourceConfigItem[]): void {
  localStorage.setItem(NEWS_SOURCES_KEY, JSON.stringify(list));
  localStorage.setItem(NEWS_SOURCES_CLEARED_KEY, list.length === 0 ? "1" : "0");
}

export function resetNewsSourcesToDefaults(): NewsSourceConfigItem[] {
  const defaults = cloneDefaults();
  saveNewsSources(defaults);
  return defaults;
}

export function loadNewsSourcesWithOrigin(): { sources: NewsSourceConfigItem[]; source: NewsSourcesOrigin } {
  const raw = localStorage.getItem(NEWS_SOURCES_KEY);
  const cleared = localStorage.getItem(NEWS_SOURCES_CLEARED_KEY) === "1";

  if (!raw) {
    const defaults = resetNewsSourcesToDefaults();
    return { sources: defaults, source: "default" };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const defaults = resetNewsSourcesToDefaults();
      return { sources: defaults, source: "default" };
    }

    const list = parsed as NewsSourceConfigItem[];
    if (list.length === 0) {
      if (cleared) return { sources: [], source: "cleared" };
      const defaults = resetNewsSourcesToDefaults();
      return { sources: defaults, source: "default" };
    }

    return { sources: list, source: "stored" };
  } catch {
    const defaults = resetNewsSourcesToDefaults();
    return { sources: defaults, source: "default" };
  }
}

