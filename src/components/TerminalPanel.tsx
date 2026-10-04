import { useEffect } from "react";

// A terminal's screen over the view (see story.ts): its title and text, in
// the log's green. Escape, Space, Enter or a click on Close shuts it.
export function TerminalPanel({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  useEffect(() => {
    // (ahead of the game's own keys: Space mustn't Use again, say)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-3 bg-black/50"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md max-h-full flex flex-col border border-emerald-700/70 bg-black/90 shadow-[0_0_24px_rgba(16,185,129,0.25)] rounded-sm">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-emerald-900 text-emerald-300 text-[11px] font-mono uppercase tracking-wider">
          <span className="truncate">&gt; {title}</span>
          <button type="button" onClick={onClose} className="ml-2 px-2 py-0.5 border border-emerald-800 hover:bg-emerald-900/40 rounded-sm">
            Close
          </button>
        </div>
        <div className="px-3 py-2 overflow-y-auto text-emerald-200 text-[12px] leading-relaxed font-mono whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
}
