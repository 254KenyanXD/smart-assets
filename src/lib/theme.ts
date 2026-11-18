/** Stored theme. Missing or unknown means follow the computer. */
export const THEME_KEY = "sa-theme";

export type ThemeChoice = "light" | "dark" | "system";

export type ResolvedTheme = "light" | "dark";

/**
 * Reads a stored choice. Anything other than the two explicit values follows the computer.
 *
 * @param raw - Value from localStorage, or null when nothing is stored.
 */
export function readThemeChoice(raw: string | null): ThemeChoice {
  if (raw === "light" || raw === "dark") return raw;
  return "system";
}

/**
 * Resolves the theme that should be on the document.
 *
 * @param choice - Stored choice, or system.
 * @param systemDark - Whether the computer currently asks for a dark theme.
 */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

/**
 * Runs before paint. An explicit `sa-theme` wins. Otherwise the computer theme is used.
 * The script is a string so the root layout can inline it without waiting for React.
 */
export const themeBoot = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var dark=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;if(dark)root.dataset.theme="dark";else delete root.dataset.theme;}catch(e){}})();`;

/**
 * Applies a resolved theme. Does not write storage.
 *
 * @param mode - Light or dark.
 */
export function applyTheme(mode: ResolvedTheme): void {
  const root = document.documentElement;
  if (mode === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}
