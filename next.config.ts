import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A host left off this list receives HTML and no /_next assets, so the page never hydrates.
  allowedDevOrigins: ["sa-app.dsvv6snvrwop.opentunnel.xyz"],
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
