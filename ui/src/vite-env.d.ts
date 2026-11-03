/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** App version from package.json, injected at build time (vite.config.ts `define`). */
declare const __APP_VERSION__: string
