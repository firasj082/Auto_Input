import { useEffect, useState } from "react";

/**
 * Read-only visual indicator shown during recording. Contains zero
 * interactive elements and makes zero calls into useSequence — the
 * overlay window is click-through by design (WS_EX_TRANSPARENT), so
 * anything interactive here could never receive input anyway.
 */
export function OverlayView() {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(30, 80, 255, 0.05)", // 5% opacity subtle blue
        border: "none", // No edges/borders at all
        pointerEvents: "none", // belt-and-suspenders alongside the Win32 click-through flags
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "8px 16px",
          borderRadius: "8px",
          fontFamily: "monospace",
          fontSize: "18px",
          fontWeight: "bold",
          color: "#3b82f6",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#ef4444",
            display: "inline-block",
            animation: "fadeIn 1s infinite alternate",
          }}
        />
        Recording: {mm}:{ss}
      </div>
    </div>
  );
}