/** Extensible map configuration — add new maps here */

export interface MapDefinition {
  id: string;
  name: string;
  region: string;
  type: 'asset' | 'remote';
  source: string;          // path to asset or remote URL
  enabled: boolean;
  permissionKey: string;
}

export const maps: MapDefinition[] = [
  {
    id: 'linnuliigid-ee',
    name: 'Linnuliigid (EE)',
    region: 'Eesti',
    type: 'asset',
    source: '/maps/linnuliigid/index.html',
    enabled: true,
    permissionKey: 'maps.view.ee',
  },
  {
    id: 'europe',
    name: 'Europe',
    region: 'Europe',
    type: 'asset',
    source: '/maps/europe/index.html',
    enabled: true,
    permissionKey: 'maps.view.eu',
  },
  {
    id: 'rariliin',
    name: 'Rariliin',
    region: 'Eesti',
    type: 'asset',
    source: '/maps/rariliin/index.html',
    enabled: true,
    permissionKey: 'maps.view.rariliin',
  },
  {
    id: 'usa-co',
    name: 'Colorado',
    region: 'USA',
    type: 'asset',
    source: '/maps/usa-co/index.html',
    enabled: true,
    permissionKey: 'maps.view.usa.co',
  },
  {
    id: 'usa-pa',
    name: 'Pennsylvania',
    region: 'USA',
    type: 'asset',
    source: '/maps/usa-pa/index.html',
    enabled: true,
    permissionKey: 'maps.view.usa.pa',
  },
  {
    id: 'usa-i70',
    name: 'USA I-70 Route',
    region: 'USA',
    type: 'asset',
    source: '/maps/usa-i70/index.html',
    enabled: true,
    permissionKey: 'maps.view.usa.i70',
  },
];

export function getActiveMap(): MapDefinition {
  return maps.find((m) => m.enabled) ?? maps[0];
}
