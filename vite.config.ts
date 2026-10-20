import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `URL.pathname` is percent-encoded, so a project under a path with a space
// (e.g. "Application Support") would otherwise resolve to a missing directory.
const srcDir = decodeURIComponent(new URL("./src", import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
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
