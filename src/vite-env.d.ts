/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' in end-to-end test builds (playwright.config.ts). */
  readonly VITE_E2E?: string
}
