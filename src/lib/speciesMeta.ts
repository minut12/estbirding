import { normalizeSpeciesName, normalizeUiText } from "@/lib/textNormalize";
import { LINNULIIGID_SCOPE, type SpeciesScopeConfig } from "@/lib/mapScope";
export const SPECIES_META_KEY = LINNULIIGID_SCOPE.speciesMetaStorageKey;
const SPECIES_META_MIGRATED_KEY = LINNULIIGID_SCOPE.speciesMetaMigratedKey;
export const SPECIES_META_LOCAL_UPDATED_AT_KEY = LINNULIIGID_SCOPE.speciesMetaLocalUpdatedAtKey;

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

function migrateLegacyIfNeeded(current: SpeciesMetaMap, scope: SpeciesScopeConfig): SpeciesMetaMap {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return current;
  if (localStorage.getItem(scope.speciesMetaMigratedKey) === "1") return current;
  if (scope.id !== "linnuliigid") return current;

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

  localStorage.setItem(scope.speciesMetaMigratedKey, "1");
  return next;
}

export function saveSpeciesMeta(map: SpeciesMetaMap, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const out: SpeciesMetaMap = {};
  Object.entries(map || {}).forEach(([name, meta]) => {
    out[name] = sanitizeMeta(name, meta);
  });
  localStorage.setItem(scope.speciesMetaStorageKey, JSON.stringify(out));
  localStorage.setItem(scope.speciesMetaLocalUpdatedAtKey, new Date().toISOString());
}

export function loadSpeciesMeta(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): SpeciesMetaMap {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  const raw = safeParseRecord(localStorage.getItem(scope.speciesMetaStorageKey));
  const cleaned: SpeciesMetaMap = {};
  Object.entries(raw).forEach(([name, meta]) => {
    const key = normalizeSpeciesName(name);
    if (!key) return;
    cleaned[key] = sanitizeMeta(key, meta);
  });
  const migrated = migrateLegacyIfNeeded(cleaned, scope);
  saveSpeciesMeta(migrated, scope);
  return migrated;
}

export function getSpeciesMeta(name: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): SpeciesMeta {
  const map = loadSpeciesMeta(scope);
  const key = normalizeSpeciesName(name);
  return map[key] ?? { name: key };
}

export function upsertSpeciesMeta(name: string, partial: Partial<SpeciesMeta>, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  const key = normalizeSpeciesName(name);
  if (!key) return;
  const map = loadSpeciesMeta(scope);
  const prev = map[key] ?? { name: key };
  map[key] = sanitizeMeta(key, { ...prev, ...partial, name: key });
  saveSpeciesMeta(map, scope);
}

export function replaceSpeciesMeta(map: SpeciesMetaMap, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  saveSpeciesMeta(map, scope);
}
