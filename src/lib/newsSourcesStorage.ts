import { DEFAULT_NEWS_SOURCES, type NewsSourceConfigItem } from "@/config/newsSources";

export const NEWS_SOURCES_KEY = "estbirding.newsSources.v2";

export type NewsSourcesOrigin = "default" | "stored" | "repaired";

interface LegacyNewsSourceShape {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  url?: unknown;
  enabled?: unknown;
  type?: unknown;
  feed_url?: unknown;
  homepage_url?: unknown;
  is_enabled?: unknown;
  slug?: unknown;
  key?: unknown;
}

function cloneDefaults(): NewsSourceConfigItem[] {
  return DEFAULT_NEWS_SOURCES.map((source) => ({ ...source }));
}

function sanitizeSource(input: LegacyNewsSourceShape): NewsSourceConfigItem | null {
  const rawId = typeof input.id === "string" ? input.id.trim() : "";
  const idFromLegacySlug = typeof input.slug === "string" && input.slug.trim() === "eoy"
    ? "eoy"
    : typeof input.slug === "string" && input.slug.trim().includes("birding")
      ? "birding_poland"
      : "";
  const id = rawId || idFromLegacySlug;

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const kindCandidate = typeof input.kind === "string" ? input.kind : typeof input.type === "string" ? input.type : "";
  const kind = kindCandidate === "scrape" || kindCandidate === "rss" ? kindCandidate : "";
  const urlCandidate =
    typeof input.url === "string" ? input.url
      : typeof input.feed_url === "string" ? input.feed_url
        : typeof input.homepage_url === "string" ? input.homepage_url
          : "";
  const url = urlCandidate.trim();
  const enabledCandidate =
    typeof input.enabled === "boolean" ? input.enabled
      : typeof input.is_enabled === "boolean" ? input.is_enabled
        : null;

  if (!id || !name || !kind || !url || enabledCandidate == null) {
    return null;
  }

  return {
    id,
    name,
    kind,
    url,
    enabled: enabledCandidate,
  };
}

function isCorruptedSingleEntry(list: NewsSourceConfigItem[]): boolean {
  if (list.length !== 1) return false;
  const only = list[0];

  if (only.id === "eoy") {
    return /rss\.app/i.test(only.url) || !/eoy\.ee/i.test(only.url) || !/^eo/i.test(only.name.toLowerCase());
  }

  if (only.id === "birding_poland") {
    return /eoy\.ee/i.test(only.url) || !/rss\.app/i.test(only.url);
  }

  return true;
}

function mergeWithDefaults(list: NewsSourceConfigItem[]): NewsSourceConfigItem[] {
  const byId = new Map<string, NewsSourceConfigItem>();
  for (const source of list) {
    byId.set(source.id, source);
  }

  const merged = DEFAULT_NEWS_SOURCES.map((defaultSource) => {
    const stored = byId.get(defaultSource.id);
    return stored ? { ...defaultSource, ...stored } : { ...defaultSource };
  });

  for (const source of list) {
    if (!DEFAULT_NEWS_SOURCES.some((defaultSource) => defaultSource.id === source.id)) {
      merged.push(source);
    }
  }

  return merged;
}

export function saveNewsSources(list: NewsSourceConfigItem[]): void {
  const normalized = mergeWithDefaults(list);
  localStorage.setItem(NEWS_SOURCES_KEY, JSON.stringify(normalized));
}

export function loadNewsSources(): { list: NewsSourceConfigItem[]; source: NewsSourcesOrigin } {
  const raw = localStorage.getItem(NEWS_SOURCES_KEY);
  if (!raw) {
    const defaults = cloneDefaults();
    saveNewsSources(defaults);
    return { list: defaults, source: "default" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const repaired = cloneDefaults();
    saveNewsSources(repaired);
    return { list: repaired, source: "repaired" };
  }

  if (!Array.isArray(parsed)) {
    const repaired = cloneDefaults();
    saveNewsSources(repaired);
    return { list: repaired, source: "repaired" };
  }

  const sanitized = parsed
    .map((item) => sanitizeSource((item || {}) as LegacyNewsSourceShape))
    .filter((item): item is NewsSourceConfigItem => Boolean(item));

  if (sanitized.length === 0) {
    const repaired = cloneDefaults();
    saveNewsSources(repaired);
    return { list: repaired, source: "repaired" };
  }

  const merged = mergeWithDefaults(sanitized);
  if (isCorruptedSingleEntry(merged) || isCorruptedSingleEntry(sanitized)) {
    const repaired = mergeWithDefaults(cloneDefaults());
    saveNewsSources(repaired);
    return { list: repaired, source: "repaired" };
  }

  const missingDefault = DEFAULT_NEWS_SOURCES.some((defaultSource) => !merged.some((stored) => stored.id === defaultSource.id));
  if (missingDefault || merged.length !== sanitized.length) {
    saveNewsSources(merged);
    return { list: merged, source: "repaired" };
  }

  return { list: merged, source: "stored" };
}

export function loadNewsSourcesWithOrigin(): { sources: NewsSourceConfigItem[]; source: NewsSourcesOrigin } {
  const loaded = loadNewsSources();
  return { sources: loaded.list, source: loaded.source };
}

export function resetNewsSourcesToDefaults(): NewsSourceConfigItem[] {
  const defaults = cloneDefaults();
  saveNewsSources(defaults);
  return defaults;
}
