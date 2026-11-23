import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Endurance Circle",
    short_name: "Endurance",
    description: "A private circle for building daily habits together.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef2ff",
    theme_color: "#4f46e5",
    lang: "en",
    categories: ["health", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Today", short_name: "Today", url: "/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] }],
  };
}
