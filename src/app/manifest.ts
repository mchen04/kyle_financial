import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kyle Financial — Yearly Plan",
    short_name: "Kyle Financial",
    description:
      "Plan salary, taxes, benefits, expenses, and what remains each month.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7fafc",
    theme_color: "#f7fafc",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
