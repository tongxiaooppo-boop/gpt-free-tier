import React from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App";
import "./ui/style.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", { updateViaCache: "none" })
      .catch(error => console.warn("離線快取註冊失敗", error));
  });
}
