export type SpeciesScopeId = "linnuliigid" | "rariliin";

export type SpeciesScopeConfig = {
  id: SpeciesScopeId;
  displayName: string;
  mapId: string;
  mapScope: "ee_map" | "europe_map" | "rariliin_map";
  mapPath: string;
  speciesJsonPath: string;
  speciesMetaAssetPath?: string;
  placeholderAvatarUrl: string;
  avatarLocalOverridesKey: string;
  avatarSharedCacheKey: string;
  legacyAvatarStorageKey: string;
  avatarFilePrefix: string;
  avatarSpeciesKeyPrefix: string;
  speciesMetaStorageKey: string;
  speciesMetaMigratedKey: string;
  speciesMetaLocalUpdatedAtKey: string;
  speciesMetaCloudUpdatedAtKey: string;
  speciesMetaLastSyncAtKey: string;
  speciesMetaCloudLoadedKey: string;
  speciesMetaLastSyncErrorKey: string;
  speciesMetaCloudFilePath: string;
};

export const LINNULIIGID_SCOPE: SpeciesScopeConfig = {
  id: "linnuliigid",
  displayName: "Linnuliigid",
  mapId: "linnuliigid-ee",
  mapScope: "ee_map",
  mapPath: "/maps/linnuliigid/index.html",
  speciesJsonPath: "/maps/linnuliigid/species.json",
  speciesMetaAssetPath: "/maps/linnuliigid/species-meta.json",
  placeholderAvatarUrl: "/maps/linnuliigid/avatars/placeholder.webp",
  avatarLocalOverridesKey: "linnuliigid_avatars_v1",
  avatarSharedCacheKey: "linnuliigid_avatar_defaults_v1",
  legacyAvatarStorageKey: "bm_rari_avatars",
  avatarFilePrefix: "linnuliigid",
  avatarSpeciesKeyPrefix: "linnuliigid:",
  speciesMetaStorageKey: "estbirding.speciesMeta.v1",
  speciesMetaMigratedKey: "estbirding.speciesMeta.migrated.v1",
  speciesMetaLocalUpdatedAtKey: "estbirding.speciesMeta.local.updatedAt",
  speciesMetaCloudUpdatedAtKey: "estbirding.speciesMeta.cloud.updatedAt",
  speciesMetaLastSyncAtKey: "estbirding.speciesMeta.lastSyncAt",
  speciesMetaCloudLoadedKey: "estbirding.speciesMeta.cloud.loaded",
  speciesMetaLastSyncErrorKey: "estbirding.speciesMeta.lastSyncError",
  speciesMetaCloudFilePath: "meta/species_meta_v1.json",
};

export const RARILIIN_SCOPE: SpeciesScopeConfig = {
  id: "rariliin",
  displayName: "Rariliin",
  mapId: "rariliin",
  mapScope: "rariliin_map",
  mapPath: "/maps/rariliin/index.html",
  speciesJsonPath: "/maps/rariliin/species.json",
  speciesMetaAssetPath: "/maps/rariliin/species-meta.json",
  placeholderAvatarUrl: "/maps/rariliin/avatars/placeholder.webp",
  avatarLocalOverridesKey: "rariliin_avatars_v1",
  avatarSharedCacheKey: "rariliin_avatar_defaults_v1",
  legacyAvatarStorageKey: "bm_rariliin_avatars",
  avatarFilePrefix: "rariliin",
  avatarSpeciesKeyPrefix: "rariliin:",
  speciesMetaStorageKey: "estbirding.rariliin.speciesMeta.v1",
  speciesMetaMigratedKey: "estbirding.rariliin.speciesMeta.migrated.v1",
  speciesMetaLocalUpdatedAtKey: "estbirding.rariliin.speciesMeta.local.updatedAt",
  speciesMetaCloudUpdatedAtKey: "estbirding.rariliin.speciesMeta.cloud.updatedAt",
  speciesMetaLastSyncAtKey: "estbirding.rariliin.speciesMeta.lastSyncAt",
  speciesMetaCloudLoadedKey: "estbirding.rariliin.speciesMeta.cloud.loaded",
  speciesMetaLastSyncErrorKey: "estbirding.rariliin.speciesMeta.lastSyncError",
  speciesMetaCloudFilePath: "meta/species_meta_rariliin_v1.json",
};

export const SPECIES_SCOPES = {
  linnuliigid: LINNULIIGID_SCOPE,
  rariliin: RARILIIN_SCOPE,
} as const;
