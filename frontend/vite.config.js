import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  plugins: [react()],
  cacheDir: resolve(tmpdir(), "certificate-information-extractor-vite-cache"),
  envDir: projectRoot,
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
