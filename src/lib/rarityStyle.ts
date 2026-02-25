export type RarityLevel = 'none' | 'rare' | 'super' | 'mega';

export function getRarityStyle(level: RarityLevel) {
  if (level === 'rare') {
    return {
      ringColor: '#f59e0b',
      ringWidth: 3,
      badgeBg: '#111111',
      badgeFg: '#ffffff',
      badgeText: 'R' as const,
    };
  }
  if (level === 'super') {
    return {
      ringColor: '#dc2626',
      ringWidth: 3,
      badgeBg: '#111111',
      badgeFg: '#ffffff',
      badgeText: 'SR' as const,
    };
  }
  if (level === 'mega') {
    return {
      ringColor: '#7c3aed',
      ringWidth: 3,
      badgeBg: '#111111',
      badgeFg: '#ffffff',
      badgeText: 'MR' as const,
    };
  }
  return {
    ringColor: null,
    ringWidth: 3,
    badgeBg: '#111111',
    badgeFg: '#ffffff',
    badgeText: null,
  };
}