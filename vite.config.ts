import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

function hashFile(path: string): string {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex")
    .slice(0, 12);
}

const dataVersion =
  hashFile("public/data/papers.json") +
  "-" +
  hashFile("public/data/embeddings.json");

export default defineConfig({
  base: "/",
  plugins: [
    vue(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon.svg"],
      manifest: {
        name: "Conference Navigator",
        short_name: "ConfNav",
        description: "Browse, filter, and plan your ICLR 2026 schedule.",
        theme_color: "#fbfaf7",
        background_color: "#fbfaf7",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512x512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "/screenshots/desktop.png",
            sizes: "3158x2308",
            type: "image/png",
            form_factor: "wide",
            label: "Explore papers on desktop",
          },
          {
            src: "/screenshots/mobile.png",
            sizes: "1206x2622",
            type: "image/png",
            form_factor: "narrow",
            label: "Explore papers on mobile",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        ignoreURLParametersMatching: [/^v$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/data/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "cn-data-v1",
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __DATA_VERSION__: JSON.stringify(dataVersion),
  },
});
