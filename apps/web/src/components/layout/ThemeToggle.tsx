"use client";

import { Laptop, Moon, MoonStar, Sun } from "lucide-react";
import { ThemePreference, useTheme } from "@/components/providers/ThemeProvider";

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "oled", label: "OLED Dark", icon: MoonStar },
  { value: "system", label: "System", icon: Laptop }
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const currentIndex = themeOptions.findIndex((option) => option.value === theme);
  const current = themeOptions[currentIndex] ?? themeOptions[2];
  const Icon = current.icon;

  function cycleTheme() {
    const next = themeOptions[(currentIndex + 1) % themeOptions.length] ?? themeOptions[0];
    setTheme(next.value);
  }

  return (
    <button className="theme-toggle" type="button" onClick={cycleTheme} title={`Theme: ${current.label}`} aria-label={`Theme: ${current.label}`}>
      <Icon size={16} aria-hidden="true" />
      <span>{current.label}</span>
    </button>
  );
}
