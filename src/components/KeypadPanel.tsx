import { useEffect, useRef, useState } from "react";
import { HACK_ENERGY } from "../game/story";

// A code lock's keypad (see useGameState's keypad): four digits typed - with
// the buttons or the keyboard (digits, Backspace, Enter) - and tried; a
// wrong code says so. The hacker can break it from here instead. Escape or
// Close leaves it.
const LENGTH = 4;

export function KeypadPanel({
  title,
  hack,
  hacker,
  onCode,
  onHack,
  onClose,
}: {
  // the door's label
  title: string;
  // how hard it is to hack (unset: it can't be), and who'd do it
  hack?: number;
  hacker?: string;
  // a code tried: whether it opened
  onCode: (code: string) => boolean;
  onHack: () => void;
  onClose: () => void;
}) {
  // (kept in a ref too: keys pressed quickly in a row each see the last)
  const [typed, setTypedState] = useState("");
  const typedRef = useRef("");
  const setTyped = (next: string) => {
    typedRef.current = next;
    setTypedState(next);
  };
  const [denied, setDenied] = useState(false);
  const press = (key: string) => {
    setDenied(false);
    const t = typedRef.current;
    if (key === "clear") setTyped("");
    else if (key === "back") setTyped(t.slice(0, -1));
    else if (key === "enter") {
      if (!onCode(t)) {
        setDenied(true);
        setTyped("");
      }
    } else if (t.length < LENGTH) setTyped(t + key);
  };
  useEffect(() => {
    // (ahead of the game's own keys)
    const onKey = (e: KeyboardEvent) => {
      const key = /^[0-9]$/.test(e.key)
        ? e.key
        : e.key === "Backspace"
          ? "back"
          : e.key === "Enter"
            ? "enter"
            : e.key === "Escape"
              ? "close"
              : null;
      if (!key) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (key === "close") onClose();
      else press(key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const cell = "h-10 border border-emerald-800 text-emerald-200 rounded-sm hover:bg-emerald-900/40 active:bg-emerald-800/50";
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-3 bg-black/50"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="w-60 border border-emerald-700/70 bg-black/90 p-3 font-mono shadow-[0_0_24px_rgba(16,185,129,0.25)] rounded-sm">
        <div className="flex items-center justify-between text-[11px] text-emerald-300 uppercase tracking-wider mb-2">
          <span className="truncate">&gt; {title}</span>
          <button type="button" onClick={onClose} className="ml-2 px-2 py-0.5 border border-emerald-800 hover:bg-emerald-900/40 rounded-sm">
            Close
          </button>
        </div>
        <div
          className={`mb-2 h-10 flex items-center justify-center border text-xl tracking-[0.5em] ${
            denied ? "border-red-700 text-red-400" : "border-emerald-800 text-emerald-200"
          }`}
        >
          {denied ? "DENIED" : (typed + "_".repeat(LENGTH - typed.length)).slice(0, LENGTH)}
        </div>
        <div className="grid grid-cols-3 gap-1 text-sm">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" className={cell} onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button type="button" className={`${cell} text-[11px]`} onClick={() => press("clear")}>
            CLR
          </button>
          <button type="button" className={cell} onClick={() => press("0")}>
            0
          </button>
          <button type="button" className={`${cell} text-[11px]`} onClick={() => press("enter")}>
            OK
          </button>
        </div>
        {hack && hacker && (
          <button
            type="button"
            onClick={onHack}
            className="mt-2 w-full py-1.5 border border-sky-700 text-sky-200 text-[11px] rounded-sm hover:bg-sky-900/30"
          >
            {hacker} hacks it ({HACK_ENERGY * hack} EN)
          </button>
        )}
      </div>
    </div>
  );
}
