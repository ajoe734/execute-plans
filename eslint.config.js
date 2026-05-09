import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
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
);
