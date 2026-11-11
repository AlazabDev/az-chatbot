import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
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
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Legacy Supabase Edge handlers run under Deno and are not part of tsconfig's
    // React app. Keep existing explicit-any technical debt visible as warnings
    // instead of disabling linting across the repository.
    files: ["supabase/functions/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
  {
    // Generated Radix/shadcn UI exports both components and reusable helpers.
    files: ["src/components/ui/**/*.{ts,tsx}", "src/contexts/auth-context.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
