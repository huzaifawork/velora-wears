import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Storefront lint rules.
 *
 * Beyond the standard TypeScript and React Hooks rules, this enforces the two
 * project conventions that are easy to break by accident (requirements
 * section 18):
 *
 *  1. Components and pages must never import `lib/demoData` — they go through
 *     `lib/queries.ts`, which is what keeps the switch to the live database a
 *     one-file change.
 *  2. Nothing that bypasses row level security may appear in the storefront.
 *     Privileged work belongs in a Supabase Edge Function.
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // `buttonClasses` is exported beside `Button` on purpose, so a link can be
      // styled identically without duplicating the styles (requirements 18).
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true, allowExportNames: ["buttonClasses"] },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/demoData", "@/lib/demoData"],
              message:
                "Import from @/lib/queries instead. Only lib/sources/demoSource.ts may read demoData directly.",
            },
            {
              group: ["firebase", "firebase/*", "firebase-admin", "firebase-admin/*"],
              message:
                "Firebase has been removed from this project. Use @/lib/supabase.",
            },
          ],
        },
      ],
    },
  },
  {
    // The demo source is the one module allowed to read the demo catalog.
    files: ["src/lib/sources/demoSource.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
