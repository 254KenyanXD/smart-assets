import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { documentFallsBack, networkOnlyRuntime, OFFLINE_PATH, shellCache } from "@/domain/install-shell";
import manifest from "@/app/manifest";

describe("installable shell", () => {
  test("documents and private reads stay on the network, and the built shell is the only precache", () => {
    expect(OFFLINE_PATH).toBe("/offline");
    expect(shellCache("/_next/static/chunks/app.js")).toBe("precache");
    expect(shellCache("/brand/custody-bright.svg")).toBe("precache");
    expect(shellCache("/icons/icon-192.png")).toBe("precache");
    expect(shellCache("/home")).toBe("network-only");
    expect(shellCache("/desk")).toBe("network-only");
    expect(shellCache("/school/reports")).toBe("network-only");
    expect(shellCache("/api/auth/sign-in/email")).toBe("network-only");
    expect(shellCache("/reports/inventory")).toBe("network-only");
    expect(shellCache(OFFLINE_PATH)).toBe("network-only");

    expect(
      networkOnlyRuntime({ method: "GET", sameOrigin: true, pathname: "/home" }),
    ).toBe(true);
    expect(
      networkOnlyRuntime({ method: "GET", sameOrigin: true, pathname: "/reports/depreciation" }),
    ).toBe(true);
    expect(
      networkOnlyRuntime({ method: "GET", sameOrigin: true, pathname: "/_next/static/media/font.woff2" }),
    ).toBe(false);
    expect(
      networkOnlyRuntime({ method: "POST", sameOrigin: true, pathname: "/desk" }),
    ).toBe(false);
    expect(
      networkOnlyRuntime({ method: "GET", sameOrigin: false, pathname: "/home" }),
    ).toBe(false);

    expect(documentFallsBack("document")).toBe(true);
    expect(documentFallsBack("image")).toBe(false);
    expect(documentFallsBack("script")).toBe(false);
  });

  test("the manifest names the product and points at the Custody rasters", () => {
    const file = manifest();
    expect(file.name).toBe("University Smart-Assets");
    expect(file.short_name).toBe("Smart-Assets");
    expect(file.display).toBe("standalone");
    expect(file.start_url).toBe("/");
    expect(file.background_color).toBe("#F1F4EF");
    expect(file.theme_color).toBe("#F1F4EF");
    const icons = file.icons ?? [];
    expect(icons.map((icon) => icon.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
    ]);
    for (const icon of icons) {
      const bytes = readFileSync(`public${icon.src}`);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.byteLength).toBeGreaterThan(500);
    }
  });
});
