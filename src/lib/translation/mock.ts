import type { TranslationProvider } from './types';

/**
 * Mock translation provider — returns text as-is.
 * TODO: Replace with DeepL or Google Translate provider.
 */
export const mockTranslationProvider: TranslationProvider = {
  name: 'Mock (passthrough)',
  async translate(text: string, _targetLang: string) {
    return text;
  },
};
