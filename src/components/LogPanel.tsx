import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../game/useGameState";

// The message log: the whole history (the game keeps the last 200 lines),
// scrolled to the newest. On a phone it's a small box that can be scrolled,
// with a button that opens it as a near-fullscreen panel to read back.
export function LogPanel({ log, compact }: { log: LogEntry[]; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const big = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const el of [box.current, big.current]) if (el) el.scrollTop = el.scrollHeight;
  }, [log, expanded]);
  const lines = log.map((entry) => <div key={entry.id}>&gt; {entry.text}</div>);
  return (
    <>
      <div className="relative h-full">
        <div
          ref={box}
          className={`pointer-events-auto border border-green-900 h-full overflow-y-auto leading-tight text-green-400 font-mono ${compact ? "bg-black/80 p-1.5 pr-7 text-[12px]" : "bg-black/70 p-2 text-[11px]"}`}
        >
          {lines}
        </div>
        {compact && (
          <button
            type="button"
            aria-label="Open the full log"
            onClick={() => setExpanded(true)}
            className="pointer-events-auto absolute top-1 right-1 w-6 h-6 flex items-center justify-center border border-green-900 bg-black/80 text-green-400 text-sm rounded-sm"
          >
            ⤢
          </button>
        )}
      </div>
      {expanded && (
        <div className="pointer-events-auto fixed inset-2 z-50 flex flex-col border border-green-800 bg-black/95 font-mono text-green-400">
          <div className="flex items-center justify-between px-2 py-1 border-b border-green-900 text-[12px] text-neutral-300">
            <span>LOG</span>
            <button
              type="button"
              aria-label="Close the log"
              onClick={() => setExpanded(false)}
              className="w-8 h-8 flex items-center justify-center border border-green-900 rounded-sm text-base"
            >
              ✕
            </button>
          </div>
          <div ref={big} className="flex-1 min-h-0 overflow-y-auto p-2 text-[14px] leading-snug">
            {lines}
          </div>
        </div>
      )}
    </>
  );
}
