interface ImportMetaEnv {
  /** Backend base URL in production, e.g. https://api.up.railway.app. Empty in dev (Vite proxy). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
