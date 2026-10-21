import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `URL.pathname` is percent-encoded, so a project under a path with a space
// (e.g. "Application Support") would otherwise resolve to a missing directory.
const srcDir = decodeURIComponent(new URL("./src", import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  // `MAPILLARY_` is exposed so a plain `MAPILLARY_TOKEN` (the name Mapillary's
  // own docs use) works as well as `VITE_MAPILLARY_TOKEN`. Mapillary client
  // tokens are browser tokens by design. Server secrets such as
  // INFERHUB_API_KEY match neither prefix and stay out of the bundle.
  envPrefix: ["VITE_", "MAPILLARY_"],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
  worker: {
    format: "es",
  },
  server: {
    host: true,
  },
});
