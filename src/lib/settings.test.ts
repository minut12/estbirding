import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, isGpsEnabled } from '@/lib/settings';

// Mirror of the private STORAGE_KEY in settings.ts — used to write a settings
// blob shaped exactly as it was *before* `gpsEnabled` existed.
const STORAGE_KEY = 'estbirding-settings';

describe('gpsEnabled setting', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to false when nothing is stored', () => {
    expect(loadSettings().gpsEnabled).toBe(false);
    expect(isGpsEnabled()).toBe(false);
  });

  it('round-trips true through saveSettings/isGpsEnabled', () => {
    saveSettings({ ...loadSettings(), gpsEnabled: true });
    expect(isGpsEnabled()).toBe(true);
  });

  it('treats a legacy blob without gpsEnabled as false (backward-compatible)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        newsSourceUrl: '',
        eventsSourceUrl: '',
        autoTranslateToEstonian: true,
        enableSpeciesPredictionBeta: false,
      }),
    );
    expect(loadSettings().gpsEnabled).toBe(false);
    expect(isGpsEnabled()).toBe(false);
  });
});
