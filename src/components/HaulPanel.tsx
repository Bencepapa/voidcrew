import { ITEM_TYPES } from "../game/items";

// The run's haul (see useGameState): what the party has taken so far, how
// many of each, and what it's all worth at the base.
export function HaulPanel({ haul, onClose }: { haul: Readonly<Record<string, number>>; onClose: () => void }) {
  const rows = Object.entries(haul)
    .filter(([, count]) => count > 0)
    .map(([item, count]) => ({ item, count, type: ITEM_TYPES[item] }))
    .sort((a, b) => (a.type?.category ?? "").localeCompare(b.type?.category ?? "") || a.item.localeCompare(b.item));
  const worth = rows.reduce((sum, r) => sum + r.count * (r.type?.value ?? 0), 0);
  return (
    <div
      className="absolute top-3 right-3 z-30 w-60 bg-black/85 border border-neutral-600 rounded-sm p-2 font-mono text-[11px] text-neutral-200"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-amber-200">HAUL</span>
        <button type="button" onClick={onClose} className="px-1 text-neutral-400 hover:text-neutral-100" title="Close (I)">
          ×
        </button>
      </div>
      {rows.length ? (
        <table className="w-full">
          <tbody>
            {rows.map((r) => (
              <tr key={r.item}>
                <td className="text-neutral-500 pr-1">{r.type?.category ?? "?"}</td>
                <td>{r.type?.name ?? r.item}</td>
                <td className="text-right">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-neutral-500">Nothing yet - search the crates (Space).</div>
      )}
      <div className="mt-1 pt-1 border-t border-neutral-700 flex justify-between">
        <span className="text-neutral-400">worth</span>
        <span>{worth} cr</span>
      </div>
    </div>
  );
}
