import type { TranslationProvider } from './types';
import { mockTranslationProvider } from './mock';
import { loadSettings } from '@/lib/settings';

export type { TranslationProvider };

export function getTranslationProvider(): TranslationProvider {
  const settings = loadSettings();

  switch (settings.translationProvider) {
    // TODO: implement real providers
    // case 'deepl': return createDeepLProvider(settings.translationApiKey);
    // case 'google': return createGoogleProvider(settings.translationApiKey);
    default:
      return mockTranslationProvider;
  }
}
