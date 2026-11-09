"use client";

import { useEffect, useState } from "react";

/**
 * Visit-scoped theme switch. The key is `sa-theme` in sessionStorage.
 * A missing key leaves the page bright.
 */
export function ThemeToggle() {
  const [label, setLabel] = useState("Theme");

  useEffect(() => {
    setLabel(document.documentElement.dataset.theme === "dark" ? "Bright mode" : "Dark mode");
  }, []);

  return (
    <button
      id="sa-theme"
      type="button"
      className="rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink2"
      onClick={() => {
        const dark = document.documentElement.dataset.theme === "dark";
        if (dark) {
          delete document.documentElement.dataset.theme;
          sessionStorage.setItem("sa-theme", "light");
          setLabel("Dark mode");
          return;
        }
        document.documentElement.dataset.theme = "dark";
        sessionStorage.setItem("sa-theme", "dark");
        setLabel("Bright mode");
      }}
    >
      {label}
    </button>
  );
}
