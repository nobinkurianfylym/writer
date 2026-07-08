import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { base } from "./base.mjs";

export const reactConfig = tseslint.config(...base, {
  files: ["**/*.{ts,tsx}"],
  plugins: {
    react,
    "react-hooks": reactHooks,
  },
  languageOptions: {
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
  rules: {
    ...react.configs.recommended.rules,
    ...reactHooks.configs.recommended.rules,
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "react/no-unknown-property": ["error", { ignore: ["cmdk-input-wrapper"] }],
  },
  settings: {
    react: { version: "detect" },
  },
});

export default reactConfig;
