import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useSequence } from "./hooks/useSequence";
import { HotkeyField } from "./components/HotkeyField";
import { RecordButton } from "./components/RecordButton";
import { ActionsList } from "./components/ActionsList";
import { LoopControl } from "./components/LoopControl";
import { AddManualActionModal } from "./components/AddManualActionModal";
import { ConflictWarningModal } from "./components/ConflictWarningModal";
import type { MacroProfile } from "./types/sequence";

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
    getExportProfile,
  } = useSequence();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [overlayTimer, setOverlayTimer] = useState("00:00");

  const prevHotkeysRef = useRef(hotkeys);

  // Determine if we are rendering in overlay mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("overlay") === "true") {
      setIsOverlayMode(true);
    }
  }, []);

  // Timer interval for the visual recording overlay
  useEffect(() => {
    if (!isOverlayMode) return;

    let seconds = 0;
    const interval = setInterval(() => {
      seconds += 1;
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      setOverlayTimer(`${mm}:${ss}`);
    }, 1000);

    return () => clearInterval(interval);
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

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "JSON Configuration", extensions: ["json"] }],
      });

      if (selected && typeof selected === "string") {
        // Read file contents via custom backend command to bypass webview file restrictions
        const data = await invoke<MacroProfile>("load_macro_profile_from_path", {
          path: selected,
        });
        
        if (data.appId === "macro-app" && data.sequence) {
          importProfile(data);
        } else {
          alert("Invalid macro profile file.");
        }
      }
    } catch (err) {
      console.error("Failed to import profile:", err);
    }
  };

  const handleExport = async () => {
    try {
      const path = await save({
        filters: [{ name: "JSON Configuration", extensions: ["json"] }],
        defaultPath: "profile.json",
      });

      if (path) {
        const profile = getExportProfile();
        // Invoke backend command to save profile data structure directly to target path
        await invoke("save_macro_profile_to_path", {
          profile,
          path,
        });
      }
    } catch (err) {
      console.error("Failed to export profile:", err);
    }
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
    <div className="app-container">
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
              background: "var(--gradient-accent)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.02em",
            }}
          >
            Auto Input
          </h1>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500" }}>
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
          />
          <HotkeyField
            label="Start Sequence"
            currentKey={hotkeys.startSequence}
            isListening={isListening === "startSequence"}
            onStartListening={() => handleStartListening("startSequence")}
            onCancelListening={handleCancelListening}
          />

          <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
            <RecordButton
              isRecording={isRecording}
              onToggle={isRecording ? stopRecording : startRecording}
              disabled={isRecordDisabled}
            />

            <button
              type="button"
              className={`btn ${isPlaying ? "btn-danger" : "btn-secondary"}`}
              onClick={isPlaying ? stopPlayback : startPlayback}
              disabled={isPlayDisabled}
              style={{ minWidth: "120px" }}
            >
              {isPlaying ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  Stop
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="5 3 19 12 5 21" />
                  </svg>
                  Play
                </>
              )}
            </button>
          </div>
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

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsAddOpen(true)}
            disabled={isRecording || isPlaying}
            style={{ padding: "8px 14px", fontSize: "13px" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Click Action
          </button>
        </div>

        <ActionsList
          items={items}
          onUpdate={updateItem}
          onDelete={removeItem}
          onReorder={reorderItems}
          disabled={isRecording || isPlaying}
        />
      </main>

      {/* Footer loop and file actions */}
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

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleImport}
            disabled={isRecording || isPlaying}
          >
            Import Profile
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={isRecording || isPlaying}
          >
            Export Profile
          </button>
        </div>
      </footer>

      {/* Popups & Modals */}
      <AddManualActionModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={addItem}
      />
      <ConflictWarningModal
        isOpen={conflictMessage !== null}
        onClose={() => setConflictMessage(null)}
        message={conflictMessage || ""}
      />
    </div>
  );

  function handleStartListening(target: string) {
    listenForHotkey(target);
  }

  function handleCancelListening() {
    cancelListenForHotkey();
  }
}
