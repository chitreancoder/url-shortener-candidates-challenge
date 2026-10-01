import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  platform: "node",
  format: "esm",
  fixedExtension: false,
  // Workspace libs ship TypeScript source (incl. the generated Prisma client), so they
  // must be bundled; real npm deps stay external and load from node_modules.
  deps: { alwaysBundle: [/^@url-shortener\//] },
});
