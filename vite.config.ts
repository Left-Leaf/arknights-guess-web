import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/arknights-guess-web/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
  },
});
