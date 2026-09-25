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
  const floor = compact ? "rgba(10, 42, 18, 0.55)" : "#0a2a12";
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
                  background: cell === "wall" ? "transparent" : cell === "door" ? door : floor,
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
