import React from "react";
import ReactDOM from "react-dom/client";
import { OverlayView } from "./components/OverlayView";
import "./overlay.css";

ReactDOM.createRoot(document.getElementById("overlay-root")!).render(
  <React.StrictMode>
    <OverlayView />
  </React.StrictMode>
);