import { useState } from "react";
import type { ReactNode } from "react";

export interface MapListItem { key: string; place: string; name: string; active?: boolean; node?: ReactNode; onPick: () => void }

// Maps listed by place, as "Place – Name": one collapsible group per place
// (the one holding the open map starts open). Used for the local and shared lists.
export function MapList({ items, itemClass, activeClass }: { items: MapListItem[]; itemClass: string; activeClass: string }) {
  const places = [...new Set(items.map((i) => i.place))].sort((a, b) => a.localeCompare(b));
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const hasActive = (place: string) => items.some((i) => i.place === place && i.active);
  return (
    <div className="flex w-full flex-col gap-1">
      {places.map((place) => {
        const group = items.filter((i) => i.place === place).sort((a, b) => a.name.localeCompare(b.name));
        // (untouched groups: open only when they hold the active map; one the user toggled keeps its state)
        const open = place in closed ? !closed[place] : hasActive(place);
        return (
          <details key={place} open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) setClosed((c) => ({ ...c, [place]: !o })); }} className="rounded border border-neutral-700">
            <summary className="cursor-pointer select-none px-2 py-0.5 text-xs font-semibold text-neutral-200">{place} <span className="text-neutral-500">({group.length})</span></summary>
            <div className="flex flex-col gap-0.5 p-1">
              {group.map((i) => (
                <button key={i.key} type="button" className={`${itemClass} text-left ${i.active ? activeClass : ""}`} onClick={i.onPick}>
                  {i.node ?? `${place} – ${i.name}`}
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
