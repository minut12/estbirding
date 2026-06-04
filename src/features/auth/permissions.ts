export const PERMISSIONS = {
  newsView: "news.view",
  newsArchive: "news.archive",
  eventsView: "events.view",
  mapViewEe: "maps.view.ee",
  mapViewEurope: "maps.view.eu",
  mapViewRariliin: "maps.view.rariliin",
  mapViewUsaCo: "maps.view.usa.co",
  mapViewUsaPa: "maps.view.usa.pa",
  mapViewUsaI70: "maps.view.usa.i70",
  mapViewUsaCoPoi: "maps.view.usa.copoi",
  settingsManage: "settings.manage",
  settingsLinksAdmin: "settings.links.admin",
  kevadranneEdit: "kevadranne.edit",
  speciesEdit: "species.edit",
  usersManage: "users.manage",
  rolesManage: "roles.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
