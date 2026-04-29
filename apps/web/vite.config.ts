import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/health": "http://localhost:8787",
      "/api": "http://localhost:8787",
      "/artifacts": "http://localhost:8787"
    }
  }
});
