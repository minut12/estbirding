export const SPECIES_META_KEY = "estbirding.speciesMeta.v1";
const SPECIES_META_MIGRATED_KEY = "estbirding.speciesMeta.migrated.v1";

export type SpeciesMeta = {
  name: string;
  ebirdCode?: string;
  rarityLevel?: "none" | "rare" | "super" | "mega";
  avatarUrl?: string;
};

type SpeciesMetaMap = Record<string, SpeciesMeta>;

function safeParseRecord(value: string | null): Record<string, any> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, any>;
  } catch {
    return {};
  }
}

function normalizeRarityLevel(raw: any): "none" | "rare" | "super" | "mega" {
  const lvl = typeof raw?.rarityLevel === "string" ? raw.rarityLevel.trim().toLowerCase() : "";
  if (lvl === "rare" || lvl === "super" || lvl === "mega" || lvl === "none") return lvl;
  if (raw?.isRarity === true) return "rare";
  if (typeof raw?.rarity === "string" && raw.rarity.trim()) {
    const legacy = raw.rarity.trim().toLowerCase();
    if (legacy.includes("mega")) return "mega";
    if (legacy.includes("very") || legacy.includes("super")) return "super";
    return "rare";
  }
  return "none";
}

function sanitizeMeta(name: string, raw: any): SpeciesMeta {
  const ebirdCode = typeof raw?.ebirdCode === "string" ? raw.ebirdCode.trim() : "";
  const avatarUrl = typeof raw?.avatarUrl === "string" ? raw.avatarUrl.trim() : "";
  const rarityLevel = normalizeRarityLevel(raw);
  return {
    name,
    ...(ebirdCode ? { ebirdCode } : {}),
    rarityLevel,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mergeIn(map: SpeciesMetaMap, name: string, partial: Partial<SpeciesMeta>) {
  if (!name) return;
  const prev = map[name] ?? { name };
  map[name] = sanitizeMeta(name, { ...prev, ...partial });
}

function migrateLegacyIfNeeded(current: SpeciesMetaMap): SpeciesMetaMap {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return current;
  if (localStorage.getItem(SPECIES_META_MIGRATED_KEY) === "1") return current;

  const next: SpeciesMetaMap = { ...current };

  const avatarSources = [
    "bm_global_avatars",
    "bm_rari_avatars",
    "linnuliigid_avatars_v1",
    "linnuliigid_avatar_defaults_v1",
  ];
  for (const key of avatarSources) {
    const map = safeParseRecord(localStorage.getItem(key));
    for (const [name, avatarUrl] of Object.entries(map)) {
      if (typeof avatarUrl === "string" && avatarUrl.trim()) {
        mergeIn(next, name, { avatarUrl: avatarUrl.trim() });
      }
    }
  }

  const codeMap = safeParseRecord(localStorage.getItem("bm_global_ebird_codes"));
  for (const [name, ebirdCode] of Object.entries(codeMap)) {
    if (typeof ebirdCode === "string" && ebirdCode.trim()) {
      mergeIn(next, name, { ebirdCode: ebirdCode.trim() });
    }
  }

  const europePoints = safeParseRecord(localStorage.getItem("bm_eu_points"));
  for (const [name, point] of Object.entries(europePoints)) {
    if (!point || typeof point !== "object") continue;
    const ebirdCode = typeof (point as any).ebirdCode === "string" ? (point as any).ebirdCode.trim() : "";
    const rarityLevel = normalizeRarityLevel(point as any);
    if (ebirdCode) mergeIn(next, name, { ebirdCode });
    mergeIn(next, name, { rarityLevel });
  }

  localStorage.setItem(SPECIES_META_MIGRATED_KEY, "1");
  return next;
}

export function saveSpeciesMeta(map: SpeciesMetaMap): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const out: SpeciesMetaMap = {};
  Object.entries(map || {}).forEach(([name, meta]) => {
    out[name] = sanitizeMeta(name, meta);
  });
  localStorage.setItem(SPECIES_META_KEY, JSON.stringify(out));
}

export function loadSpeciesMeta(): SpeciesMetaMap {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  const raw = safeParseRecord(localStorage.getItem(SPECIES_META_KEY));
  const cleaned: SpeciesMetaMap = {};
  Object.entries(raw).forEach(([name, meta]) => {
    cleaned[name] = sanitizeMeta(name, meta);
  });
  const migrated = migrateLegacyIfNeeded(cleaned);
  saveSpeciesMeta(migrated);
  return migrated;
}

export function getSpeciesMeta(name: string): SpeciesMeta {
  const map = loadSpeciesMeta();
  return map[name] ?? { name };
}

export function upsertSpeciesMeta(name: string, partial: Partial<SpeciesMeta>): void {
  if (!name) return;
  const map = loadSpeciesMeta();
  const prev = map[name] ?? { name };
  map[name] = sanitizeMeta(name, { ...prev, ...partial, name });
  saveSpeciesMeta(map);
}
