import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import gameBuildOutput from "./scripts/build-output"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    gameBuildOutput(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Shubhra Gautam — Security · Code · Diplomacy",
        short_name: "SG://terminal",
        description:
          "Cyber security enthusiast, developer, MUN enthusiast and chair — a secure-terminal portfolio with a playable 3D arcade cabinet.",
        theme_color: "#050a08",
        background_color: "#050a08",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // never serve HTML navigations from precache; network-first with a short cache
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
