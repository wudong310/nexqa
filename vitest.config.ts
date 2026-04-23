import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    exclude: [
      "**/e2e/**",
      "**/dist/**",
      "**/node_modules/**",
    ],
  },
});
