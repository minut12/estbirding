/** Extensible map configuration — add new maps here */

export interface MapDefinition {
  id: string;
  name: string;
  region: string;
  type: 'asset' | 'remote';
  source: string;          // path to asset or remote URL
  enabled: boolean;
}

export const maps: MapDefinition[] = [
  {
    id: 'linnuliigid-ee',
    name: 'Linnuliigid (EE)',
    region: 'Eesti',
    type: 'asset',
    source: '/maps/linnuliigid/index.html',
    enabled: true,
  },
  {
    id: 'europe',
    name: 'Europe',
    region: 'Europe',
    type: 'asset',
    source: '/maps/europe/index.html',
    enabled: true,
  },
];

export function getActiveMap(): MapDefinition {
  return maps.find((m) => m.enabled) ?? maps[0];
}
