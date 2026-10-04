import { ALERT_LEVELS, ALERT_MAX, ALERT_NAMES } from "../game/useGameState";

// The ship's alert (see useGameState's alert) over the view: its level by
// name, and a bar filling toward lockdown with a tick at each level.
const COLORS = ["#4ade80", "#facc15", "#fb923c", "#ef4444"];

export function AlertMeter({ alert, compact }: { alert: number; compact?: boolean }) {
  const level = ALERT_LEVELS.reduce((l, from, i) => (alert >= from ? i : l), 0);
  const color = COLORS[level];
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none font-mono ${compact ? "top-1 w-28" : "top-2 w-44"}`}
      title="Ship security: rises with time aboard and with the noise you make"
    >
      <div className={`flex justify-between uppercase tracking-wider ${compact ? "text-[8px]" : "text-[10px]"}`} style={{ color }}>
        <span>security</span>
        <span className={level === 3 ? "animate-pulse" : ""}>{ALERT_NAMES[level]}</span>
      </div>
      <div className="relative h-1.5 bg-black/60 border border-neutral-700 rounded-sm overflow-hidden">
        <div className="absolute inset-y-0 left-0 transition-[width] duration-500" style={{ width: `${(alert / ALERT_MAX) * 100}%`, backgroundColor: color }} />
        {ALERT_LEVELS.slice(1, -1).map((from) => (
          <div key={from} className="absolute inset-y-0 w-px bg-neutral-400/60" style={{ left: `${(from / ALERT_MAX) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}
