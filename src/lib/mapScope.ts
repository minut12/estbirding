export type SpeciesScopeId = "linnuliigid" | "rariliin" | "usa_co" | "usa_pa" | "usa_i70";

export type SpeciesScopeConfig = {
  id: SpeciesScopeId;
  displayName: string;
  mapId: string;
  mapScope: "ee_map" | "europe_map" | "rariliin_map" | "usa_co_map" | "usa_pa_map" | "usa_i70_map";
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

export const USA_CO_SCOPE: SpeciesScopeConfig = {
  id: "usa_co",
  displayName: "Colorado",
  mapId: "usa-co",
  mapScope: "usa_co_map",
  mapPath: "/maps/usa-co/index.html",
  speciesJsonPath: "/maps/usa-co/species.json",
  // No speciesMetaAssetPath — these maps start empty; AvatarManager will skip the asset fetch
  placeholderAvatarUrl: "/maps/usa-co/avatars/placeholder.webp",
  avatarLocalOverridesKey: "usa_co_avatars_v1",
  avatarSharedCacheKey: "usa_co_avatar_defaults_v1",
  legacyAvatarStorageKey: "bm_usa_co_avatars",
  avatarFilePrefix: "usa-co",
  avatarSpeciesKeyPrefix: "usa-co:",
  speciesMetaStorageKey: "estbirding.usa_co.speciesMeta.v1",
  speciesMetaMigratedKey: "estbirding.usa_co.speciesMeta.migrated.v1",
  speciesMetaLocalUpdatedAtKey: "estbirding.usa_co.speciesMeta.local.updatedAt",
  speciesMetaCloudUpdatedAtKey: "estbirding.usa_co.speciesMeta.cloud.updatedAt",
  speciesMetaLastSyncAtKey: "estbirding.usa_co.speciesMeta.lastSyncAt",
  speciesMetaCloudLoadedKey: "estbirding.usa_co.speciesMeta.cloud.loaded",
  speciesMetaLastSyncErrorKey: "estbirding.usa_co.speciesMeta.lastSyncError",
  speciesMetaCloudFilePath: "meta/species_meta_usa_co_v1.json",
};

export const USA_PA_SCOPE: SpeciesScopeConfig = {
  id: "usa_pa",
  displayName: "Pennsylvania",
  mapId: "usa-pa",
  mapScope: "usa_pa_map",
  mapPath: "/maps/usa-pa/index.html",
  speciesJsonPath: "/maps/usa-pa/species.json",
  placeholderAvatarUrl: "/maps/usa-pa/avatars/placeholder.webp",
  avatarLocalOverridesKey: "usa_pa_avatars_v1",
  avatarSharedCacheKey: "usa_pa_avatar_defaults_v1",
  legacyAvatarStorageKey: "bm_usa_pa_avatars",
  avatarFilePrefix: "usa-pa",
  avatarSpeciesKeyPrefix: "usa-pa:",
  speciesMetaStorageKey: "estbirding.usa_pa.speciesMeta.v1",
  speciesMetaMigratedKey: "estbirding.usa_pa.speciesMeta.migrated.v1",
  speciesMetaLocalUpdatedAtKey: "estbirding.usa_pa.speciesMeta.local.updatedAt",
  speciesMetaCloudUpdatedAtKey: "estbirding.usa_pa.speciesMeta.cloud.updatedAt",
  speciesMetaLastSyncAtKey: "estbirding.usa_pa.speciesMeta.lastSyncAt",
  speciesMetaCloudLoadedKey: "estbirding.usa_pa.speciesMeta.cloud.loaded",
  speciesMetaLastSyncErrorKey: "estbirding.usa_pa.speciesMeta.lastSyncError",
  speciesMetaCloudFilePath: "meta/species_meta_usa_pa_v1.json",
};

export const USA_I70_SCOPE: SpeciesScopeConfig = {
  id: "usa_i70",
  displayName: "USA I-70 Route",
  mapId: "usa-i70",
  mapScope: "usa_i70_map",
  mapPath: "/maps/usa-i70/index.html",
  speciesJsonPath: "/maps/usa-i70/species.json",
  placeholderAvatarUrl: "/maps/usa-i70/avatars/placeholder.webp",
  avatarLocalOverridesKey: "usa_i70_avatars_v1",
  avatarSharedCacheKey: "usa_i70_avatar_defaults_v1",
  legacyAvatarStorageKey: "bm_usa_i70_avatars",
  avatarFilePrefix: "usa-i70",
  avatarSpeciesKeyPrefix: "usa-i70:",
  speciesMetaStorageKey: "estbirding.usa_i70.speciesMeta.v1",
  speciesMetaMigratedKey: "estbirding.usa_i70.speciesMeta.migrated.v1",
  speciesMetaLocalUpdatedAtKey: "estbirding.usa_i70.speciesMeta.local.updatedAt",
  speciesMetaCloudUpdatedAtKey: "estbirding.usa_i70.speciesMeta.cloud.updatedAt",
  speciesMetaLastSyncAtKey: "estbirding.usa_i70.speciesMeta.lastSyncAt",
  speciesMetaCloudLoadedKey: "estbirding.usa_i70.speciesMeta.cloud.loaded",
  speciesMetaLastSyncErrorKey: "estbirding.usa_i70.speciesMeta.lastSyncError",
  speciesMetaCloudFilePath: "meta/species_meta_usa_i70_v1.json",
};

export const SPECIES_SCOPES = {
  linnuliigid: LINNULIIGID_SCOPE,
  rariliin: RARILIIN_SCOPE,
  usa_co: USA_CO_SCOPE,
  usa_pa: USA_PA_SCOPE,
  usa_i70: USA_I70_SCOPE,
} as const;
