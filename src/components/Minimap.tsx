import type { Direction, GameMap, Vec2 } from "../game/types";

interface MinimapProps {
  map: GameMap;
  pos: Vec2;
  dir: Direction;
}

const ARROW: Record<Direction, string> = { N: "▲", E: "▶", S: "▼", W: "◀" };

export function Minimap({ map, pos, dir }: MinimapProps) {
  return (
    <div className="border border-green-800 bg-black/60 p-2">
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
                  background: cell === "wall" ? "transparent" : cell === "door" ? "#3a1f1f" : "#0a2a12",
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
