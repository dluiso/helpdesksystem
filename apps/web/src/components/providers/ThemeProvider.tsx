"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark" | "oled" | "system";

const THEME_STORAGE_KEY = "avidity.theme";

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => undefined
});

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "oled" || value === "system";
}

function resolvedTheme(theme: ThemePreference) {
  if (theme !== "system") {
    return theme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemePreference) {
  document.documentElement.dataset.themePreference = theme;
  document.documentElement.dataset.theme = resolvedTheme(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextTheme = isThemePreference(savedTheme) ? savedTheme : "system";
    setThemeState(nextTheme);
    applyTheme(nextTheme);
  }, []);

  useEffect(() => {
    if (theme !== "system") {
      applyTheme(theme);
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme("system");
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  function setTheme(nextTheme: ThemePreference) {
    setThemeState(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeScript() {
  const script = `
    (function () {
      try {
        var saved = window.localStorage.getItem("${THEME_STORAGE_KEY}");
        var preference = saved === "light" || saved === "dark" || saved === "oled" || saved === "system" ? saved : "system";
        var resolved = preference === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
        document.documentElement.dataset.themePreference = preference;
        document.documentElement.dataset.theme = resolved;
      } catch (error) {
        document.documentElement.dataset.themePreference = "system";
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function useTheme() {
  return useContext(ThemeContext);
}
