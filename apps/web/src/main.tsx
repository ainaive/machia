import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
// Bundled with the app: Google Fonts is slow or unreachable for many visitors.
import "@fontsource-variable/dm-sans/opsz.css";
import "@fontsource-variable/syne";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
