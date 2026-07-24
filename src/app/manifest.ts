import type { MetadataRoute } from "next";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/domain/brand";
import { PWA_BACKGROUND_COLOR } from "@/domain/ui-tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PRODUCT_NAME} — Daily Money Cockpit`,
    short_name: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_BACKGROUND_COLOR,
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
