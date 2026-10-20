/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCRATA_APP_TOKEN?: string;
  readonly VITE_TILE_URL?: string;
  readonly VITE_AGENT_MODE?: "mock" | "http";
  readonly VITE_MAPILLARY_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
