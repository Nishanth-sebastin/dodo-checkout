import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@sdk": fileURLToPath(new URL("../../packages/sdk/src", import.meta.url)) },
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  test: { environment: "node" },
});
