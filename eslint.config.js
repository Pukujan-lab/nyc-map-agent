// ESLint flat config: type-aware typescript-eslint, react-hooks, jsx-a11y.
// Existing violations are baselined in eslint-baseline.json via
// eslint-suppressions (ESLint's built-in --suppress-all); new code must be clean.
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".size-build/**", "node_modules/**", "public/**", "**/*.d.ts", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["tailwind.config.ts", "*.js", "*.cjs"] }, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["src/**/*.tsx"],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, "react-hooks/exhaustive-deps": "error" },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
);
