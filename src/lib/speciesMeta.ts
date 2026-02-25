import { normalizeSpeciesName, normalizeUiText } from "@/lib/textNormalize";
export const SPECIES_META_KEY = "estbirding.speciesMeta.v1";
const SPECIES_META_MIGRATED_KEY = "estbirding.speciesMeta.migrated.v1";
export const SPECIES_META_LOCAL_UPDATED_AT_KEY = "estbirding.speciesMeta.local.updatedAt";

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
  const normalizedName = normalizeSpeciesName(name);
  const ebirdCode = typeof raw?.ebirdCode === "string" ? normalizeUiText(raw.ebirdCode) : "";
  const avatarUrl = typeof raw?.avatarUrl === "string" ? normalizeUiText(raw.avatarUrl) : "";
  const rarityLevel = normalizeRarityLevel(raw);
  return {
    name: normalizedName,
    ...(ebirdCode ? { ebirdCode } : {}),
    rarityLevel,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mergeIn(map: SpeciesMetaMap, name: string, partial: Partial<SpeciesMeta>) {
  const key = normalizeSpeciesName(name);
  if (!key) return;
  const prev = map[key] ?? { name: key };
  map[key] = sanitizeMeta(key, { ...prev, ...partial });
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
  localStorage.setItem(SPECIES_META_LOCAL_UPDATED_AT_KEY, new Date().toISOString());
}

export function loadSpeciesMeta(): SpeciesMetaMap {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  const raw = safeParseRecord(localStorage.getItem(SPECIES_META_KEY));
  const cleaned: SpeciesMetaMap = {};
  Object.entries(raw).forEach(([name, meta]) => {
    const key = normalizeSpeciesName(name);
    if (!key) return;
    cleaned[key] = sanitizeMeta(key, meta);
  });
  const migrated = migrateLegacyIfNeeded(cleaned);
  saveSpeciesMeta(migrated);
  return migrated;
}

export function getSpeciesMeta(name: string): SpeciesMeta {
  const map = loadSpeciesMeta();
  const key = normalizeSpeciesName(name);
  return map[key] ?? { name: key };
}

export function upsertSpeciesMeta(name: string, partial: Partial<SpeciesMeta>): void {
  const key = normalizeSpeciesName(name);
  if (!key) return;
  const map = loadSpeciesMeta();
  const prev = map[key] ?? { name: key };
  map[key] = sanitizeMeta(key, { ...prev, ...partial, name: key });
  saveSpeciesMeta(map);
}

export function replaceSpeciesMeta(map: SpeciesMetaMap): void {
  saveSpeciesMeta(map);
}
