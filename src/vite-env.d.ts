/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly TRANSLATE_API_URL?: string;
  readonly VITE_TRANSLATE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
