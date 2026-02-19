/** Pluggable translation provider interface */
export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<string>;
  name: string;
}
