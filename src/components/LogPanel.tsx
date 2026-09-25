import type { LogEntry } from "../game/useGameState";

export function LogPanel({ log, compact }: { log: LogEntry[]; compact?: boolean }) {
  // the compact overlay only has room for the latest few lines
  const entries = compact ? log.slice(-4) : log;
  return (
    <div
      className={`border border-green-900 h-full overflow-y-auto leading-tight text-green-400 font-mono ${compact ? "bg-black/25 p-1 text-[9px]" : "bg-black/70 p-2 text-[11px]"}`}
    >
      {entries.map((entry) => (
        <div key={entry.id}>&gt; {entry.text}</div>
      ))}
    </div>
  );
}
