import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ActorEditor } from "./editor/ActorEditor";
import "./index.css";

// Keys typed into a text field are the field's alone: the game's and the
// editor's key handlers (steps on WASD, R to turn a prop, Delete...) are all
// on the window, and this one - added before any of them - stops the event
// there. The field still gets its character: that's the key's own doing,
// not a handler's. Sliders, checkboxes and dropdowns don't count as typing.
const TEXT_INPUTS = new Set(["text", "search", "number", "password", "email", "url", "tel"]);
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target.isContentEditable) return true;
  return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type);
}
for (const type of ["keydown", "keyup", "keypress"] as const) {
  window.addEventListener(type, (e) => typing(e.target) && e.stopImmediatePropagation(), true);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* dev tools: ?editor=actors opens the actor sprite editor */}
    {new URLSearchParams(location.search).get("editor") === "actors" ? <ActorEditor /> : <App />}
  </StrictMode>,
);
