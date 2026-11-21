import { useEffect, useState } from "react";
import type { Crewmate } from "../game/types";
import { gameClock } from "../game/clock";
import type { HandIndex } from "../game/inventory";
import { crewWeapon, useInventory } from "../game/inventoryStore";
import { HandBoxes, infoLine } from "./InventorySlots";

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

// each role's color, behind a crewmate with no portrait yet
const ROLE_TINT: Record<string, string> = {
  MARINE: "#5b2121",
  ENGINEER: "#5a4214",
  ANDROID: "#1f3357",
  MEDIC: "#1d4a2e",
  WARRIOR: "#6b2a1c",
  DWARF: "#6a4a1a",
  MAGE: "#47245f",
  ELF: "#2a5a2a",
};

// A crewmate's portrait: public/portraits/<id>.webp (made by
// scripts/make-portraits.ts) - or, until there is one, their initial on
// their role's color. Greyed and reddened when down.
export function Avatar({ mate, className }: { mate: Crewmate; className: string }) {
  const [missing, setMissing] = useState(false);
  const down = mate.hp === 0;
  return (
    <div className={`relative overflow-hidden border border-neutral-700 bg-neutral-900 rounded-sm ${className}`}>
      {missing ? (
        <div
          className="w-full h-full flex items-center justify-center font-bold text-neutral-200/60"
          style={{ background: `linear-gradient(160deg, ${ROLE_TINT[mate.role] ?? "#333"}, #0a0a0a)` }}
        >
          {mate.name[0]}
        </div>
      ) : (
        <img
          src={`${import.meta.env.BASE_URL}portraits/${mate.id}.webp`}
          alt={mate.name}
          draggable={false}
          onError={() => setMissing(true)}
          className={`w-full h-full object-cover ${down ? "grayscale opacity-60" : ""}`}
        />
      )}
      {down && <div className="absolute inset-0 bg-red-900/40" />}
    </div>
  );
}

// A crewmate's two hand boxes: a click on one uses what it holds (a weapon
// is fired, a potion drunk, see onUseHand); dragging moves the item. Under
// them a bar fills as the weapon in use cools down.
function CrewHands({
  mate,
  index,
  readyAt,
  aiming,
  onUseHand,
}: {
  mate: Crewmate;
  index: number;
  readyAt: number;
  aiming: boolean;
  onUseHand: (index: number, hand: HandIndex) => boolean;
}) {
  // (the hands: re-drawn when something is moved or used up)
  useInventory();
  const weapon = crewWeapon(mate.id);
  const left = weapon ? Math.max(0, readyAt - gameClock.now()) : 0;
  const fill = weapon ? 1 - left / weapon.cooldownMs : 1;
  return (
    <div className={`pointer-events-auto flex flex-col gap-0.5 rounded-sm ${aiming ? "outline outline-1 outline-amber-300" : ""}`}>
      <HandBoxes crew={mate.id} name={mate.name} tabbable={false} tipOf={infoLine} onUse={(hand) => onUseHand(index, hand)} />
      {weapon && (
        <div className="h-1 w-full overflow-hidden rounded-sm bg-neutral-800/70" title={weapon.name}>
          <div className={`h-full ${left === 0 ? "bg-emerald-500/80" : "bg-emerald-700/60"}`} style={{ width: `${fill * 100}%` }} />
        </div>
      )}
    </div>
  );
}

// The crew: name, bars and hands each - and their portrait, beside their
// stats when the screen is wide (landscape), under them when it's tall
// (portrait).
export function PartyPanel({
  crew,
  compact,
  readyAt,
  aiming,
  onUseHand,
}: {
  crew: Crewmate[];
  compact?: boolean;
  readyAt: number[];
  // the crewmate aiming, if any
  aiming: number | null;
  // a click on a crewmate's hand box: true when it did something
  onUseHand: (index: number, hand: HandIndex) => boolean;
}) {
  useCooldownTick(readyAt);
  if (compact) {
    // translucent strip for the mobile overlay layout: name + bars only
    return (
      <div className="grid grid-cols-4 gap-1">
        {crew.map((c, i) => (
          <div key={c.id} className="border border-neutral-700/70 bg-black/80 px-1 py-0.5 flex gap-1">
            <Avatar mate={c} className="hidden landscape:block w-9 h-9 shrink-0 self-center" />
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className={`text-[11px] font-semibold truncate ${c.hp > 0 ? "text-neutral-200" : "text-red-400"}`}>
                {i + 1}: {c.name}
              </div>
              <Bar value={c.hp} max={c.maxHp} color="#dc2626" />
              <Bar value={c.en} max={c.maxEn} color="#2563eb" />
              <Avatar mate={c} className="hidden portrait:block w-full aspect-[4/3]" />
              <CrewHands mate={c} index={i} readyAt={readyAt[i]} aiming={aiming === i} onUseHand={onUseHand} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {crew.map((c, i) => (
        <div key={c.id} className="border border-neutral-700 bg-neutral-900/80 p-2 flex gap-2">
          <Avatar mate={c} className="hidden landscape:block w-16 h-16 shrink-0 self-start" />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
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
            <Avatar mate={c} className="hidden portrait:block w-full aspect-[4/3]" />
            <CrewHands mate={c} index={i} readyAt={readyAt[i]} aiming={aiming === i} onUseHand={onUseHand} />
          </div>
        </div>
      ))}
    </div>
  );
}
