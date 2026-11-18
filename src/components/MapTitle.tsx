import { useEffect, useState } from "react";
import type { GameMap } from "../game/types";

// The "Place – Name" caption shown for a few seconds on entering a map (fades
// in and out). Mount it with key={map.id}: a new map shows it again. It waits
// a moment so the loading screen is gone first.
const DELAY_MS = 1400;
const SHOWN_MS = 3600;

export function MapTitle({ map }: { map: GameMap }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = window.setTimeout(() => setShown(true), DELAY_MS);
    const off = window.setTimeout(() => setShown(false), DELAY_MS + SHOWN_MS);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, []);
  if (!map.showTitle || !shown) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-[18%] z-30 text-center"
      style={{ animation: `map-title ${SHOWN_MS}ms ease-in-out forwards` }}
    >
      <span className="px-4 text-2xl tracking-widest text-white" style={{ textShadow: "0 2px 8px #000, 0 0 2px #000" }}>
        {map.place} – {map.name}
      </span>
    </div>
  );
}
