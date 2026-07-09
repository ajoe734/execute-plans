import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignore the Pantheon contract bundle: CI checks out the pantheon repo into
  // ./pantheon-contract for contract-drift validation, and that repo vendors a
  // runtime mirror of execute-plans. Linting that foreign checkout surfaced
  // errors from code this repo does not own and broke `npm run lint` in the gate.
  { ignores: ["dist", "pantheon-contract", "pantheon-contract/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // C1+C2 (2026-05-09) — deprecate v3 normative layer (superseded by v4)
      // and v5/timeoutPolicy (superseded by v4/asyncTransitionPolicy).
      // Existing imports kept as legacy shim; new code must use v4.
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["@/lib/v3", "@/lib/v3/*"],
              message:
                "v3 layer is deprecated; use @/lib/v4/* instead. See .lovable/spec/v4/CHANGELOG.md.",
            },
            {
              group: ["@/lib/v5/timeoutPolicy"],
              message:
                "v5/timeoutPolicy is superseded by @/lib/v4/asyncTransitionPolicy.",
            },
          ],
        },
      ],

    },
  },
  {
    // Allow legacy v3 modules to import from each other without triggering the
    // deprecation warning, and allow tests / migration scripts to reference them.
    files: [
      "src/lib/v3/**/*.{ts,tsx}",
      "src/lib/v5/timeoutPolicy.ts",
      "scripts/codemod-bff-v1.ts",
      "**/*.test.{ts,tsx}",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // 2026-06-03 — Management AI runtime path MUST go through Pantheon BFF,
    // never through Agora Ask compatibility paths.
    files: ["src/management/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/bff/agora", "@/lib/bff/agora.*"],
              message:
                "Management AI must not import Agora Ask client. Use @/lib/bff-v1/managementAi instead.",
            },
          ],
        },
      ],
    },
  },
);

