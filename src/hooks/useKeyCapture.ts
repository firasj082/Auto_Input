import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { browserKeyToDisplayName } from "../components/HotkeyField";

/**
 * Captures keyboard input as a multi-key combo.
 *
 * Instead of firing on the first keydown, it accumulates all held keys
 * and only reports the full combo (e.g. "Space + W + K") once every key
 * has been released.
 *
 * - Escape immediately cancels capture, reporting "Escape" regardless of
 *   other held keys.
 * - Window blur (alt-tab, click away) also cancels to avoid stuck state.
 */
export function useKeyCapture(onCapture: (keyName: string) => void, active: boolean) {
  // Refs so the event handlers always see latest values without re-binding
  const heldKeysRef = useRef<Set<string>>(new Set());
  const comboOrderRef = useRef<string[]>([]);

  useEffect(() => {
    if (!active) return;

    // Reset state on activation
    heldKeysRef.current.clear();
    comboOrderRef.current = [];

    // Temporarily disable global hotkeys so they don't intercept keys like F9/F10
    invoke("unregister_global_hotkeys").catch(console.error);

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keyName = browserKeyToDisplayName(e);
      if (!keyName) return;

      // Escape immediately cancels — report it and bail
      if (keyName === "Escape") {
        heldKeysRef.current.clear();
        comboOrderRef.current = [];
        onCapture("Escape");
        return;
      }

      // Track unique held keys, preserving insertion order for display
      if (!heldKeysRef.current.has(keyName)) {
        heldKeysRef.current.add(keyName);
        comboOrderRef.current.push(keyName);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keyName = browserKeyToDisplayName(e);
      if (!keyName) return;

      heldKeysRef.current.delete(keyName);

      // Once all keys are released, fire the combo
      if (heldKeysRef.current.size === 0 && comboOrderRef.current.length > 0) {
        const combo = comboOrderRef.current.join(" + ");
        comboOrderRef.current = [];
        onCapture(combo);
      }
    };

    // If the window loses focus while keys are held, cancel to avoid stuck state
    const handleBlur = () => {
      heldKeysRef.current.clear();
      comboOrderRef.current = [];
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      heldKeysRef.current.clear();
      comboOrderRef.current = [];
      // Re-enable global hotkeys when leaving capture mode
      invoke("reregister_global_hotkeys").catch(console.error);
    };
  }, [active, onCapture]);
}
