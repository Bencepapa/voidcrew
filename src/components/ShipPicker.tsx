import { SHIP_CLASSES, lootHint } from "../game/ships";
import type { ShipOffer } from "../game/ships";
import type { ShipMood } from "../game/variation";

// The ships within reach (see ships.ts): the crew picks one to board. Each
// card shows what the scan made out - the rest is unknown until aboard.
const MOOD_LABEL: Record<keyof ShipMood, string> = { light: "Power", threat: "Threat", clutter: "Cargo" };
const MOOD_TEXT: Record<string, string> = {
  dark: "dark",
  dim: "emergency lights",
  bright: "lit",
  low: "low",
  medium: "medium",
  high: "high",
  sparse: "stripped",
  normal: "some",
  cluttered: "plenty",
};
const tone = (key: keyof ShipMood, level: string) =>
  key === "threat" ? (level === "high" ? "text-red-400" : level === "low" ? "text-emerald-300" : "text-amber-300") : "text-neutral-200";

export function ShipPicker({ offers, onPick, onBack }: { offers: ShipOffer[]; onPick: (ship: ShipOffer) => void; onBack: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-neutral-950 font-mono text-neutral-200 overflow-auto">
      <div className="w-[60rem] max-w-[96%] p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-amber-200 text-sm tracking-widest">LONG-RANGE SCAN - DERELICTS IN REACH</div>
          <button type="button" onClick={onBack} className="text-[11px] text-neutral-400 hover:text-neutral-100">
            ← back to base
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {offers.map((ship) => {
            const type = SHIP_CLASSES[ship.classId];
            const deep = ship.depth > Math.min(...offers.map((o) => o.depth));
            return (
              <div key={ship.seed} className={`border p-3 text-[12px] flex flex-col ${deep ? "border-red-500/50" : "border-neutral-600"} bg-neutral-950`}>
                <div className="text-amber-200">{ship.name}</div>
                <div className="text-neutral-400 mb-2">
                  {type.name} · {deep ? <span className="text-red-400">deeper space (depth {ship.depth})</span> : `depth ${ship.depth}`}
                </div>
                <div className="text-neutral-500 mb-2 min-h-[2.5rem]">{type.blurb}</div>
                {(Object.keys(MOOD_LABEL) as (keyof ShipMood)[]).map((key) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-neutral-400">{MOOD_LABEL[key]}</span>
                    {ship.known[key] ? (
                      <span className={tone(key, ship.mood[key])}>{MOOD_TEXT[ship.mood[key]]}</span>
                    ) : (
                      <span className="text-neutral-600">???</span>
                    )}
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-neutral-400">Likely finds</span>
                  <span>{lootHint(ship.classId).join(", ") || "mixed"}</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-neutral-400">Loot</span>
                  <span>{ship.lootScale > 1 ? `+${Math.round((ship.lootScale - 1) * 100)}%` : "standard"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onPick(ship)}
                  className="mt-auto border border-amber-500/70 text-amber-200 py-1.5 hover:bg-amber-500/10"
                >
                  Board
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
