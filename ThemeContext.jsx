import React, { createContext, useContext, useEffect, useState } from "react";

export const PALETTES = {
  dark: {
    bg: "#0A0D0C",
    panel: "#121815",
    border: "rgba(255,255,255,0.10)",
    text: "#FFFFFF",
    textDim: "rgba(255,255,255,0.5)",
    textFaint: "rgba(255,255,255,0.3)",
    accent: "#C9FF3D",
  },
  light: {
    bg: "#F5F6F3",
    panel: "#FFFFFF",
    border: "rgba(10,13,12,0.10)",
    text: "#0A0D0C",
    textDim: "rgba(10,13,12,0.55)",
    textFaint: "rgba(10,13,12,0.35)",
    accent: "#7FB80E", // slightly deeper lime so it still reads on white
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem("lmw_theme") || "dark");

  useEffect(() => {
    localStorage.setItem("lmw_theme", mode);
    document.documentElement.classList.toggle("dark", mode === "dark");
    document.body.style.background = PALETTES[mode].bg;
  }, [mode]);

  const toggle = () => setMode((m) => (m === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ mode, setMode, toggle, palette: PALETTES[mode] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
