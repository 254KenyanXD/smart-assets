"use client";

import { useEffect, useState } from "react";

import { applyTheme, readThemeChoice, resolveTheme, THEME_KEY, type ResolvedTheme } from "@/lib/theme";

export function ThemeToggle() {
  const [mode, setMode] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setMode(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    const followSystem = () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(THEME_KEY);
      } catch {
        raw = null;
      }
      if (readThemeChoice(raw) !== "system") return;
      applyTheme(resolveTheme("system", media.matches));
      sync();
    };
    sync();
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  const dark = mode === "dark";
  return (
    <button
      id="sa-theme"
      type="button"
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink3 hover:bg-alt hover:text-ink"
      onClick={() => {
        const next: ResolvedTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
        }
        applyTheme(next);
        setMode(next);
      }}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function ThemeCorner() {
  return (
    <div className="fixed top-3 right-3 z-20">
      <ThemeToggle />
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10.2 2.2a5.2 5.2 0 1 0 3.6 8.8 4.4 4.4 0 0 1-3.6-8.8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
