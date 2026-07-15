import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Theme, AppSettings, ThemeColors } from "../types/sequence";

/** Lightens a hex color by a specified percentage. */
export function lightenHexColor(hex: string, percent: number): string {
  try {
    let cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map((c) => c + c).join("");
    }
    const num = parseInt(cleanHex, 16);
    const amt = Math.round(2.55 * percent);
    let R = (num >> 16) + amt;
    let G = ((num >> 8) & 0x00FF) + amt;
    let B = (num & 0x0000FF) + amt;

    R = Math.max(0, Math.min(255, R));
    G = Math.max(0, Math.min(255, G));
    B = Math.max(0, Math.min(255, B));

    return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
  } catch (e) {
    return hex;
  }
}

/** Calculates high-contrast text color (black or white) based on luminance. */
export function getContrastColor(hex: string): string {
  try {
    let cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map((c) => c + c).join("");
    }
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    // Relative luminance threshold YIQ formula
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "#000000" : "#ffffff";
  } catch (e) {
    return "#ffffff";
  }
}

/** Applies theme colors dynamically to the document root element. */
export function applyThemeToDOM(colors: ThemeColors) {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, val]) => {
    // Convert camelCase key to CSS custom property format (e.g. bgApp -> --bg-app)
    const cssKey = `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    root.style.setProperty(cssKey, val);
  });
  // Calculate and set high-contrast text color on top of the accent color
  root.style.setProperty("--accent-text", getContrastColor(colors.accent));
}

/**
 * useTheme hook handles theme list retrieval, active settings load,
 * dynamic theme switcher, custom theme creator, and local storage caching.
 */
export function useTheme() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string>("default");
  const [recordDragMotion, setRecordDragMotionState] = useState<boolean>(true);

  const loadThemeSettings = async () => {
    try {
      const allThemes = await invoke<Theme[]>("list_themes");
      setThemes(allThemes);

      const settings = await invoke<AppSettings>("get_theme_settings");
      setActiveThemeId(settings.activeThemeId);
      setRecordDragMotionState(settings.recordDragMotion);

      // Find active theme colors
      const active = allThemes.find((t) => t.id === settings.activeThemeId) || allThemes[0];
      if (active) {
        applyThemeToDOM(active.colors);
        // Cache reconciliation (self-healing)
        localStorage.setItem("active-theme-colors", JSON.stringify({
          ...active.colors,
          accentText: getContrastColor(active.colors.accent)
        }));
        localStorage.setItem("active-theme-id", active.id);
      }
    } catch (err) {
      console.error("Failed to load theme settings:", err);
    }
  };

  useEffect(() => {
    loadThemeSettings();
  }, []);

  const selectTheme = async (id: string) => {
    try {
      const active = themes.find((t) => t.id === id);
      if (!active) return;

      setActiveThemeId(id);
      applyThemeToDOM(active.colors);

      // Write settings to backend
      await invoke("save_theme_settings", {
        settings: { activeThemeId: id, recordDragMotion },
      });

      // Update cache
      localStorage.setItem("active-theme-colors", JSON.stringify({
        ...active.colors,
        accentText: getContrastColor(active.colors.accent)
      }));
      localStorage.setItem("active-theme-id", id);
    } catch (err) {
      console.error("Failed to select theme:", err);
    }
  };

  const setRecordDragMotion = async (enabled: boolean) => {
    try {
      setRecordDragMotionState(enabled);
      await invoke("save_theme_settings", {
        settings: { activeThemeId, recordDragMotion: enabled },
      });
    } catch (err) {
      console.error("Failed to save record settings:", err);
    }
  };

  const saveCustomTheme = async (name: string, configurableColors: Omit<ThemeColors, "accentHover" | "statusRecording" | "statusPlaying" | "statusWarning">) => {
    try {
      const id = "custom_" + name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + Math.random().toString(36).slice(2, 6);
      
      // Calculate derived colors
      const derivedColors: ThemeColors = {
        ...configurableColors,
        accentHover: lightenHexColor(configurableColors.accent, 15),
        statusRecording: "#ff5c5c",
        statusPlaying: "#4ade80",
        statusWarning: "#f59e0b",
      };

      const customTheme: Theme = {
        id,
        name,
        isBuiltIn: false,
        colors: derivedColors,
      };

      // Save to backend
      await invoke("save_custom_theme", { theme: customTheme });

      // Refresh themes list
      const allThemes = await invoke<Theme[]>("list_themes");
      setThemes(allThemes);

      // Automatically select the newly created theme
      await selectTheme(id);
    } catch (err) {
      console.error("Failed to save custom theme:", err);
      throw err;
    }
  };

  const deleteTheme = async (id: string) => {
    try {
      await invoke("delete_theme", { id });
      
      // If the deleted theme was active, fall back active state to "default"
      if (activeThemeId === id) {
        setActiveThemeId("default");
        const defaultTheme = themes.find((t) => t.id === "default");
        if (defaultTheme) {
          applyThemeToDOM(defaultTheme.colors);
          localStorage.setItem("active-theme-colors", JSON.stringify({
            ...defaultTheme.colors,
            accentText: getContrastColor(defaultTheme.colors.accent)
          }));
          localStorage.setItem("active-theme-id", "default");
        }
        await invoke("save_theme_settings", {
          settings: { activeThemeId: "default", recordDragMotion },
        });
      }

      // Refresh themes list
      const allThemes = await invoke<Theme[]>("list_themes");
      setThemes(allThemes);
    } catch (err) {
      console.error("Failed to delete theme:", err);
    }
  };

  return {
    themes,
    activeThemeId,
    recordDragMotion,
    selectTheme,
    setRecordDragMotion,
    saveCustomTheme,
    deleteTheme,
  };
}
