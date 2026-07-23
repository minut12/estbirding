export type RarityLevel = 'none' | 'rare' | 'super' | 'mega';

// Maps an eBird global observation count to a rarity band.
// Returns null when the count should NOT change the value (> 500k = leave as-is).
// Inclusive edges: the higher band claims the shared boundary (250k → rare, 100k → super).
export function rarityFromObsCount(count: number): RarityLevel | null {
  if (count > 500_000) return null;
  if (count >= 250_000) return 'rare';
  if (count >= 100_000) return 'super';
  return 'mega';
}
