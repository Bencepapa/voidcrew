import type { Crewmate } from "../game/types";

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full bg-neutral-800/70 rounded-sm overflow-hidden">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export function PartyPanel({ crew, compact }: { crew: Crewmate[]; compact?: boolean }) {
  if (compact) {
    // translucent strip for the mobile overlay layout: name + bars only
    return (
      <div className="grid grid-cols-4 gap-1">
        {crew.map((c, i) => (
          <div key={c.id} className="border border-neutral-700/60 bg-black/30 px-1 py-0.5 flex flex-col gap-0.5">
            <div className="text-[9px] text-neutral-300 truncate">
              {i + 1}: {c.name}
            </div>
            <Bar value={c.hp} max={c.maxHp} color="#dc2626" />
            <Bar value={c.en} max={c.maxEn} color="#2563eb" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {crew.map((c, i) => (
        <div key={c.id} className="border border-neutral-700 bg-neutral-900/80 p-2 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-neutral-400">
            <span>{i + 1}: {c.name}</span>
          </div>
          <div className="text-[9px] text-neutral-500">{c.role}</div>
          <div className="text-[10px] text-neutral-300">HP {c.hp}/{c.maxHp}</div>
          <Bar value={c.hp} max={c.maxHp} color="#dc2626" />
          <div className="text-[10px] text-neutral-300">EN {c.en}/{c.maxEn}</div>
          <Bar value={c.en} max={c.maxEn} color="#2563eb" />
        </div>
      ))}
    </div>
  );
}
