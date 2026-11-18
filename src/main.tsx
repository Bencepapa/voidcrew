import { isTextEntry } from "./keyboardFocus";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { START_MAP } from "./game/map";
import { WORLDS } from "./game/worlds";
import { ActorEditor } from "./editor/ActorEditor";
import "./index.css";

document.documentElement.classList.toggle("theme-fantasy", START_MAP.world === "fantasy");
document.title = WORLDS[START_MAP.world].name;

// Keys typed into a text field are the field's alone: the game's and the
// editor's key handlers (steps on WASD, R to turn a prop, Delete...) are all
// on the window, and this one - added before any of them - stops the event
// there. The field still gets its character: that's the key's own doing,
// not a handler's. Sliders, checkboxes and dropdowns don't count as typing.
for (const type of ["keydown", "keyup", "keypress"] as const) {
  window.addEventListener(type, (e) => {
    if (!(e.target instanceof HTMLElement) || !isTextEntry(e.target)) return;
    if (type === "keydown" && (e.key === "Escape" || (e.key === "Enter" && e.target instanceof HTMLInputElement))) {
      e.preventDefault();
      e.target.blur();
    }
    e.stopImmediatePropagation();
  }, true);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* dev tools: ?editor=actors opens the actor sprite editor */}
    {new URLSearchParams(location.search).get("editor") === "actors" ? <ActorEditor /> : <App />}
  </StrictMode>,
);
