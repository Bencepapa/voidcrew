import { useEffect, useState } from "react";
import type { Crewmate } from "../game/types";
import { gameClock } from "../game/clock";
import { canSwitch, crewWeapon, switchWeapon, useMeta } from "../game/meta";

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full bg-neutral-800/70 rounded-sm overflow-hidden">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// re-renders a few times a second while a weapon cools down
function useCooldownTick(readyAt: number[]) {
  const [, setTick] = useState(0);
  const cooling = readyAt.some((t) => t > gameClock.now());
  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(timer);
  }, [cooling]);
}

// a crewmate's weapon button: its name over a bar that fills as it cools
// down; bright when ready
function WeaponButton({
  mate,
  index,
  readyAt,
  aiming,
  onUse,
  compact,
}: {
  mate: Crewmate;
  index: number;
  readyAt: number;
  aiming: boolean;
  onUse: (index: number) => void;
  compact?: boolean;
}) {
  // (the loadout: re-drawn when a weapon is switched)
  useMeta();
  const weapon = crewWeapon(mate.id);
  if (!weapon) return null;
  const left = Math.max(0, readyAt - gameClock.now());
  const ready = left === 0 && mate.hp > 0;
  const fill = 1 - left / weapon.cooldownMs;
  return (
    <button
      onClick={() => onUse(index)}
      disabled={!ready}
      className={`pointer-events-auto relative w-full overflow-hidden border text-left rounded-sm ${
        compact ? "text-[8px] px-1 py-0.5" : "text-[10px] px-1.5 py-1"
      } ${aiming ? "border-amber-300 text-amber-200" : ready ? "border-emerald-500/70 text-emerald-200 hover:bg-emerald-900/30" : "border-neutral-700 text-neutral-500"}`}
    >
      <div className="absolute inset-y-0 left-0 bg-emerald-700/25" style={{ width: `${fill * 100}%` }} />
      <span className="relative">
        [{index + 1}] {weapon.name}
      </span>
      {canSwitch(mate.id) && (
        <span
          role="button"
          title={`Switch weapon (Shift+${index + 1})`}
          className="pointer-events-auto absolute right-0 inset-y-0 px-1.5 flex items-center text-neutral-300 hover:text-amber-200 bg-black/40"
          onClick={(e) => {
            e.stopPropagation();
            switchWeapon(mate.id);
          }}
        >
          ⇄
        </span>
      )}
    </button>
  );
}

export function PartyPanel({
  crew,
  compact,
  readyAt,
  aiming,
  onWeapon,
}: {
  crew: Crewmate[];
  compact?: boolean;
  readyAt: number[];
  // the crewmate aiming, if any
  aiming: number | null;
  onWeapon: (index: number) => void;
}) {
  useCooldownTick(readyAt);
  if (compact) {
    // translucent strip for the mobile overlay layout: name + bars only
    return (
      <div className="grid grid-cols-4 gap-1">
        {crew.map((c, i) => (
          <div key={c.id} className="border border-neutral-700/60 bg-black/30 px-1 py-0.5 flex flex-col gap-0.5">
            <div className={`text-[9px] truncate ${c.hp > 0 ? "text-neutral-300" : "text-red-400"}`}>
              {i + 1}: {c.name}
            </div>
            <Bar value={c.hp} max={c.maxHp} color="#dc2626" />
            <Bar value={c.en} max={c.maxEn} color="#2563eb" />
            <WeaponButton mate={c} index={i} readyAt={readyAt[i]} aiming={aiming === i} onUse={onWeapon} compact />
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
            <span>
              {i + 1}: {c.name}
            </span>
            {c.hp === 0 && <span className="text-red-400">DOWN</span>}
          </div>
          <div className="text-[9px] text-neutral-500">{c.role}</div>
          <div className="text-[10px] text-neutral-300">HP {c.hp}/{c.maxHp}</div>
          <Bar value={c.hp} max={c.maxHp} color="#dc2626" />
          <div className="text-[10px] text-neutral-300">EN {c.en}/{c.maxEn}</div>
          <Bar value={c.en} max={c.maxEn} color="#2563eb" />
          <WeaponButton mate={c} index={i} readyAt={readyAt[i]} aiming={aiming === i} onUse={onWeapon} />
        </div>
      ))}
    </div>
  );
}
