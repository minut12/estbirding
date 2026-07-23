import { describe, expect, it } from 'vitest';
import { rarityFromObsCount } from '@/lib/rarityFromObs';

describe('rarityFromObsCount', () => {
  it('returns null (no change) above 500k', () => {
    expect(rarityFromObsCount(500_001)).toBeNull();
    expect(rarityFromObsCount(29_073_659)).toBeNull();
  });

  it('claims the 500k edge for rare', () => {
    expect(rarityFromObsCount(500_000)).toBe('rare');
  });

  it('bands 250k..500k as rare (higher band owns the 250k edge)', () => {
    expect(rarityFromObsCount(250_000)).toBe('rare');
  });

  it('bands 100k..<250k as super', () => {
    expect(rarityFromObsCount(249_999)).toBe('super');
    expect(rarityFromObsCount(100_000)).toBe('super');
  });

  it('bands <100k as mega', () => {
    expect(rarityFromObsCount(99_999)).toBe('mega');
    expect(rarityFromObsCount(0)).toBe('mega');
  });
});
