import { useEffect } from "react";
import { t } from "../i18n";
import type { LinkPrompt } from "../game/useGameState";

// The question put to the party standing on a gate (see mapLinks.ts): leave
// this map for the one the gate leads to? Enter / Space (the game's Use) go,
// Esc stays - the buttons are for the pointer and the touch screen.
export function GatePrompt({ prompt, onGo, onStay }: { prompt: LinkPrompt; onGo: () => void; onStay: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) onStay();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onStay]);
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="absolute inset-x-0 bottom-[22%] z-30 flex justify-center px-3 pointer-events-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-auto flex max-w-md flex-col items-center gap-2 rounded-sm border border-amber-400/60 bg-black/80 px-4 py-3 text-center font-mono text-sm text-amber-100 shadow-lg">
        <div>{t("link.prompt", { from: prompt.from, to: prompt.to })}</div>
        <div className="text-[11px] text-amber-200/70">{t("link.keys")}</div>
        <div className="flex gap-2">
          <button type="button" onClick={onGo} className="rounded-sm border border-amber-400 bg-amber-400/20 px-3 py-1 text-xs text-amber-100 hover:bg-amber-400/30">
            {t("link.goButton")}
          </button>
          <button type="button" onClick={onStay} className="rounded-sm border border-neutral-500 bg-neutral-800 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-700">
            {t("link.stayButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
