import tseslint from "typescript-eslint";
import mutationMustHandleError from "./eslint-rules/mutation-must-handle-error.js";
import sheetMustHaveErrorHandler from "./eslint-rules/sheet-must-have-error-handler.js";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    linterOptions: {
      // Don't report errors for eslint-disable comments referencing unknown rules
      // (e.g. react-hooks/exhaustive-deps from existing comments)
      reportUnusedDisableDirectives: "off",
    },
    plugins: {
      "nexqa-custom": {
        rules: {
          "mutation-must-handle-error": mutationMustHandleError,
          "sheet-must-have-error-handler": sheetMustHaveErrorHandler,
        },
      },
    },
    rules: {
      "nexqa-custom/mutation-must-handle-error": "warn",
      "nexqa-custom/sheet-must-have-error-handler": "warn",
    },
  },
];
