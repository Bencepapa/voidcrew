import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ActorEditor } from "./editor/ActorEditor";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* dev tools: ?editor=actors opens the actor sprite editor */}
    {new URLSearchParams(location.search).get("editor") === "actors" ? <ActorEditor /> : <App />}
  </StrictMode>,
);
