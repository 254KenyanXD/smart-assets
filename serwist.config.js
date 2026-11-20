import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { serwist } from "@serwist/next/config";

function offlineRevision() {
  const candidates = [".next/server/app/offline.html", "src/app/offline/page.tsx"];
  const found = candidates.find((path) => existsSync(path));
  if (found === undefined) return "offline-shell";
  return createHash("sha256").update(readFileSync(found)).digest("hex").slice(0, 20);
}

// A precached /home or /desk would open for the next person on a shared phone.
export default serwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  precachePrerendered: false,
  additionalPrecacheEntries: [{ url: "/offline", revision: offlineRevision() }],
  globIgnores: ["**/*.map", "public/staff-template.csv"],
});
