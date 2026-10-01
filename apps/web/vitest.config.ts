import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the React Router plugin isn't meant to run under Vitest.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    env: { API_URL: "http://api.test", INTERNAL_API_KEY: "test-internal-key-123" },
  },
});
