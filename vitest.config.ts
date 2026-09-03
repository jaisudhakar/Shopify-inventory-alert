import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The suites cover pure server logic, so there is no DOM to set up.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
