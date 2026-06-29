import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The frontend lives in ./web and builds to ./dist, which the Worker serves
// via the static-assets binding. `npm run dev:web` runs the Vite dev server and
// proxies /api to a `wrangler dev` instance on :8787.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
