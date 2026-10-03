// @ts-check
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const prettier = require("eslint-config-prettier");

/**
 * Shared base ESLint config. Each app/package extends this and layers its
 * own framework-specific plugins (next/core-web-vitals, react-native, etc.)
 * on top rather than this package trying to anticipate every consumer.
 */
module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/*.config.js",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
);
