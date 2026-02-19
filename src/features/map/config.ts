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
    source: '/map-placeholder.html', // TODO: replace with real uploaded map HTML
    enabled: true,
  },
  // TODO: add more maps here
  // {
  //   id: 'linnuliigid-fi',
  //   name: 'Linnuliigid (FI)',
  //   region: 'Soome',
  //   type: 'remote',
  //   source: 'https://example.com/fi-map',
  //   enabled: false,
  // },
];

export function getActiveMap(): MapDefinition {
  return maps.find((m) => m.enabled) ?? maps[0];
}
