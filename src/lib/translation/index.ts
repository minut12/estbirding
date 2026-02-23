import type { TranslationProvider } from './types';
import { mockTranslationProvider } from './mock';

export type { TranslationProvider };

export function getTranslationProvider(): TranslationProvider {
  return mockTranslationProvider;
}
