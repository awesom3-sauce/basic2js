// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "web/src/**/*.ts", "web/src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Every AST-node `switch` must end in an `assertNever` default case —
      // see CLAUDE.md's exhaustiveness-checking convention. This rule is a
      // reminder, not a substitute for that pattern.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The compiler core, CLI, and test helpers run under Node.
    files: ["src/**/*.ts", "tests/**/*.ts", "*.config.ts", "*.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // The web UI runs in the browser.
    files: ["web/src/**/*.ts", "web/src/**/*.tsx"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "web/dist/**", "web/node_modules/**"],
  },
  prettier,
];
