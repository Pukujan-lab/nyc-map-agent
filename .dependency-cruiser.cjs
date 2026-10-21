/** Modular-monolith boundaries. See docs/ARCHITECTURE.md and docs/MODULES.md. */
// Old paths that re-export a moved module; remove each once its importers move.
const SHIMS = "^(src/lib/map/restrooms\\.ts|src/components/RestroomCard\\.tsx|api/restrooms\\.ts)$";
// The one shared MapLibre custom layer allowed to use three.js (Alex-approved).
const THREE_LAYER = "^src/lib/map/(streetSigns|threeLayer)\\.ts$";

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Runtime cycles only; type-only imports are erased (2 such cycles in src/lib/agent).",
      severity: "error",
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
    },
    {
      name: "no-orphans",
      comment: "A module nobody imports is dead code (entry points and config excepted).",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(c|m)?js$",
          "\\.d\\.ts$",
          "^src/main\\.tsx$",
          "^server/(app|node)\\.ts$",
          "^scripts/[^/]+\\.ts$",
          "^src/lib/geo/[^/]+\\.worker\\.ts$",
          "^src/features/index\\.ts$",
        ],
      },
      to: {},
    },
    {
      name: "no-cross-feature",
      comment: "A feature imports only shared core, never another feature.",
      severity: "error",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/[^/]+/", pathNot: "^src/features/$1/" },
    },
    {
      name: "no-cross-server-feature",
      severity: "error",
      from: { path: "^server/features/([^/]+)/" },
      to: { path: "^server/features/[^/]+/", pathNot: "^server/features/$1/" },
    },
    {
      name: "core-not-into-features",
      comment: "Core reaches features only via src/features/index.ts (or a legacy shim).",
      severity: "error",
      from: { path: "^src/(lib|components|pages)/", pathNot: SHIMS },
      to: { path: "^src/features/[^/]+/" },
    },
    {
      name: "three-only-in-3d-layer",
      comment: "three.js only in the one shared MapLibre custom layer module.",
      severity: "error",
      from: { pathNot: THREE_LAYER },
      to: { path: "node_modules/(three|@types/three)/" },
    },
    {
      name: "no-deck-gl",
      comment: "deck.gl stays banned.",
      severity: "error",
      from: {},
      to: { path: "node_modules/(deck\\.gl|@deck\\.gl)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^dist/|\\.test\\.tsx?$)" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"] },
  },
};
