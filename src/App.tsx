import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSequence } from "./hooks/useSequence";
import { useTheme } from "./hooks/useTheme";
import { HotkeyField } from "./components/HotkeyField";
import { PrimaryActionButton } from "./components/PrimaryActionButton";
import { ActionsList } from "./components/ActionsList";
import { LoopControl } from "./components/LoopControl";
import { AddActionModal } from "./components/AddActionModal";
import { ConflictWarningModal } from "./components/ConflictWarningModal";
import { SaveLoadoutModal } from "./components/SaveLoadoutModal";
import { LoadoutTab } from "./components/LoadoutTab";
import { SettingsTab } from "./components/SettingsTab";
import { SideRail } from "./components/SideRail";
import type { Loadout } from "./types/sequence";

/**
 * Main application component.
 * Context-aware: renders transparent recording overlay if overlay query param is present,
 * otherwise renders the premium desktop editor dashboard.
 */
export default function App() {
  const {
    items,
    repeat,
    hotkeys,
    isRecording,
    isPlaying,
    isListening,
    addItem,
    removeItem,
    updateItem,
    reorderItems,
    setRepeat,
    setHotkeys,
    startRecording,
    stopRecording,
    startPlayback,
    stopPlayback,
    listenForHotkey,
    cancelListenForHotkey,
    saveProfile,
    importProfile,
  } = useSequence();

  const { themes, activeThemeId, recordDragMotion, whenClosed, selectTheme, setRecordDragMotion, setWhenClosed, saveCustomTheme, deleteTheme } = useTheme();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaveLoadoutOpen, setIsSaveLoadoutOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [overlayTimer, setOverlayTimer] = useState("00:00");
  const [activeTab, setActiveTab] = useState<"timeline" | "loadout" | "settings">("timeline");

  const prevHotkeysRef = useRef(hotkeys);

  // Determine if we are rendering in overlay mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("overlay") === "true") {
      setIsOverlayMode(true);
      document.body.style.background = "transparent";
      document.body.style.backgroundColor = "transparent";
      document.documentElement.style.background = "transparent";
      document.documentElement.style.backgroundColor = "transparent";
    }
  }, []);

  // Timer interval for the visual recording overlay.
  // Overlay windows are reused (hidden/shown), so we listen for the
  // backend's 'reset-timer' event to restart the counter each session.
  useEffect(() => {
    if (!isOverlayMode) return;

    let startedAt = Date.now();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      setOverlayTimer(`${mm}:${ss}`);
    };

    tick(); // show 00:00 immediately
    const interval = setInterval(tick, 1000);

    let unlisten: (() => void) | null = null;
    listen("reset-timer", () => {
      startedAt = Date.now();
      setOverlayTimer("00:00");
    }).then((fn) => { unlisten = fn; });

    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
    };
  }, [isOverlayMode]);

  // Check conflicts after hotkeys update
  useEffect(() => {
    // Only proceed if hotkeys actually changed to prevent saving loops
    if (
      prevHotkeysRef.current.recordToggle === hotkeys.recordToggle &&
      prevHotkeysRef.current.startSequence === hotkeys.startSequence
    ) {
      return;
    }

    prevHotkeysRef.current = hotkeys;

    // Check if both hotkeys are bound to the same key
    if (
      hotkeys.recordToggle &&
      hotkeys.startSequence &&
      hotkeys.recordToggle.toLowerCase() === hotkeys.startSequence.toLowerCase()
    ) {
      setConflictMessage(
        `Record Hotkey and Start Hotkey cannot share the same binding ("${hotkeys.recordToggle}"). Reverting bindings.`
      );
      // Revert conflicts back to defaults
      setHotkeys({
        recordToggle: "F9",
        startSequence: "F10",
      });
    } else {
      // Auto-save settings on change
      saveProfile();
    }
  }, [hotkeys, setHotkeys, saveProfile]);

  // Save profile when items or repeat configuration changes
  useEffect(() => {
    saveProfile();
  }, [items, repeat, saveProfile]);

  const handleSaveLoadout = async (name: string, description: string) => {
    try {
      const loadout: Loadout = {
        id: crypto.randomUUID(),
        name,
        description,
        sequence: { repeat, items },
        version: 1,
        lastUsedAt: 0,
        lastUpdatedAt: 0,
      };
      await invoke("save_loadout", { loadout });
      setIsSaveLoadoutOpen(false);
    } catch (err) {
      console.error("Failed to save loadout:", err);
    }
  };

  const handleLoadLoadout = (loadout: Loadout) => {
    importProfile({
      version: 1,
      appId: "macro-app",
      hotkeys,
      sequence: loadout.sequence,
    });
    setActiveTab("timeline");
  };

  if (isOverlayMode) {
    return (
      <div className="recording-overlay-bg">
        <div className="overlay-timer-badge">
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#ef4444",
              display: "inline-block",
              animation: "fadeIn 1s infinite alternate",
            }}
          />
          Recording: {overlayTimer}
        </div>
      </div>
    );
  }

  const isPlayDisabled = items.length === 0 || isRecording;
  const isRecordDisabled = isPlaying;

  return (
    <div className="app-shell">
      <SideRail activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="app-container">

      {activeTab === "timeline" && (
        <>
          {/* Header section with branding & hotkeys */}
          <header
            className="panel-glass"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: "800",
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span style={{ color: "var(--accent)" }}>●</span>
                Auto Input
              </h1>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: "500" }}>
                Windows Auto-Clicker & Macro Engine
              </span>
            </div>

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <HotkeyField
                label="Record Toggle"
                currentKey={hotkeys.recordToggle}
                isListening={isListening === "recordToggle"}
                onStartListening={() => handleStartListening("recordToggle")}
                onCancelListening={handleCancelListening}
                onKeyCapture={(keyName) => handleKeyCapture("recordToggle", keyName)}
              />
              <HotkeyField
                label="Start Sequence"
                currentKey={hotkeys.startSequence}
                isListening={isListening === "startSequence"}
                onStartListening={() => handleStartListening("startSequence")}
                onCancelListening={handleCancelListening}
                onKeyCapture={(keyName) => handleKeyCapture("startSequence", keyName)}
              />

              <PrimaryActionButton
                isRecording={isRecording}
                isPlaying={isPlaying}
                isPlayDisabled={isPlayDisabled}
                isRecordDisabled={isRecordDisabled}
                onRecordToggle={isRecording ? stopRecording : startRecording}
                onPlayToggle={isPlaying ? stopPlayback : startPlayback}
                repeatMode={repeat.mode}
                repeatCount={repeat.count}
              />
            </div>
          </header>
          {/* Timeline items list */}
          <main className="panel-glass" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: "600" }}>Sequence Timeline</h2>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Drag rows to reorder execution sequence
                </span>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsSaveLoadoutOpen(true)}
                  disabled={isRecording || isPlaying || items.length === 0}
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save Loadout
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddOpen(true)}
                  disabled={isRecording || isPlaying}
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Action
                </button>
              </div>
            </div>

            <ActionsList
              items={items}
              onUpdate={updateItem}
              onDelete={removeItem}
              onReorder={reorderItems}
              disabled={isRecording || isPlaying}
            />
          </main>

          {/* Footer loop control */}
          <footer
            className="panel-glass"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "20px",
              padding: "16px 24px",
              flexWrap: "wrap",
            }}
          >
            <LoopControl repeat={repeat} onChange={setRepeat} disabled={isRecording || isPlaying} />
          </footer>
        </>
      )}

      {activeTab === "loadout" && (
        <LoadoutTab
          currentItemsCount={items.length}
          onLoadLoadout={handleLoadLoadout}
        />
      )}

      {activeTab === "settings" && (
        <SettingsTab
          themes={themes}
          activeThemeId={activeThemeId}
          recordDragMotion={recordDragMotion}
          whenClosed={whenClosed}
          onSelectTheme={selectTheme}
          onSaveCustomTheme={saveCustomTheme}
          onDeleteTheme={deleteTheme}
          onSetRecordDragMotion={setRecordDragMotion}
          onSetWhenClosed={setWhenClosed}
        />
      )}

      {/* Popups & Modals */}
      <AddActionModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={addItem}
      />
      <ConflictWarningModal
        isOpen={conflictMessage !== null}
        onClose={() => setConflictMessage(null)}
        message={conflictMessage || ""}
      />
      <SaveLoadoutModal
        isOpen={isSaveLoadoutOpen}
        onClose={() => setIsSaveLoadoutOpen(false)}
        onSave={handleSaveLoadout}
        items={items}
        repeat={repeat}
      />
      </div>
    </div>
  );

  function handleStartListening(target: string) {
    listenForHotkey(target);
  }

  function handleCancelListening() {
    cancelListenForHotkey();
  }

  function handleKeyCapture(target: "recordToggle" | "startSequence", keyName: string) {
    const updated = { ...hotkeys, [target]: keyName };
    setHotkeys(updated);
    cancelListenForHotkey();
  }
}
