import { floorHeight } from "../game/map";
import type { Direction, GameMap, Vec2 } from "../game/types";

interface MinimapProps {
  map: GameMap;
  pos: Vec2;
  dir: Direction;
  // translucent variant for the mobile overlay layout
  compact?: boolean;
}

const ARROW: Record<Direction, string> = { N: "▲", E: "▶", S: "▼", W: "◀" };

export function Minimap({ map, pos, dir, compact }: MinimapProps) {
  // raised floors show lighter, sunken ones darker
  const floor = (x: number, y: number) => {
    const h = floorHeight(map, x, y);
    const g = Math.round(Math.max(18, Math.min(110, 42 + h * 90)));
    const r = Math.round(Math.max(4, 10 + h * 20));
    return compact ? `rgba(${r}, ${g}, 18, 0.55)` : `rgb(${r}, ${g}, 18)`;
  };
  const door = compact ? "rgba(58, 31, 31, 0.7)" : "#3a1f1f";
  return (
    <div className={`border border-green-800 ${compact ? "bg-black/25 p-1" : "bg-black/60 p-2"}`}>
      <div
        className="grid gap-[1px]"
        style={{ gridTemplateColumns: `repeat(${map.width}, 1fr)` }}
      >
        {map.cells.map((row, y) =>
          row.map((cell, x) => {
            const isPlayer = pos.x === x && pos.y === y;
            return (
              <div
                key={`${x}-${y}`}
                className="aspect-square flex items-center justify-center text-[8px] leading-none"
                style={{
                  background: cell === "wall" ? "transparent" : cell === "door" ? door : floor(x, y),
                  color: "#4ade80",
                }}
              >
                {isPlayer ? ARROW[dir] : ""}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
