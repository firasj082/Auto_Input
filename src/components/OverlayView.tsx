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
        background: "rgba(30,80,255,0.08)",
        pointerEvents: "none", // belt-and-suspenders alongside the Win32 click-through flags
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          padding: "4px 10px",
          borderRadius: 6,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: 14,
        }}
      >
        {mm}:{ss}
      </div>
    </div>
  );
}