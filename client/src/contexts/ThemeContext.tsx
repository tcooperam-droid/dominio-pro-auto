import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

// ── Converte hex (#rrggbb) para oklch e aplica no CSS ──────────────────────
function hexToOklch(hex: string): string | null {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  // hex → linear sRGB
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(parseInt(m[1], 16));
  const g = toLinear(parseInt(m[2], 16));
  const b = toLinear(parseInt(m[3], 16));
  // linear sRGB → OKLab
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const a_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const b_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lc = Math.cbrt(l), ac = Math.cbrt(a_), bc = Math.cbrt(b_);
  const L = Math.max(0, 0.2104542553 * lc + 0.7936177850 * ac - 0.0040720468 * bc);
  const A = 1.9779984951 * lc - 2.4285922050 * ac + 0.4505937099 * bc;
  const B = 0.0259040371 * lc + 0.7827717662 * ac - 0.8086757660 * bc;
  const C = Math.sqrt(A * A + B * B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

export function applyAccentColor(hex: string) {
  const oklch = hexToOklch(hex);
  if (!oklch) return;
  const root = document.documentElement;
  root.style.setProperty("--primary", oklch);
  root.style.setProperty("--sidebar-primary", oklch);
  root.style.setProperty("--ring", oklch);
  root.style.setProperty("--chart-1", oklch);
}

function loadAndApplyAccentColor() {
  try {
    const saved = localStorage.getItem("salon_config");
    if (saved) {
      const { accentColor } = JSON.parse(saved);
      if (accentColor) applyAccentColor(accentColor);
    }
  } catch { /* ignore */ }
}
// ───────────────────────────────────────────────────────────────────────────

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  // Aplica cor de destaque salva ao montar
  useEffect(() => {
    loadAndApplyAccentColor();
    const onUpdate = () => loadAndApplyAccentColor();
    window.addEventListener("salon_config_updated", onUpdate);
    return () => window.removeEventListener("salon_config_updated", onUpdate);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
