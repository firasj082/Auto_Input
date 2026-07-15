import React, { useState } from "react";
import type { Theme, ThemeColors } from "../types/sequence";
import { lightenHexColor } from "../hooks/useTheme";

interface Props {
  themes: Theme[];
  activeThemeId: string;
  recordDragMotion: boolean;
  onSelectTheme: (id: string) => void;
  onSaveCustomTheme: (name: string, colors: Omit<ThemeColors, "accentHover" | "statusRecording" | "statusPlaying" | "statusWarning">) => Promise<void>;
  onDeleteTheme: (id: string) => void;
  onSetRecordDragMotion: (enabled: boolean) => void;
}

interface CreatorState {
  isOpen: boolean;
  /** If set, we are editing an existing theme rather than creating a new one. */
  editingTheme: Theme | null;
  name: string;
  bgApp: string;
  bgPanel: string;
  bgElevated: string;
  borderDefault: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
}

const DEFAULT_CREATOR: CreatorState = {
  isOpen: false,
  editingTheme: null,
  name: "",
  bgApp: "#0f172a",
  bgPanel: "#1e293b",
  bgElevated: "#334155",
  borderDefault: "#475569",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  accent: "#38bdf8",
};

export const SettingsTab: React.FC<Props> = ({
  themes,
  activeThemeId,
  recordDragMotion,
  onSelectTheme,
  onSaveCustomTheme,
  onDeleteTheme,
  onSetRecordDragMotion,
}) => {
  const [creator, setCreator] = useState<CreatorState>(DEFAULT_CREATOR);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const openForCreate = () => {
    setCreator({ ...DEFAULT_CREATOR, isOpen: true });
    setErrorMsg("");
  };

  const openForEdit = (theme: Theme) => {
    setCreator({
      isOpen: true,
      editingTheme: theme,
      name: theme.name,
      bgApp: theme.colors.bgApp,
      bgPanel: theme.colors.bgPanel,
      bgElevated: theme.colors.bgElevated,
      borderDefault: theme.colors.borderDefault,
      textPrimary: theme.colors.textPrimary,
      textSecondary: theme.colors.textSecondary,
      accent: theme.colors.accent,
    });
    setErrorMsg("");
  };

  const closeCreator = () => {
    setCreator({ ...creator, isOpen: false });
    setSaving(false);
    setErrorMsg("");
  };

  const handleSave = async () => {
    const trimmedName = creator.name.trim();
    if (!trimmedName) {
      setErrorMsg("Theme name is required");
      return;
    }
    setSaving(true);
    setErrorMsg("");

    try {
      const colors: Omit<ThemeColors, "accentHover" | "statusRecording" | "statusPlaying" | "statusWarning"> = {
        bgApp: creator.bgApp,
        bgPanel: creator.bgPanel,
        bgElevated: creator.bgElevated,
        borderDefault: creator.borderDefault,
        textPrimary: creator.textPrimary,
        textSecondary: creator.textSecondary,
        accent: creator.accent,
      };

      if (creator.editingTheme) {
        // Editing: build full Theme object reusing the existing ID, then save via the same command
        const { invoke } = await import("@tauri-apps/api/core");
        const fullColors: ThemeColors = {
          ...colors,
          accentHover: lightenHexColor(colors.accent, 15),
          statusRecording: creator.editingTheme.colors.statusRecording,
          statusPlaying: creator.editingTheme.colors.statusPlaying,
          statusWarning: creator.editingTheme.colors.statusWarning,
        };
        const updatedTheme: Theme = {
          id: creator.editingTheme.id,
          name: trimmedName,
          isBuiltIn: false,
          colors: fullColors,
        };
        await invoke("save_custom_theme", { theme: updatedTheme });

        // If this was the active theme, re-apply it
        if (creator.editingTheme.id === activeThemeId) {
          const { applyThemeToDOM, getContrastColor } = await import("../hooks/useTheme");
          applyThemeToDOM(fullColors);
          localStorage.setItem("active-theme-colors", JSON.stringify({
            ...fullColors,
            accentText: getContrastColor(fullColors.accent)
          }));
        }

        // Force theme list refresh by re-selecting current theme
        // The parent will re-fetch themes on its next render cycle
        window.location.reload();
      } else {
        await onSaveCustomTheme(trimmedName, colors);
      }

      closeCreator();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateCreator = (field: keyof CreatorState, value: string) => {
    setCreator((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <main className="panel-glass" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto" }}>
        {/* Header */}
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: "600" }}>Settings</h2>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Configure visual themes and display settings
          </span>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-default)", margin: 0 }} />

        {/* Theme Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Appearance</h3>

          {/* Theme Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            {themes.map((t) => {
              const isActive = t.id === activeThemeId;
              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTheme(t.id)}
                  style={{
                    background: "var(--bg-elevated)",
                    border: isActive ? "2px solid var(--accent)" : "1px solid var(--border-default)",
                    borderRadius: "var(--radius-default)",
                    padding: "14px 16px",
                    cursor: "pointer",
                    position: "relative",
                    transition: "all var(--transition-fast)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.borderColor = "var(--text-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.borderColor = "var(--border-default)";
                  }}
                >
                  {/* Card Title */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-primary)" }}>{t.name}</span>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: "600",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: t.isBuiltIn ? "rgba(99, 102, 241, 0.15)" : "rgba(16, 185, 129, 0.15)",
                        color: t.isBuiltIn ? "var(--accent)" : "#10b981",
                        textTransform: "uppercase",
                      }}
                    >
                      {t.isBuiltIn ? "Built-In" : "Custom"}
                    </span>
                  </div>

                  {/* Color Preview Dots */}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: t.colors.bgApp, border: "1px solid var(--border-default)" }} title="App Background" />
                    <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: t.colors.bgPanel, border: "1px solid var(--border-default)" }} title="Panel" />
                    <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: t.colors.accent, border: "1px solid var(--border-default)" }} title="Accent" />
                    <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: t.colors.textPrimary, border: "1px solid var(--border-default)" }} title="Text" />
                  </div>

                  {/* Action Icons — right side */}
                  {!t.isBuiltIn && (
                    <div style={{ position: "absolute", bottom: "12px", right: "12px", display: "flex", gap: "4px" }}>
                      {/* Edit */}
                      <button
                        type="button"
                        title="Edit Theme"
                        onClick={(e) => { e.stopPropagation(); openForEdit(t); }}
                        style={{
                          padding: "4px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          borderRadius: "var(--radius-sm)",
                          transition: "color var(--transition-fast)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        title="Delete Theme"
                        onClick={(e) => { e.stopPropagation(); onDeleteTheme(t.id); }}
                        style={{
                          padding: "4px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          borderRadius: "var(--radius-sm)",
                          transition: "color var(--transition-fast)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-recording)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Theme Button */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={openForCreate}
            style={{ alignSelf: "flex-start", padding: "8px 16px", fontSize: "13px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Theme
          </button>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-default)", margin: 0 }} />

        {/* Record Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Record</h3>

          {/* Record Drag Motion toggle */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "13px", fontWeight: "500", color: "var(--text-primary)" }}>Record drag motion</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Capture mouse movement while a button is held (e.g. dragging icons)
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={recordDragMotion}
              onClick={() => onSetRecordDragMotion(!recordDragMotion)}
              style={{
                position: "relative",
                width: "40px",
                height: "22px",
                borderRadius: "11px",
                border: "none",
                cursor: "pointer",
                background: recordDragMotion ? "var(--accent)" : "var(--bg-elevated)",
                transition: "background var(--transition-fast)",
                flexShrink: 0,
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: recordDragMotion ? "20px" : "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left var(--transition-fast)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </button>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-default)", margin: 0 }} />

        {/* General Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>General</h3>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>More settings coming soon.</span>
        </div>
      </main>

      {/* Creator / Editor Modal */}
      {creator.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "520px" }}>
            <h3 className="modal-header">
              {creator.editingTheme ? `Edit Theme — ${creator.editingTheme.name}` : "Create Custom Theme"}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {errorMsg && (
                <div style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "var(--radius-sm)", color: "#ef4444", fontSize: "12px" }}>
                  {errorMsg}
                </div>
              )}

              {/* Name */}
              <div className="input-container">
                <label className="input-label">Theme Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Skyline Blue..."
                  value={creator.name}
                  onChange={(e) => updateCreator("name", e.target.value)}
                  autoFocus
                  maxLength={32}
                />
              </div>

              {/* Color Pickers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <ColorPicker label="App Background" value={creator.bgApp} onChange={(v) => updateCreator("bgApp", v)} />
                <ColorPicker label="Panel Background" value={creator.bgPanel} onChange={(v) => updateCreator("bgPanel", v)} />
                <ColorPicker label="Elevated Background" value={creator.bgElevated} onChange={(v) => updateCreator("bgElevated", v)} />
                <ColorPicker label="Border Color" value={creator.borderDefault} onChange={(v) => updateCreator("borderDefault", v)} />
                <ColorPicker label="Accent Color" value={creator.accent} onChange={(v) => updateCreator("accent", v)} />
                <ColorPicker label="Primary Text" value={creator.textPrimary} onChange={(v) => updateCreator("textPrimary", v)} />
                <ColorPicker label="Secondary Text" value={creator.textSecondary} onChange={(v) => updateCreator("textSecondary", v)} />
              </div>

              {/* Scoped Live Preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-secondary)" }}>Live Preview</span>
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "var(--radius-default)",
                    border: `1px solid ${creator.borderDefault}`,
                    background: creator.bgApp,
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
                  }}
                >
                  {/* Mock Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: creator.accent }} />
                      <span style={{ fontSize: "11px", fontWeight: "700", color: creator.textPrimary }}>Auto Input</span>
                    </div>
                    <span style={{ fontSize: "9px", color: creator.textSecondary }}>F9 Recording</span>
                  </div>

                  {/* Mock Timeline Row */}
                  <div
                    style={{
                      background: creator.bgPanel,
                      border: `1px solid ${creator.borderDefault}`,
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "600", color: creator.textPrimary }}>Space</span>
                      <span
                        style={{
                          fontSize: "8px",
                          fontWeight: "700",
                          padding: "1px 4px",
                          borderRadius: "3px",
                          background: `${creator.accent}25`,
                          color: creator.accent,
                          textTransform: "uppercase",
                        }}
                      >
                        click
                      </span>
                    </div>
                    <span style={{ fontSize: "10px", color: creator.textSecondary }}>500ms</span>
                  </div>

                  {/* Mock Elevated Panel */}
                  <div
                    style={{
                      background: creator.bgElevated,
                      border: `1px solid ${creator.borderDefault}`,
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "10px", color: creator.textSecondary }}>Elevated surface</span>
                    <span
                      style={{
                        background: creator.accent,
                        color: "#fff",
                        borderRadius: "3px",
                        padding: "2px 8px",
                        fontSize: "9px",
                        fontWeight: "600",
                      }}
                    >
                      Button
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
                <button type="button" className="btn btn-secondary" onClick={closeCreator}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || !creator.name.trim()}
                >
                  {saving
                    ? (creator.editingTheme ? "Saving..." : "Creating...")
                    : (creator.editingTheme ? "Save Changes" : "Create Theme")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/** Reusable color picker row for the theme creator modal. */
const ColorPicker: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <div className="input-container">
    <label className="input-label" style={{ fontSize: "10px" }}>{label}</label>
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "28px",
          height: "28px",
          border: "1px solid var(--border-default)",
          borderRadius: "4px",
          padding: 0,
          cursor: "pointer",
          background: "transparent",
        }}
      />
      <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>
        {value.toUpperCase()}
      </span>
    </div>
  </div>
);
