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

describe('legacy autoTranslateToEstonian', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('strips the legacy field and removes the legacy news key on load', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        newsSourceUrl: '',
        eventsSourceUrl: '',
        autoTranslateToEstonian: false,
        enableSpeciesPredictionBeta: false,
        gpsEnabled: true,
      }),
    );
    localStorage.setItem('news_auto_translate_et', '0');
    const result = loadSettings();
    expect('autoTranslateToEstonian' in result).toBe(false);
    expect(localStorage.getItem('news_auto_translate_et')).toBeNull();
    expect(result.gpsEnabled).toBe(true);
  });
});
