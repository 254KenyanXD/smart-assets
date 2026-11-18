import { describe, expect, test } from "bun:test";

import { readThemeChoice, resolveTheme, themeBoot } from "@/lib/theme";

describe("theme choice", () => {
  test("an empty store follows the computer", () => {
    expect(readThemeChoice(null)).toBe("system");
    expect(readThemeChoice("")).toBe("system");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  test("a stored light or dark choice wins over the computer", () => {
    expect(readThemeChoice("light")).toBe("light");
    expect(readThemeChoice("dark")).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("the boot script follows the computer until a choice is stored", () => {
    expect(boot(null, true)).toBe("dark");
    expect(boot(null, false)).toBe("light");
    expect(boot("dark", false)).toBe("dark");
    expect(boot("light", true)).toBe("light");
    expect(boot("other", true)).toBe("dark");
  });
});

function boot(saved: string | null, systemDark: boolean): "light" | "dark" {
  const document = {
    documentElement: { dataset: {} as { theme?: string } },
  };
  const localStorage = { getItem: () => saved };
  const window = { matchMedia: () => ({ matches: systemDark }) };
  const run = new Function("document", "localStorage", "window", themeBoot);
  run(document, localStorage, window);
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
