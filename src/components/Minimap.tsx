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
// box-shadow x/y offsets that draw an inset line along one side
const LADDER_EDGE: Record<Direction, string> = { N: "0 2px", S: "0 -2px", E: "-2px 0", W: "2px 0" };
const LADDER_EDGE_COLOR = "#d4a72c";
const BRIDGE_COLOR = "rgba(120, 190, 130, 0.8)";

export function Minimap({ map, pos, dir, compact }: MinimapProps) {
  // raised floors show lighter, sunken ones darker
  const floor = (x: number, y: number) => {
    const h = floorHeight(map, x, y);
    const g = Math.round(Math.max(18, Math.min(110, 42 + h * 90)));
    const r = Math.round(Math.max(4, 10 + h * 20));
    return compact ? `rgba(${r}, ${g}, 18, 0.55)` : `rgb(${r}, ${g}, 18)`;
  };
  const door = compact ? "rgba(58, 31, 31, 0.7)" : "#3a1f1f";
  // a ladder shows as a yellow edge on its foot cell's side
  const ladderEdges = (x: number, y: number) =>
    (map.ladders ?? [])
      .filter((l) => l.cell.x === x && l.cell.y === y)
      .map((l) => `inset ${LADDER_EDGE[l.wall]} 0 ${LADDER_EDGE_COLOR}`)
      .join(", ") || undefined;
  // a bridge: a band along its axis across the cell
  const bridgeStripe = (x: number, y: number) => {
    const bridge = map.bridges?.find((b) => b.cell.x === x && b.cell.y === y);
    if (!bridge) return undefined;
    const across = bridge.axis === "EW" ? "to bottom" : "to right";
    return `linear-gradient(${across}, transparent 30%, ${BRIDGE_COLOR} 30%, ${BRIDGE_COLOR} 70%, transparent 70%)`;
  };
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
                  boxShadow: ladderEdges(x, y),
                  backgroundImage: bridgeStripe(x, y),
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
