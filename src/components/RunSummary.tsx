import { ITEM_TYPES } from "../game/items";
import type { Crewmate } from "../game/types";

// what bringing the downed back costs, in words
export function revivalText({ down, medkits, credits, crew }: { down: number; medkits: number; credits: number; crew: number }): string {
  const paid = [medkits ? `${medkits} medkit${medkits > 1 ? "s" : ""}` : "", credits ? `${credits} cr` : ""].filter(Boolean);
  const cost = paid.length ? paid.join(" + ") : "free (nothing left to pay with)";
  const who = down >= crew ? "the whole crew" : `${down} downed crewmate${down > 1 ? "s" : ""}`;
  return `Cloning ${who}: ${cost}.${down < crew ? " Everyone else is patched up." : ""}`;
}

// The end of a run (see useGameState's runEnd): what the party brought off
// the ship, what it's worth, how the crew fared - and on to the next ship.
export function RunSummary({
  exit,
  haul,
  stash,
  kills,
  crew,
  minutes,
  revival,
  onContinue,
}: {
  exit: string;
  haul: Readonly<Record<string, number>>;
  // what was brought home before this run
  stash: Readonly<Record<string, number>>;
  kills: number;
  crew: readonly Crewmate[];
  minutes: number;
  // the downed brought back as clones, and what it costs
  revival: { down: number; medkits: number; credits: number; crew: number };
  onContinue: () => void;
}) {
  const rows = Object.entries(haul)
    .filter(([, count]) => count > 0)
    .map(([item, count]) => ({ item, count, type: ITEM_TYPES[item] }))
    .sort((a, b) => (a.type?.category ?? "").localeCompare(b.type?.category ?? "") || a.item.localeCompare(b.item));
  const worthOf = (items: Readonly<Record<string, number>>) =>
    Object.entries(items).reduce((sum, [item, count]) => sum + count * (ITEM_TYPES[item]?.value ?? 0), 0);
  const worth = worthOf(haul);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 font-mono text-neutral-200" onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-[26rem] max-w-[92%] max-h-[92%] overflow-auto border border-amber-500/60 bg-neutral-950 p-4 text-[12px]">
        <div className="text-amber-200 text-sm tracking-widest">RUN COMPLETE</div>
        <div className="text-neutral-400 mb-3">
          You left the ship through {exit.toLowerCase()} after {Math.max(1, Math.round(minutes))} min.
        </div>

        <div className="text-neutral-500 mb-1">HAUL</div>
        {rows.length ? (
          <table className="w-full mb-1">
            <tbody>
              {rows.map((r) => (
                <tr key={r.item}>
                  <td className="text-neutral-500 pr-2">{r.type?.category ?? "?"}</td>
                  <td>{r.type?.name ?? r.item}</td>
                  <td className="text-right">{r.count}</td>
                  <td className="text-right text-neutral-400 pl-3">{r.count * (r.type?.value ?? 0)} cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-neutral-500 mb-1">Nothing - you came back empty-handed.</div>
        )}
        <div className="flex justify-between border-t border-neutral-700 pt-1 mb-3">
          <span className="text-neutral-400">worth</span>
          <span className="text-amber-200">{worth} cr</span>
        </div>

        <div className="flex justify-between">
          <span className="text-neutral-400">robots destroyed</span>
          <span>{kills}</span>
        </div>
        <div className="flex justify-between mb-3">
          <span className="text-neutral-400">stash after this run</span>
          <span>{worthOf(stash) + worth} cr</span>
        </div>

        <div className="text-neutral-500 mb-1">CREW</div>
        <div className={revival.down ? "mb-1" : "mb-4"}>
          {crew.map((c) => (
            <div key={c.id} className="flex justify-between">
              <span>{c.name}</span>
              <span className={c.hp <= 0 ? "text-red-400" : c.hp < c.maxHp / 2 ? "text-amber-300" : "text-neutral-300"}>
                {c.hp <= 0 ? "down" : `${c.hp}/${c.maxHp} HP`}
              </span>
            </div>
          ))}
        </div>
        {revival.down > 0 && <div className="text-neutral-400 mb-4">{revivalText(revival)}</div>}

        <button type="button" onClick={onContinue} className="w-full border border-amber-500/70 text-amber-200 py-1.5 hover:bg-amber-500/10">
          Next ship
        </button>
      </div>
    </div>
  );
}
