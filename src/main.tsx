import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// SAFETY: Safely mounting the root React application into the DOM tree.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
