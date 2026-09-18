import type { LogEntry } from "../game/useGameState";

export function LogPanel({ log }: { log: LogEntry[] }) {
  return (
    <div className="border border-green-900 bg-black/70 p-2 h-full overflow-y-auto text-[11px] leading-tight text-green-400 font-mono">
      {log.map((entry) => (
        <div key={entry.id}>&gt; {entry.text}</div>
      ))}
    </div>
  );
}
