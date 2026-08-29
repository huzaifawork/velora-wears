import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Lint rules for the whole application.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS AT THE REPOSITORY ROOT
 * ---------------------------------------------------------------------------
 * It used to live in `storefront/`, which was correct while the admin dashboard
 * was a second application with a config of its own. They are one application
 * now — `admin/src` compiles into the storefront build so that both halves can
 * share one sign-in — and an ESLint flat config cannot lint files outside its
 * own directory. One application, one config, one `npm run lint`.
 *
 * Beyond the standard TypeScript and React Hooks rules, it enforces the project
 * conventions that are easy to break by accident (requirements section 18):
 *
 *  1. Components and pages must never import `lib/demoData` — they go through
 *     `lib/queries.ts`, which is what keeps the switch to the live database a
 *     one-file change.
 *  2. **Nothing that bypasses row level security may appear anywhere in this
 *     bundle** — the dashboard included. It is a browser application with
 *     exactly the same constraint as the shop: the service role key belongs in
 *     an Edge Function and nowhere else (`developerb.md` §4).
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      /*
       * `supabase/functions/` is DENO, not this application.
       *
       * It is deployed by the Supabase CLI, has no package.json, imports by
       * URL, and — the reason it must be excluded rather than merely skipped —
       * it is the ONE place in this repository that legitimately holds the
       * service role key. That is the whole point of an Edge Function: trusted
       * server-side code, running where a browser cannot read it. The rule
       * below that bans the key exists to keep it out of the BUNDLE, and
       * pointing it at the server code it belongs in would be exactly backwards.
       */
      "supabase/**",
    ],
  },
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
      /*
       * A handful of modules deliberately export a value beside their
       * component, so the value cannot drift from the component that owns it:
       * `buttonClasses` styles a `Link` identically to a `Button`, `move`
       * belongs with the control that calls it, and the label maps belong with
       * the badges that render them (requirements section 18 — one definition,
       * reused). Naming them keeps fast refresh working and keeps the rule
       * meaningful for everything else.
       */
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            "buttonClasses",
            "navGroups",
            "move",
            "useToast",
            "ORDER_STATUS_LABELS",
            "UPLOAD_STAGE_LABEL",
          ],
        },
      ],
      /*
       * The service role key bypasses row level security entirely, and a
       * browser bundle is readable by anyone who opens the network tab. This is
       * the check that keeps it out — of the dashboard as much as the shop.
       */
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/SUPABASE_SERVICE_ROLE|service_role|serviceRoleKey/]",
          message:
            "The service role key bypasses row level security and must never reach a browser bundle. Use the authenticated client; every admin policy is gated on is_admin().",
        },
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
    files: ["storefront/src/lib/sources/demoSource.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    /*
     * `shared/sanitize.ts` matches control characters ON PURPOSE — stripping
     * them is the entire job of the file (requirements section 17). The rule
     * that flags them is a good default and simply does not apply to the one
     * module whose reason for existing is to remove them.
     *
     * Note that the file writes every one of them as an escape sequence and
     * builds the pattern with `new RegExp`, so its own source contains no
     * control characters — which is what makes suppressing this safe rather
     * than a way to hide something.
     */
    files: ["shared/sanitize.ts"],
    rules: { "no-control-regex": "off" },
  },
);
