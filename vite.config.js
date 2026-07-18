import { defineConfig } from "vite";
import { resolve } from "node:path";

const siteUrl = (process.env.SITE_URL || "https://el-mezaen-talkha.vercel.app").replace(/\/$/, "");
const siteOrigin = new URL(siteUrl).origin;

export default defineConfig({
  plugins: [{
    name: "seo-site-url",
    transformIndexHtml(html) {
      return html.replaceAll("__SITE_URL__", siteUrl).replaceAll("__SITE_ORIGIN__", siteOrigin);
    }
  }],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
        login: resolve(import.meta.dirname, "login/index.html")
        ,services: resolve(import.meta.dirname, "services/index.html")
        ,team: resolve(import.meta.dirname, "team/index.html")
        ,branchTalkha: resolve(import.meta.dirname, "branches/talkha/index.html")
        ,branchMashaya: resolve(import.meta.dirname, "branches/mashaya/index.html")
      }
    }
  },
  server: { port: 4173, strictPort: true }
});
