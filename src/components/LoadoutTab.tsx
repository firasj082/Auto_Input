import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ask, message } from "@tauri-apps/plugin-dialog";
import type { Loadout, LoadoutMetadata } from "../types/sequence";
import { InspectLoadoutModal } from "./InspectLoadoutModal";

const PAGE_SIZE = 10;

interface Props {
  currentItemsCount: number;
  onLoadLoadout: (loadout: Loadout) => void;
}

/** Formats milliseconds into a human-readable string. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * LoadoutTab is the main view rendered when the "Loadout" side rail tab is active.
 * Displays a paginated, sorted explorer of saved loadouts with import, export,
 * delete, load, and double-click inspect capabilities.
 */
export const LoadoutTab: React.FC<Props> = ({ currentItemsCount, onLoadLoadout }) => {
  const [loadouts, setLoadouts] = useState<LoadoutMetadata[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [inspectLoadout, setInspectLoadout] = useState<Loadout | null>(null);
  const [isInspectOpen, setIsInspectOpen] = useState(false);

  const fetchLoadouts = async () => {
    try {
      const list = await invoke<LoadoutMetadata[]>("list_loadouts");
      setLoadouts(list);
      // Clamp current page if needed
      const maxPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (currentPage > maxPage) {
        setCurrentPage(maxPage);
      }
    } catch (err) {
      console.error("Failed to list loadouts:", err);
      await message(`Failed to list loadouts: ${err}`, { title: "Error", kind: "error" });
    }
  };

  useEffect(() => {
    fetchLoadouts();
  }, []);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(loadouts.length / PAGE_SIZE));
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageLoadouts = loadouts.slice(startIdx, startIdx + PAGE_SIZE);

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Loadout JSON", extensions: ["json"] }],
      });
      if (selected && typeof selected === "string") {
        await invoke("import_loadout", { path: selected });
        await fetchLoadouts();
      }
    } catch (err) {
      console.error("Failed to import loadout:", err);
      await message(`Failed to import loadout: ${err}`, { title: "Import Error", kind: "error" });
    }
  };

  const handleExport = async (id: string, name: string) => {
    try {
      const path = await save({
        filters: [{ name: "Loadout JSON", extensions: ["json"] }],
        defaultPath: `${name}.json`,
      });
      if (path) {
        await invoke("export_loadout", { id, path });
      }
    } catch (err) {
      console.error("Failed to export loadout:", err);
      await message(`Failed to export loadout: ${err}`, { title: "Export Error", kind: "error" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await ask(`Delete loadout "${name}"? This cannot be undone.`, {
      title: "Confirm Delete",
      kind: "warning",
    });
    if (!confirmed) return;

    try {
      await invoke("delete_loadout", { id });
      await fetchLoadouts();
    } catch (err) {
      console.error("Failed to delete loadout:", err);
      await message(`Failed to delete loadout: ${err}`, { title: "Delete Error", kind: "error" });
    }
  };

  const handleLoad = async (id: string) => {
    // Guard: confirm if the timeline is not empty
    if (currentItemsCount > 0) {
      const confirmed = await ask(
        "Your current timeline has unsaved actions. Loading this loadout will replace them. Continue?",
        { title: "Load Loadout", kind: "warning" }
      );
      if (!confirmed) return;
    }

    try {
      const loadout = await invoke<Loadout>("load_loadout", { id });
      onLoadLoadout(loadout);
    } catch (err) {
      console.error("Failed to load loadout:", err);
      await message(`Failed to load loadout: ${err}`, { title: "Load Error", kind: "error" });
    }
  };

  const handleDoubleClick = async (id: string) => {
    try {
      const loadout = await invoke<Loadout>("load_loadout", { id });
      setInspectLoadout(loadout);
      setIsInspectOpen(true);
    } catch (err) {
      console.error("Failed to inspect loadout:", err);
      await message(`Failed to read loadout: ${err}`, { title: "Error", kind: "error" });
    }
  };

  const handleInspectLoad = async (loadout: Loadout) => {
    if (currentItemsCount > 0) {
      const confirmed = await ask(
        "Your current timeline has unsaved actions. Loading this loadout will replace them. Continue?",
        { title: "Load Loadout", kind: "warning" }
      );
      if (!confirmed) return;
    }
    setIsInspectOpen(false);
    onLoadLoadout(loadout);
  };

  const handleSaveDetails = async (updated: Loadout) => {
    try {
      await invoke("save_loadout", { loadout: updated });
      setInspectLoadout(updated);
      await fetchLoadouts();
    } catch (err) {
      console.error("Failed to save loadout details:", err);
      await message(`Failed to save changes: ${err}`, { title: "Save Error", kind: "error" });
    }
  };

  return (
    <>
      <main className="panel-glass" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "600" }}>Loadout Explorer</h2>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {loadouts.length} saved loadout{loadouts.length !== 1 ? "s" : ""} · Sorted by last used
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleImport}
            style={{ padding: "8px 14px", fontSize: "13px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Import Loadout
          </button>
        </div>

        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 90px 120px 110px",
            gap: "8px",
            padding: "8px 12px",
            fontSize: "10px",
            fontWeight: "600",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <span>Name</span>
          <span style={{ textAlign: "center" }}>Actions</span>
          <span style={{ textAlign: "center" }}>Duration</span>
          <span style={{ textAlign: "center" }}>Repeat</span>
          <span style={{ textAlign: "right" }}>Actions</span>
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {pageLoadouts.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "8px",
                color: "var(--text-muted)",
                fontSize: "13px",
                padding: "40px 0",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              No loadouts yet. Save a timeline or import one to get started.
            </div>
          ) : (
            pageLoadouts.map((l) => (
              <div
                key={l.id}
                onDoubleClick={() => handleDoubleClick(l.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 90px 120px 110px",
                  gap: "8px",
                  padding: "10px 12px",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border-default)",
                  cursor: "pointer",
                  transition: "background var(--transition-fast)",
                  fontSize: "13px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Name */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1px", overflow: "hidden" }}>
                  <span style={{ fontWeight: "500", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.name}
                  </span>
                  {l.description && (
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {l.description}
                    </span>
                  )}
                </div>

                {/* Total Actions */}
                <span style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                  {l.totalItems}
                </span>

                {/* Duration */}
                <span style={{ textAlign: "center", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  {formatDuration(l.totalDurationMs)}
                </span>

                {/* Repeat */}
                <span style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                  {l.repeatMode === "infinite" ? "∞ loop" : `${l.repeatCount}×`}
                </span>

                {/* Action Icons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}>
                  {/* Load */}
                  <button
                    type="button"
                    className="btn-icon"
                    title="Load into Timeline"
                    onClick={(e) => { e.stopPropagation(); handleLoad(l.id); }}
                    style={{ padding: "6px", background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 16 12 12 8 16" />
                      <line x1="12" y1="12" x2="12" y2="21" />
                      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                    </svg>
                  </button>

                  {/* Export */}
                  <button
                    type="button"
                    className="btn-icon"
                    title="Export Loadout"
                    onClick={(e) => { e.stopPropagation(); handleExport(l.id, l.name); }}
                    style={{ padding: "6px", background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    className="btn-icon"
                    title="Delete Loadout"
                    onClick={(e) => { e.stopPropagation(); handleDelete(l.id, l.name); }}
                    style={{ padding: "6px", background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-recording)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "6px",
              padding: "8px 0 0",
              borderTop: "1px solid var(--border-default)",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              style={{ padding: "4px 10px", fontSize: "12px" }}
            >
              Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: currentPage === page ? "700" : "500",
                  background: currentPage === page ? "var(--accent)" : "transparent",
                  color: currentPage === page ? "#fff" : "var(--text-secondary)",
                  border: currentPage === page ? "none" : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                  minWidth: "30px",
                }}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              className="btn btn-secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              style={{ padding: "4px 10px", fontSize: "12px" }}
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* Inspect Modal */}
      <InspectLoadoutModal
        isOpen={isInspectOpen}
        loadout={inspectLoadout}
        onClose={() => { setIsInspectOpen(false); setInspectLoadout(null); }}
        onLoad={handleInspectLoad}
        onSaveDetails={handleSaveDetails}
      />
    </>
  );
};
