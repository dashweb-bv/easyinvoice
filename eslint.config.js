// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "examples/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware rules need the built declarations in dist/, so run `pnpm run build` first.
        project: ["./tsconfig.json", "./tsconfig.check.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      // `import x = require()` is the CommonJS import form for the .cts entry point.
      "@typescript-eslint/no-require-imports": [
        "error",
        { allowAsImport: true },
      ],
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              name: ["test", "describe", "it"],
              package: "node:test",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["test/**", "scripts/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      // Mocks are declared async to return promises without awaiting anything.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
