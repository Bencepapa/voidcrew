import { useRef } from "react";
import type { ReactElement } from "react";
import { ceilingHeight, floorHeight, windowPanels } from "../game/map";
import { MIN_HEADROOM } from "../game/heights";
import type { Direction, GameMap, Vec2 } from "../game/types";

interface MinimapProps {
  map: GameMap;
  pos: Vec2;
  dir: Direction;
  // translucent variant for the mobile overlay layout
  compact?: boolean;
  // where loot lies, a little or a lot (see useGameState's lootMarks)
  loot?: { x: number; y: number; big: boolean }[];
  // the door cells still locked ("x,y")
  locked?: string[];
  // the restricted cells shaded (the editor: the crew finds out the hard
  // way)
  showRestricted?: boolean;
}

// how many cells the window shows either side of the player
const RADIUS = 5;
const RADIUS_COMPACT = 4;

const FACING_DEGREES: Record<Direction, number> = { N: 0, E: 90, S: 180, W: 270 };
// a side of a cell as a line, in cell units from its top-left corner
const EDGE: Record<Direction, [number, number, number, number]> = {
  N: [0.08, 0.1, 0.92, 0.1],
  S: [0.08, 0.9, 0.92, 0.9],
  E: [0.9, 0.08, 0.9, 0.92],
  W: [0.1, 0.08, 0.1, 0.92],
};
const LADDER_COLOR = "#d4a72c";
const WINDOW_COLOR = "#9fc4ff";
const BRIDGE_COLOR = "rgba(120, 190, 130, 0.85)";
const DOOR_COLOR = "#5a2626";
const PLAYER_COLOR = "#7dffa8";
const LOCKED_COLOR = "#a8741a";
const LOOT_COLOR = "#e9c46a";
const BIG_LOOT_COLOR = "#ffd84a";

// A window onto the map around the player (who stays in its middle, the
// map sliding past), drawn as SVG in cell units: floors shaded by height,
// doors, ladders (yellow) and windows (blue) on their cell's side, bridges
// as a band along their axis, and the party as an arrow turning smoothly.
export function Minimap({ map, pos, dir, compact, loot, locked, showRestricted }: MinimapProps) {
  const radius = compact ? RADIUS_COMPACT : RADIUS;
  const span = radius * 2 + 1;

  // turn the arrow the short way round: keep a running angle
  const angleRef = useRef(FACING_DEGREES[dir]);
  const target = FACING_DEGREES[dir];
  const delta = ((((target - angleRef.current) % 360) + 540) % 360) - 180;
  angleRef.current += delta;

  // raised floors show lighter, sunken ones darker
  const floor = (x: number, y: number) => {
    const h = floorHeight(map, x, y);
    const g = Math.round(Math.max(18, Math.min(110, 42 + h * 90)));
    const r = Math.round(Math.max(4, 10 + h * 20));
    return `rgb(${r}, ${g}, 18)`;
  };

  const cells: ReactElement[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[y][x];
      if (cell === "wall") continue;
      // too low for the party (a duct the cleaning drones use): as good as
      // a wall to it
      if (ceilingHeight(map, x, y) - floorHeight(map, x, y) < MIN_HEADROOM - 1e-6) continue;
      cells.push(
        <rect
          key={`c${x},${y}`}
          x={x + 0.04}
          y={y + 0.04}
          width={0.92}
          height={0.92}
          fill={cell === "door" ? (locked?.includes(`${x},${y}`) ? LOCKED_COLOR : DOOR_COLOR) : floor(x, y)}
        />,
      );
    }
  }
  const restricted = showRestricted
    ? (map.restricted ?? []).map((c) => (
        <rect key={`r${c.x},${c.y}`} x={c.x + 0.04} y={c.y + 0.04} width={0.92} height={0.92} fill="rgba(220, 40, 40, 0.45)" />
      ))
    : [];
  const bridges = (map.bridges ?? []).map((b) => (
    <rect
      key={`b${b.cell.x},${b.cell.y}`}
      x={b.cell.x + (b.axis === "EW" ? 0 : 0.3)}
      y={b.cell.y + (b.axis === "EW" ? 0.3 : 0)}
      width={b.axis === "EW" ? 1 : 0.4}
      height={b.axis === "EW" ? 0.4 : 1}
      fill={BRIDGE_COLOR}
    />
  ));
  const edge = (key: string, cell: Vec2, side: Direction, color: string) => {
    const [x1, y1, x2, y2] = EDGE[side];
    return (
      <line
        key={key}
        x1={cell.x + x1}
        y1={cell.y + y1}
        x2={cell.x + x2}
        y2={cell.y + y2}
        stroke={color}
        strokeWidth={0.14}
        strokeLinecap="round"
      />
    );
  };
  const ladders = (map.ladders ?? []).map((l) => edge(`l${l.cell.x},${l.cell.y},${l.wall}`, l.cell, l.wall, LADDER_COLOR));
  const windows = windowPanels(map).map((p) => edge(`w${p.cell.x},${p.cell.y},${p.wall}`, p.cell, p.wall, WINDOW_COLOR));
  // loot: a dot for a little, a glowing diamond for a lot (one mark a cell,
  // the bigger)
  const lootCells = new Map<string, { x: number; y: number; big: boolean }>();
  for (const m of loot ?? []) {
    const key = `${m.x},${m.y}`;
    if (!lootCells.get(key)?.big) lootCells.set(key, m);
  }
  const lootMarks = [...lootCells.values()].map((m) =>
    m.big ? (
      <polygon
        key={`loot${m.x},${m.y}`}
        points={`${m.x + 0.5},${m.y + 0.22} ${m.x + 0.78},${m.y + 0.5} ${m.x + 0.5},${m.y + 0.78} ${m.x + 0.22},${m.y + 0.5}`}
        fill={BIG_LOOT_COLOR}
        stroke="#5a3d00"
        strokeWidth={0.05}
        style={{ filter: "drop-shadow(0 0 0.15px #ffd84a)" }}
      />
    ) : (
      <circle key={`loot${m.x},${m.y}`} cx={m.x + 0.5} cy={m.y + 0.5} r={0.12} fill={LOOT_COLOR} />
    ),
  );

  return (
    <div className={`border border-green-800 ${compact ? "bg-black/25 p-1" : "bg-black/60 p-2"}`}>
      <svg
        viewBox={`0 0 ${span} ${span}`}
        className="block w-full aspect-square"
        style={{ opacity: compact ? 0.8 : 1 }}
        aria-label={`Map: ${map.name}`}
      >
        {/* the map, slid so the player's cell sits in the middle */}
        <g
          style={{
            transform: `translate(${radius - pos.x}px, ${radius - pos.y}px)`,
            transition: "transform 180ms ease-out",
          }}
        >
          {cells}
          {restricted}
          {bridges}
          {ladders}
          {windows}
          {lootMarks}
        </g>
        {/* the party: an arrowhead with a notched tail, pointing its way */}
        <g
          style={{
            transform: `translate(${radius + 0.5}px, ${radius + 0.5}px) rotate(${angleRef.current}deg)`,
            transition: "transform 180ms ease-out",
          }}
        >
          <polygon
            points="0,-0.42 0.34,0.34 0,0.16 -0.34,0.34"
            fill={PLAYER_COLOR}
            stroke="#062b12"
            strokeWidth={0.07}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}
