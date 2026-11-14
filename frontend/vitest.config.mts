import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // Next resolves "server-only" itself; outside Next it's just a marker, so stub it.
      "server-only": `${root}tests/stubs/server-only.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { MOCK_AI: "true", MOCK_AI_DELAY_MS: "0" },
  },
});
