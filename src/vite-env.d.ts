/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCRATA_APP_TOKEN?: string;
  readonly VITE_TILE_URL?: string;
  readonly VITE_AGENT_MODE?: "mock" | "http";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
