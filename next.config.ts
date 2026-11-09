import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server blocks /_next from any host other than localhost.
  // Harris opens the app through this tunnel, so the host has to be listed or the page never hydrates.
  allowedDevOrigins: ["sa-app.dsvv6snvrwop.opentunnel.xyz"],
  experimental: {
    // `forbidden()` is how /admin returns HTTP 403. Next still gates that on this flag.
    authInterrupts: true,
  },
};

export default nextConfig;
