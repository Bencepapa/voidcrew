import { useRef } from "react";
import type { ReactElement } from "react";
import { ceilingHeight, doorAt, floorHeight, windowPanels } from "../game/map";
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
  // editing the map: the whole map is shown with its bounds, and a click on a
  // cell edits it (the right button: the other way) - `surface` says whether
  // the floor or the ceiling is meant, and what the cells are shaded by
  edit?: {
    // what a click does now, in words ("Raise the", "Paint the"...): the tool's
    verb: string;
    surface: "floor" | "ceiling";
    onSurface: (surface: "floor" | "ceiling") => void;
    onCell: (cell: Vec2, alt: boolean) => void;
  };
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
export function Minimap({ map, pos, dir, compact, loot, locked, showRestricted, edit }: MinimapProps) {
  const radius = compact ? RADIUS_COMPACT : RADIUS;
  const span = radius * 2 + 1;

  // Void Fantasy's map: a parchment chart - the rooms washed yellow, the walls
  // hatched in ink, the doors thick bars across their cells
  const paper = map.world === "fantasy";
  const INK = "#c9a24a";
  const hatchId = `hatch-${compact ? "c" : "m"}`;
  const hatchedWalls: ReactElement[] = [];
  const doorBars: ReactElement[] = [];

  // turn the arrow the short way round: keep a running angle
  const angleRef = useRef(FACING_DEGREES[dir]);
  const target = FACING_DEGREES[dir];
  const delta = ((((target - angleRef.current) % 360) + 540) % 360) - 180;
  angleRef.current += delta;

  // raised floors show lighter, sunken ones darker
  const floor = (x: number, y: number) => {
    const h = floorHeight(map, x, y);
    if (paper) return `hsl(46 ${Math.round(78 + Math.min(10, h * 8))}% ${Math.round(Math.max(48, Math.min(80, 72 - h * 14)))}%)`;
    const g = Math.round(Math.max(18, Math.min(110, 42 + h * 90)));
    const r = Math.round(Math.max(4, 10 + h * 20));
    return `rgb(${r}, ${g}, 18)`;
  };

  // ceilings show lighter the higher they are (while editing them)
  const ceilingShade = (x: number, y: number) => {
    const h = ceilingHeight(map, x, y);
    const g = Math.round(Math.max(30, Math.min(200, 40 + h * 45)));
    return `rgb(30, ${Math.round(g * 0.7)}, ${g})`;
  };

  const cells: ReactElement[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[y][x];
      if (cell === "wall") {
        if (paper) {
          // hatched, where it borders a room (or all of them, when editing)
          const borders = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => (dx || dy) && map.cells[y + dy]?.[x + dx] !== undefined && map.cells[y + dy][x + dx] !== "wall"));
          if (edit || borders) hatchedWalls.push(<rect key={`w${x},${y}`} x={x} y={y} width={1} height={1} fill={`url(#${hatchId})`} />);
          continue;
        }
        // (when editing, every wall cell shows too: it can be dug out from here)
        if (edit) cells.push(<rect key={`c${x},${y}`} x={x + 0.04} y={y + 0.04} width={0.92} height={0.92} fill="#171a17" />);
        continue;
      }
      // too low for the party (a duct the cleaning drones use): as good as
      // a wall to it
      if (ceilingHeight(map, x, y) - floorHeight(map, x, y) < MIN_HEADROOM - 1e-6) continue;
      if (paper && cell === "door") {
        // a thick bar across the doorway (a locked one in red ink), on the room's yellow
        const facing = doorAt(map, x, y).facing;
        const horizontal = facing === "N" || facing === "S";
        cells.push(<rect key={`c${x},${y}`} x={x} y={y} width={1} height={1} fill={floor(x, y)} />);
        doorBars.push(
          <rect
            key={`d${x},${y}`}
            x={horizontal ? x + 0.02 : x + 0.36}
            y={horizontal ? y + 0.36 : y + 0.02}
            width={horizontal ? 0.96 : 0.28}
            height={horizontal ? 0.28 : 0.96}
            fill={locked?.includes(`${x},${y}`) ? "#9c1f18" : "#3a240a"}
            stroke={INK}
            strokeWidth={0.04}
          />,
        );
        continue;
      }
      cells.push(
        <rect
          key={`c${x},${y}`}
          x={paper ? x : x + 0.04}
          y={paper ? y : y + 0.04}
          width={paper ? 1 : 0.92}
          height={paper ? 1 : 0.92}
          fill={
            cell === "door" ? (locked?.includes(`${x},${y}`) ? LOCKED_COLOR : DOOR_COLOR) : edit?.surface === "ceiling" ? ceilingShade(x, y) : floor(x, y)
          }
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

  if (edit) {
    // the whole map, at one scale: bounds drawn, clickable
    const W = map.width;
    const H = map.height;
    const click = (e: React.MouseEvent<SVGSVGElement>, alt: boolean) => {
      const svg = e.currentTarget;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      e.preventDefault();
      edit.onCell({ x, y }, alt);
    };
    return (
      <div className="border border-green-800 bg-black/60 p-2 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <div className="text-[10px] font-mono text-neutral-300">
          Click: <span className="text-amber-200">{edit.verb}</span>{" "}
          <span className={edit.surface === "floor" ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
            {edit.surface === "floor" ? "FLOOR" : "CEILING"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono">
          {(["floor", "ceiling"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => edit.onSurface(s)}
              className={`border rounded-sm px-2 py-0.5 ${edit.surface === s ? (s === "floor" ? "border-emerald-400 bg-emerald-400/20 text-emerald-200" : "border-sky-400 bg-sky-400/20 text-sky-200") : "border-neutral-600 text-neutral-300 hover:bg-neutral-800"}`}
              title={`Clicks here edit the ${s}s (right-click: the other way)`}
            >
              {s === "floor" ? "Floor" : "Ceiling"}
            </button>
          ))}
          <span className="text-neutral-500 ml-auto">
            {W} x {H}
          </span>
        </div>
        <svg
          viewBox={`-0.5 -0.5 ${W + 1} ${H + 1}`}
          className="block w-full cursor-crosshair"
          style={{ aspectRatio: `${W + 1} / ${H + 1}` }}
          aria-label={`Map: ${map.name}`}
          onClick={(e) => click(e, false)}
          onContextMenu={(e) => click(e, true)}
        >
        {paper && (
          <defs>
            <pattern id={hatchId} width={0.34} height={0.34} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={0.34} height={0.34} fill="#241a0f" />
              <line x1={0} y1={0} x2={0} y2={0.34} stroke="#5a4220" strokeWidth={0.09} />
            </pattern>
          </defs>
        )}
          {paper && <rect x={-0.5} y={-0.5} width={W + 1} height={H + 1} fill="#1c140c" />}
          {cells}
          {hatchedWalls}
          {doorBars}
          {restricted}
          {bridges}
          {ladders}
          {windows}
          <rect x={0} y={0} width={W} height={H} fill="none" stroke={edit.surface === "floor" ? "#4ade80" : "#38bdf8"} strokeWidth={0.1} strokeDasharray="0.5 0.3" />
          {/* the deck's start: a flag-like marker, pointing the way the party faces there */}
          <g transform={`translate(${map.start.cell.x + 0.5} ${map.start.cell.y + 0.5}) rotate(${FACING_DEGREES[map.start.facing]})`}>
            <circle r={0.46} fill="none" stroke="#38bdf8" strokeWidth={0.1} />
            <polygon points="0,-0.36 0.2,0.1 -0.2,0.1" fill="#38bdf8" />
          </g>
          <g transform={`translate(${pos.x + 0.5} ${pos.y + 0.5}) rotate(${FACING_DEGREES[dir]})`}>
            <polygon points="0,-0.42 0.34,0.34 0,0.16 -0.34,0.34" fill={paper ? "#9c1f18" : PLAYER_COLOR} stroke={paper ? "#3a0d0a" : "#062b12"} strokeWidth={0.07} strokeLinejoin="round" />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`border ${paper ? "border-[#b8902f] bg-[#1c140c]" : `border-green-800 ${compact ? "bg-black/25" : "bg-black/60"}`} ${compact ? "p-1" : "p-2"}`}
    >
      <svg
        viewBox={`0 0 ${span} ${span}`}
        className="block w-full aspect-square"
        style={{ opacity: compact ? 0.8 : 1 }}
        aria-label={`Map: ${map.name}`}
      >
        {/* the map, slid so the player's cell sits in the middle */}
        {paper && (
          <defs>
            <pattern id={hatchId} width={0.34} height={0.34} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={0.34} height={0.34} fill="#241a0f" />
              <line x1={0} y1={0} x2={0} y2={0.34} stroke="#5a4220" strokeWidth={0.09} />
            </pattern>
          </defs>
        )}
        <g
          style={{
            transform: `translate(${radius - pos.x}px, ${radius - pos.y}px)`,
            transition: "transform 180ms ease-out",
          }}
        >
          {cells}
          {hatchedWalls}
          {doorBars}
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
            fill={paper ? "#9c1f18" : PLAYER_COLOR}
            stroke={paper ? "#3a0d0a" : "#062b12"}
            strokeWidth={0.07}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}
