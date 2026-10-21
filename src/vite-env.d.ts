/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCRATA_APP_TOKEN?: string;
  readonly VITE_TILE_URL?: string;
  readonly VITE_CITY_TILES_URL?: string;
  readonly VITE_AGENT_MODE?: "mock" | "http";
  readonly VITE_MAPILLARY_TOKEN?: string;
  /** Same token, unprefixed; exposed via `envPrefix` in vite.config.ts. */
  readonly MAPILLARY_TOKEN?: string;
  readonly VITE_OSRM_URL?: string;
  /** `octo` reads the Octo marts through /api; anything else queries Socrata directly. */
  readonly VITE_DATA_BACKEND?: "octo" | "socrata";
  /** Base URL for /api when it is not same-origin. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
