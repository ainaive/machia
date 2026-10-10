import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
// Bundled with the app: Google Fonts is slow or unreachable for many visitors.
import "@fontsource-variable/dm-sans/opsz.css";
import "@fontsource-variable/syne";
import "./index.css";

// Pages load on demand. A tab opened before a deploy asks for page files
// that the new build replaced; reload once to pick up the new build rather
// than fail. (Not again within a few seconds, in case the file is really gone.)
window.addEventListener("vite:preloadError", (event) => {
  try {
    const key = "machia:chunk-reload";
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return; // no storage to guard against a reload loop
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
