/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'mock' | 'live';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
