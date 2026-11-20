
export const THEME_KEY = "sa-theme";

export type ThemeChoice = "light" | "dark" | "system";

export type ResolvedTheme = "light" | "dark";

export function readThemeChoice(raw: string | null): ThemeChoice {
  if (raw === "light" || raw === "dark") return raw;
  return "system";
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

export const themeBoot = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var dark=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;if(dark)root.dataset.theme="dark";else delete root.dataset.theme;}catch(e){}})();`;

export function applyTheme(mode: ResolvedTheme): void {
  const root = document.documentElement;
  if (mode === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}
