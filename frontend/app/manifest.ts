import type { MetadataRoute } from "next";

// Makes Codelingo installable (home screen / desktop app) and opens it like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Codelingo",
    short_name: "Codelingo",
    description: "Learn coding, math and science anywhere, even offline. Includes coding games.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#110f1d",
    theme_color: "#6c4ed9",
    categories: ["education", "kids", "games"],
    icons: [
      { src: "/logo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/logo-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Courses", url: "/#/", icons: [{ src: "/logo-96.png", sizes: "96x96" }] },
      { name: "Arcade", url: "/#/arcade", icons: [{ src: "/logo-96.png", sizes: "96x96" }] },
      { name: "Offline Center", url: "/#/offline", icons: [{ src: "/logo-96.png", sizes: "96x96" }] },
    ],
  };
}
