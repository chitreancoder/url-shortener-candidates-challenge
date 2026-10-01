import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ isSsrBuild }) => ({
  envDir: "../..",
  // The production server build bundles the Express app (server/app.ts) around the router.
  build: isSsrBuild ? { rollupOptions: { input: "./server/app.ts" } } : undefined,
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  ssr: {
    // libs/api ships TypeScript source, so Node can't import it from node_modules at runtime.
    noExternal: ["@url-shortener/api"],
  },
}));
