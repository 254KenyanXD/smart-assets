import type { MetadataRoute } from "next";

/**
 * Install metadata. The icons are rasters of the Custody mark Harris picked.
 * The colours are the bright ground, because a cold visit is bright.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "University Smart-Assets",
    short_name: "Smart-Assets",
    description: "Sign in with your university email.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F1F4EF",
    theme_color: "#F1F4EF",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
