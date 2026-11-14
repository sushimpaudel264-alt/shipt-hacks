import type { MetadataRoute } from "next";

// Lets students install Codelingo to their home screen and open it offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Codelingo",
    short_name: "Codelingo",
    description: "Learn coding, math and science anywhere, even offline.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#1f8a4c",
    icons: [
      { src: "/logo-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
