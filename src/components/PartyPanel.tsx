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

// each role's color, behind a crewmate with no portrait yet
const ROLE_TINT: Record<string, string> = {
  MARINE: "#5b2121",
  ENGINEER: "#5a4214",
  ANDROID: "#1f3357",
  MEDIC: "#1d4a2e",
};

// A crewmate's portrait: public/portraits/<id>.webp (made by
// scripts/make-portraits.ts) - or, until there is one, their initial on
// their role's color. Greyed and reddened when down.
function Avatar({ mate, className }: { mate: Crewmate; className: string }) {
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

// a crewmate's weapon button: its name over a bar that fills as it cools
// down; bright when ready - and, with a second weapon, a button beside it
// to switch (a finger's width on a phone)
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
    <div className="pointer-events-auto flex gap-0.5">
      <button
        onClick={() => onUse(index)}
        disabled={!ready}
        className={`relative flex-1 min-w-0 overflow-hidden border text-left rounded-sm ${
          compact ? "text-[8px] px-1 py-0.5" : "text-[10px] px-1.5 py-1"
        } ${aiming ? "border-amber-300 text-amber-200" : ready ? "border-emerald-500/70 text-emerald-200 hover:bg-emerald-900/30" : "border-neutral-700 text-neutral-500"}`}
      >
        <div className="absolute inset-y-0 left-0 bg-emerald-700/25" style={{ width: `${fill * 100}%` }} />
        <span className="relative block truncate">
          [{index + 1}] {weapon.name}
        </span>
      </button>
      {canSwitch(mate.id) && (
        <button
          title={`Switch weapon (Shift+${index + 1})`}
          aria-label={`Switch ${mate.name}'s weapon`}
          onClick={() => switchWeapon(mate.id)}
          disabled={aiming}
          className={`shrink-0 flex items-center justify-center border border-neutral-600 rounded-sm bg-black/40 text-neutral-300 hover:text-amber-200 disabled:opacity-40 ${
            compact ? "w-7 text-[11px]" : "w-6 text-[11px]"
          }`}
        >
          ⇄
        </button>
      )}
    </div>
  );
}

// The crew: name, bars and weapon each - and their portrait, beside their
// stats when the screen is wide (landscape), under them when it's tall
// (portrait).
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
          <div key={c.id} className="border border-neutral-700/60 bg-black/30 px-1 py-0.5 flex gap-1">
            <Avatar mate={c} className="hidden landscape:block w-9 h-9 shrink-0 self-center" />
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className={`text-[9px] truncate ${c.hp > 0 ? "text-neutral-300" : "text-red-400"}`}>
                {i + 1}: {c.name}
              </div>
              <Bar value={c.hp} max={c.maxHp} color="#dc2626" />
              <Bar value={c.en} max={c.maxEn} color="#2563eb" />
              <Avatar mate={c} className="hidden portrait:block w-full aspect-[4/3]" />
              <WeaponButton mate={c} index={i} readyAt={readyAt[i]} aiming={aiming === i} onUse={onWeapon} compact />
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
            <WeaponButton mate={c} index={i} readyAt={readyAt[i]} aiming={aiming === i} onUse={onWeapon} />
          </div>
        </div>
      ))}
    </div>
  );
}
