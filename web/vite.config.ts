import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: proxy /api to FastAPI on :8000 so the SPA and API share an origin.
// Prod: FastAPI serves the built dist, so same-origin automatically.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
