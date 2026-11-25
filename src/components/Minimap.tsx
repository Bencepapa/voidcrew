import { t } from "../i18n";
import { memo, useId, useState, useRef } from "react";
import type { ReactElement } from "react";
import { ceilingHeight, doorAt, floorHeight, windowPanels } from "../game/map";
import { MIN_HEADROOM } from "../game/heights";
import type { Direction, GameMap, Vec2 } from "../game/types";
import type { Rect } from "../editor/mapEdits";

import { TEXTURE_SETS, isTextureSetId } from "../render/textureSets";
import { CATEGORY_COLORS, type Category } from "../editor/categoryColors";
import { PROP_TYPES } from "../game/props";
import { operableLinks, operableSources } from "../game/operables";
import { fenceFormOf, fenceIndex, fenceMarks } from "../game/fences";
import { useSightCells } from "../render/sightStore";
import { SPEAKER_PATH, WAVES_PATH } from "../render/soundGlyph";

// the operable props' links by what they work: doors amber, wall traps red, emitters orange, NPCs purple, items green
const LINK_COLORS: Record<string, string> = { door: "#fbbf24", trap: "#ff5a3c", emitter: "#ff9a3c", spawn: "#c084fc", item: "#4ade80" };

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
    // Optional: categories hidden by the editor layer controls.
    hiddenCategories?: ReadonlySet<string>;
    // Optional: select a placed object by its array index; alt means right-click.
    onMarker?: (category: string, index: number, alt: boolean) => void;
    surface: "floor" | "ceiling";
    onSurface: (surface: "floor" | "ceiling") => void;
    onCell: (cell: Vec2, alt: boolean) => void;
    // the zoomed minimap fills its space (the editor makes room for it) and
    // takes a dragged block of cells as a selection
    zoomed?: boolean;
    onZoom?: () => void;
    selection?: Rect | null;
    onSelect?: (rect: Rect | null) => void;
    // an area being pasted (see editor/useAreaClipboard): its outline and cells follow the pointer cell, which is
    // reported through onHover (null: it left the map)
    paste?: { w: number; h: number; at: Vec2; layout: string[] } | null;
    onHover?: (cell: Vec2 | null) => void;
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

// A window onto the map around the player (who stays in its middle, the
// map sliding past), drawn as SVG in cell units: floors shaded by height,
// doors, ladders (yellow) and windows (blue) on their cell's side, bridges
// as a band along their axis, and the party as an arrow turning smoothly.
function MinimapImpl({ map, pos, dir, compact, loot, locked, showRestricted, edit }: MinimapProps) {
  const uid = useId().replace(/:/g, "");
  // (the plain minimap stays the flat chart; textures are for the enlarged one, when textures are being set)
  const [textures, setTextures] = useState(false);
  // the cells the engine counts as seen from the party, shown on the editing minimap (a button next to Floor / Ceiling)
  const [showSight, setShowSight] = useState(false);
  const sightCells = useSightCells();
  const textured = !!edit?.zoomed && textures;
  const patterns = new Map<string, string>();
  const textureFill = (x: number, y: number) => {
    const local = map.floorAt?.(x, y);
    const id = isTextureSetId(local) ? local : isTextureSetId(map.textures?.floor) ? map.textures.floor : "floor1";
    if (!patterns.has(id)) patterns.set(id, `${uid}-floor-${id}`);
    return `url(#${patterns.get(id)})`;
  };
  const visible = (category: Category) => !edit?.hiddenCategories?.has(category);
  const radius = compact ? RADIUS_COMPACT : RADIUS;
  const span = radius * 2 + 1;

  // Void Fantasy's map: a parchment chart - the rooms washed yellow, the walls
  // hatched in ink, the doors thick bars across their cells
  const paper = map.world === "fantasy";
  const INK = "#c9a24a";
  const hatchId = `${uid}-hatch`;
  const hatchedWalls: ReactElement[] = [];
  const doorBars: ReactElement[] = [];

  // turn the arrow the short way round: keep a running angle
  const angleRef = useRef(FACING_DEGREES[dir]);
  // a drag across the editing minimap: where it started, and whether it went on to be a block
  const dragRef = useRef<{ from: Vec2; moved: boolean } | null>(null);
  const justDragged = useRef(false);
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
      if (textured) {
        cells.push(<rect key={`texture${x},${y}`} x={x} y={y} width={1} height={1} fill={textureFill(x, y)} />);
        const h = edit?.surface === "ceiling" ? ceilingHeight(map, x, y) - 1 : floorHeight(map, x, y);
        cells.push(<rect key={`tint${x},${y}`} x={x} y={y} width={1} height={1} fill={h >= 0 ? "white" : "black"} opacity={Math.min(0.65, Math.abs(h) * 0.3)} />);
      }
      // too low for the party (a duct the cleaning drones use): as good as
      // a wall to it
      if (ceilingHeight(map, x, y) - floorHeight(map, x, y) < MIN_HEADROOM - 1e-6) continue;
      if (paper && cell === "door") {
        // a thick bar across the doorway (a locked one in red ink), on the room's yellow
        const facing = doorAt(map, x, y).facing;
        const horizontal = facing === "N" || facing === "S";
        cells.push(<rect key={`c${x},${y}`} x={x} y={y} width={1} height={1} fill={textured ? "transparent" : floor(x, y)} />);
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
            textured && cell !== "door" ? "transparent" : cell === "door" && visible("door") ? (locked?.includes(`${x},${y}`) ? LOCKED_COLOR : DOOR_COLOR) : edit?.surface === "ceiling" ? ceilingShade(x, y) : floor(x, y)
          }
        />,
      );
    }
  }
  const textureDefs = <defs>{[...patterns].map(([id, pattern]) => <pattern key={id} id={pattern} width={1} height={1} patternUnits="userSpaceOnUse"><image href={TEXTURE_SETS[id as keyof typeof TEXTURE_SETS].diffuse} width={1} height={1} preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} /></pattern>)}</defs>;
  const markers: ReactElement[] = [];
  const marker = (category: Category, index: number, cell: Vec2, dx = 0, dy = 0, facing?: Direction) => {
    if (!edit || edit.hiddenCategories?.has(category)) return;
    const color = CATEGORY_COLORS[category];
    const activate = (e: React.MouseEvent<SVGGElement>, alt: boolean) => {
      if (!edit.onMarker) return;
      e.preventDefault(); e.stopPropagation();
      if (justDragged.current) { justDragged.current = false; return; }
      edit.onMarker(category, index, alt);
    };
    markers.push(<g key={`${category}-${index}`} transform={`translate(${cell.x + 0.5 + dx} ${cell.y + 0.5 + dy})`} pointerEvents={edit.onMarker ? "auto" : "none"} onClick={e => activate(e, false)} onContextMenu={e => activate(e, true)}>
      <circle r={0.27} fill="transparent" />
      <g fill={color} stroke="#151515" strokeWidth={0.045}>
        {category === "sound" ? <g transform="scale(0.2)" strokeWidth={0.22}>
          <path d={SPEAKER_PATH} />
          <path d={WAVES_PATH} fill="none" stroke={color} strokeWidth={0.2} strokeLinecap="round" />
        </g> : category === "prop" ? <rect x={-0.14} y={-0.14} width={0.28} height={0.28} /> : category === "decal" ? <path d="M -0.15 0 L 0.15 0" stroke={color} strokeWidth={0.1} /> : category === "item" || category === "exit" || category === "chanceWall" ? <path d="M 0 -0.19 L 0.17 0 L 0 0.19 L -0.17 0 Z" /> : <circle r={0.13} />}
        {facing && <path transform={`rotate(${FACING_DEGREES[facing]})`} d="M 0 0 L 0 -0.3" stroke={color} strokeWidth={0.08} />}
      </g>
    </g>);
  };
  const anchor = (side: string): [number, number] => [side.includes("E") ? 0.38 : side.includes("W") ? -0.38 : 0, side.includes("S") ? 0.38 : side.includes("N") ? -0.38 : 0];
  map.props?.forEach((p, i) => { const a = PROP_TYPES[p.prop]?.wall ? anchor(p.at) : [0, 0]; marker("prop", i, p.cell, a[0] + (p.offset?.[0] ?? 0), a[1] + (p.offset?.[1] ?? 0)); });
  map.decals?.forEach((d, i) => { const a = anchor(d.surface); marker("decal", i, d.cell, a[0], a[1]); });
  map.actors?.forEach((a, i) => marker("npc", i, a.cell, 0, 0, a.facing));
  map.items?.forEach((a, i) => marker("item", i, a.cell, a.offset?.[0] ?? 0.2, a.offset?.[1] ?? 0.2));
  map.lights?.forEach((a, i) => marker("light", i, a, a.pos?.[0] ?? 0, a.pos?.[2] ?? 0));
  map.smokes?.forEach((a, i) => marker("smoke", i, a.cell, a.pos[0], a.pos[2]));
  map.sounds?.forEach((a, i) => marker("sound", i, a, a.pos?.[0] ?? 0, a.pos?.[2] ?? 0));
  map.exits?.forEach((a, i) => marker("exit", i, a.cell));
  // (stairs wear the exits' marker - the same layer toggle)
  map.stairs?.forEach((a, i) => marker("exit", (map.exits?.length ?? 0) + i, a.cell));
  map.chanceWalls?.forEach((a, i) => marker("chanceWall", i, a.cell));
  const restricted = showRestricted && visible("restricted")
    ? (map.restricted ?? []).map((c) => (
        <rect key={`r${c.x},${c.y}`} x={c.x + 0.04} y={c.y + 0.04} width={0.92} height={0.92} fill="rgba(220, 40, 40, 0.45)" />
      ))
    : [];
  const bridges = (visible("bridge") ? map.bridges ?? [] : []).map((b) => (
    <rect
      key={`b${b.cell.x},${b.cell.y}`}
      x={b.cell.x + (b.axis === "EW" ? 0 : 0.3)}
      y={b.cell.y + (b.axis === "EW" ? 0.3 : 0)}
      width={b.axis === "EW" ? 1 : 0.4}
      height={b.axis === "EW" ? 0.4 : 1}
      fill={edit ? CATEGORY_COLORS.bridge : BRIDGE_COLOR}
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
  const ladders = (visible("ladder") ? map.ladders ?? [] : []).map((l) => edge(`l${l.cell.x},${l.cell.y},${l.wall}`, l.cell, l.wall, edit ? CATEGORY_COLORS.ladder : LADDER_COLOR));
  const windows = windowPanels(map).map((p) => edge(`w${p.cell.x},${p.cell.y},${p.wall}`, p.cell, p.wall, WINDOW_COLOR));
  // the fences and blocks (see game/fences.ts), in play too: a block is an amber square with a cross (dashed when it is
  // see-through), a fence a line - cyan along an edge, green through the middle - each on a dark underline
  const fenceMarkElements = fenceMarks(fenceIndex(map.props)).map((m, i) =>
    m.kind === "block" ? (
      <g key={`fb${i}`} pointerEvents="none">
        <rect x={m.x + 0.1} y={m.y + 0.1} width={0.8} height={0.8} fill="#d9a441" fillOpacity={m.opaque ? 0.95 : 0.55} stroke="#151515" strokeWidth={0.08} strokeDasharray={m.opaque ? undefined : "0.18 0.1"} />
        <path d={`M ${m.x + 0.2} ${m.y + 0.2} L ${m.x + 0.8} ${m.y + 0.8} M ${m.x + 0.8} ${m.y + 0.2} L ${m.x + 0.2} ${m.y + 0.8}`} stroke="#151515" strokeWidth={0.1} />
      </g>
    ) : (
      <g key={`fl${i}`} pointerEvents="none">
        <line x1={m.x1 + 0.5} y1={m.y1 + 0.5} x2={m.x2 + 0.5} y2={m.y2 + 0.5} stroke="#151515" strokeWidth={0.26} strokeLinecap="butt" />
        <line x1={m.x1 + 0.5} y1={m.y1 + 0.5} x2={m.x2 + 0.5} y2={m.y2 + 0.5} stroke={m.form === "edge" ? "#4fd1ff" : "#7dff9a"} strokeWidth={0.14} strokeLinecap="butt" strokeDasharray={m.opaque ? undefined : "0.2 0.12"} />
      </g>
    ),
  );
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
        points={`${m.x + 0.5},${m.y + 0.16} ${m.x + 0.84},${m.y + 0.5} ${m.x + 0.5},${m.y + 0.84} ${m.x + 0.16},${m.y + 0.5}`}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={0.1}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    ) : (
      <circle key={`loot${m.x},${m.y}`} cx={m.x + 0.5} cy={m.y + 0.5} r={0.17} fill="#ffffff" stroke="#000000" strokeWidth={0.09} />
    ),
  );

  if (edit) {
    // the whole map, at one scale: bounds drawn, clickable
    const W = map.width;
    const H = map.height;
    // the cell under the pointer (clamp: the nearest one, outside the map)
    const cellOf = (e: React.MouseEvent<SVGSVGElement>, clamp = false): Vec2 | null => {
      const ctm = e.currentTarget.getScreenCTM();
      if (!ctm) return null;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (clamp) return { x: Math.min(W - 1, Math.max(0, x)), y: Math.min(H - 1, Math.max(0, y)) };
      return x < 0 || y < 0 || x >= W || y >= H ? null : { x, y };
    };
    const click = (e: React.MouseEvent<SVGSVGElement>, alt: boolean) => {
      // (the click that ends a drag is not an edit of its own)
      if (justDragged.current) {
        justDragged.current = false;
        e.preventDefault();
        return;
      }
      const cell = cellOf(e);
      if (!cell) return;
      e.preventDefault();
      edit.onCell(cell, alt);
    };
    const blockOf = (a: Vec2, b: Vec2): Rect => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
    const dragStart = (e: React.PointerEvent<SVGSVGElement>) => {
      if (!edit.onSelect || e.button !== 0) return;
      const from = cellOf(e);
      if (!from) return;
      dragRef.current = { from, moved: false };

    };
    const dragMove = (e: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag && edit.onHover) edit.onHover(cellOf(e));
      if (!drag || !edit.onSelect) return;
      const to = cellOf(e, true);
      if (!to) return;
      if (!drag.moved && to.x === drag.from.x && to.y === drag.from.y) return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Pointer already released. */ }
      drag.moved = true;
      edit.onSelect(blockOf(drag.from, to));
    };
    const dragEnd = (e: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* (nothing held) */
      }
      if (drag?.moved) justDragged.current = true;
    };
    // the operable props' links (a lever to its doors and traps) and their floor marks: a plate's frame, a trap cell's cross
    const operableMarks = !visible("prop") ? [] : [
      ...operableLinks(map).map((l, i) => (
        <line key={`ol${i}`} x1={l.from.x + 0.5} y1={l.from.y + 0.5} x2={l.to.x + 0.5} y2={l.to.y + 0.5} stroke={LINK_COLORS[l.kind] ?? "#ff5a3c"} strokeWidth={0.07} strokeDasharray="0.25 0.15" pointerEvents="none" />
      )),
      ...operableSources(map).filter((s) => s.kind === "plate" || s.kind === "trapcell").map((s) => (
        <rect key={`op${s.key}`} x={s.cell.x + 0.12} y={s.cell.y + 0.12} width={0.76} height={0.76} fill="none" stroke={s.kind === "plate" ? "#3fd0ff" : "#ff4d4d"} strokeWidth={0.09} pointerEvents="none" />
      )),
    ];
    return (
      <div className={`border border-green-800 bg-black/60 p-2 flex flex-col gap-1 ${edit.zoomed ? "h-full min-h-0" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="text-[10px] font-mono text-neutral-300">
          {t("minimap.click")} <span className="text-amber-200">{edit.verb}</span>{" "}
          <span className={edit.surface === "floor" ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
            {edit.surface === "floor" ? t("minimap.floorUpper") : t("minimap.ceilingUpper")}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono">
          {(["floor", "ceiling"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => edit.onSurface(s)}
              className={`border rounded-sm px-2 py-0.5 ${edit.surface === s ? (s === "floor" ? "border-emerald-400 bg-emerald-400/20 text-emerald-200" : "border-sky-400 bg-sky-400/20 text-sky-200") : "border-neutral-600 text-neutral-300 hover:bg-neutral-800"}`}
              title={t(s === "floor" ? "minimap.editFloors" : "minimap.editCeilings")}
            >
              {s === "floor" ? t("minimap.floor") : t("minimap.ceiling")}
            </button>
          ))}
          <button type="button" aria-pressed={showSight} onClick={() => setShowSight((v) => !v)} className={`border rounded-sm px-2 py-0.5 ${showSight ? "border-cyan-400 bg-cyan-400/20 text-cyan-200" : "border-neutral-600 text-neutral-300 hover:bg-neutral-800"}`} title={t("minimap.sightHint")}>{showSight ? t("minimap.sightCount", { n: sightCells.size }) : t("minimap.sight")}</button>
          {edit.zoomed && <button type="button" aria-pressed={textures} onClick={() => setTextures(v => !v)} className={`border rounded-sm px-2 py-0.5 ${textures ? "border-amber-400 bg-amber-400/20 text-amber-200" : "border-neutral-600 text-neutral-200"}`}>{t("minimap.textures")}</button>}
          <span className="text-neutral-500 ml-auto">{edit.selection ? t("minimap.selectionSize", { w: edit.selection.x1 - edit.selection.x0 + 1, h: edit.selection.y1 - edit.selection.y0 + 1, width: W, height: H }) : t("minimap.mapSize", { width: W, height: H })}</span>
          {edit.onZoom && (
            <button
              type="button"
              onClick={edit.onZoom}
              className="border border-neutral-600 rounded-sm px-2 py-0.5 text-neutral-200 hover:bg-neutral-800"
              title={edit.zoomed ? t("minimap.backToTheSmallMinimap") : t("minimap.aBigMinimapOnTheLeftTo")}
              aria-label={edit.zoomed ? t("minimap.shrinkTheMinimap") : t("minimap.enlargeTheMinimap")}
            >
              {edit.zoomed ? "⤡" : "⤢"}
            </button>
          )}
        </div>
        <svg
          viewBox={`-0.5 -0.5 ${W + 1} ${H + 1}`}
          className={`block w-full cursor-crosshair touch-none ${edit.zoomed ? "min-h-0 flex-1" : ""}`}
          style={edit.zoomed ? undefined : { aspectRatio: `${W + 1} / ${H + 1}` }}
          aria-label={t("minimap.mapName", { name: map.name })}
          onClick={(e) => click(e, false)}
          onContextMenu={(e) => click(e, true)}
          onPointerDown={dragStart}
          onPointerMove={dragMove}
          onPointerUp={dragEnd}
          onPointerCancel={dragEnd}
          onPointerLeave={() => edit.onHover?.(null)}
        >
        {textureDefs}
        {paper && (
          <defs>
            <pattern id={hatchId} width={0.34} height={0.34} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={0.34} height={0.34} fill="#150e07" />
              <line x1={0} y1={0} x2={0} y2={0.34} stroke="#a47c34" strokeWidth={0.15} />
            </pattern>
          </defs>
        )}
          {paper && <rect x={-0.5} y={-0.5} width={W + 1} height={H + 1} fill="#1c140c" />}
          {cells}
          {hatchedWalls}
          {visible("door") && doorBars}
          {restricted}
          {showSight && [...sightCells].map((key) => {
            const [x, y] = key.split(",").map(Number);
            // (a wall cell counts as seen when a sight line reaches it: amber; floor and doors: cyan)
            const wall = map.cells[y]?.[x] === "wall";
            return <rect key={`s${key}`} x={x} y={y} width={1} height={1} fill={wall ? "rgba(251, 146, 60, 0.5)" : "rgba(34, 211, 238, 0.4)"} stroke="rgba(255, 255, 255, 0.35)" strokeWidth={0.04} pointerEvents="none" />;
          })}
          {bridges}
          {ladders}
          {windows}
          {fenceMarkElements}
          {operableMarks}
          {markers}
          {edit.selection && (
            <rect
              x={edit.selection.x0}
              y={edit.selection.y0}
              width={edit.selection.x1 - edit.selection.x0 + 1}
              height={edit.selection.y1 - edit.selection.y0 + 1}
              fill="rgba(255, 255, 255, 0.22)"
              stroke="#ffffff"
              strokeWidth={0.12}
              strokeDasharray="0.4 0.25"
              pointerEvents="none"
            />
          )}
          {edit.paste && (
            <g pointerEvents="none">
              {edit.paste.layout.flatMap((row, ly) =>
                [...row].map((char, lx) => {
                  const x = edit.paste!.at.x + lx;
                  const y = edit.paste!.at.y + ly;
                  if (x < 0 || y < 0 || x >= W || y >= H) return null;
                  return <rect key={`p${lx},${ly}`} x={x} y={y} width={1} height={1} fill={char === "W" ? "rgba(0, 0, 0, 0.55)" : char === "D" ? "rgba(160, 60, 60, 0.6)" : "rgba(255, 196, 0, 0.28)"} />;
                }),
              )}
              <rect x={edit.paste.at.x} y={edit.paste.at.y} width={edit.paste.w} height={edit.paste.h} fill="none" stroke="#ffc400" strokeWidth={0.14} strokeDasharray="0.4 0.25" />
            </g>
          )}
          <rect x={0} y={0} width={W} height={H} fill="none" stroke={edit.surface === "floor" ? "#4ade80" : "#38bdf8"} strokeWidth={0.1} strokeDasharray="0.5 0.3" />
          {/* the deck's start: a flag-like marker, pointing the way the party faces there */}
          {visible("start") && <g transform={`translate(${map.start.cell.x + 0.5} ${map.start.cell.y + 0.5}) rotate(${FACING_DEGREES[map.start.facing]})`}>
            <circle r={0.46} fill="none" stroke={CATEGORY_COLORS.start} strokeWidth={0.1} />
            <polygon points="0,-0.36 0.2,0.1 -0.2,0.1" fill={CATEGORY_COLORS.start} />
          </g>}
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
        aria-label={t("minimap.mapName", { name: map.name })}
      >
        {/* the map, slid so the player's cell sits in the middle */}
        {textureDefs}
        {paper && (
          <defs>
            <pattern id={hatchId} width={0.34} height={0.34} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={0.34} height={0.34} fill="#150e07" />
              <line x1={0} y1={0} x2={0} y2={0.34} stroke="#a47c34" strokeWidth={0.15} />
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
          {visible("door") && doorBars}
          {restricted}
          {showSight && [...sightCells].map((key) => {
            const [x, y] = key.split(",").map(Number);
            // (a wall cell counts as seen when a sight line reaches it: amber; floor and doors: cyan)
            const wall = map.cells[y]?.[x] === "wall";
            return <rect key={`s${key}`} x={x} y={y} width={1} height={1} fill={wall ? "rgba(251, 146, 60, 0.5)" : "rgba(34, 211, 238, 0.4)"} stroke="rgba(255, 255, 255, 0.35)" strokeWidth={0.04} pointerEvents="none" />;
          })}
          {bridges}
          {ladders}
          {windows}
          {fenceMarkElements}
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

// What of a map the chart shows - the cells' structure and where the placed things are (not their other settings:
// a chance, a colour or an intensity being dragged does not change the chart). Worked out once for each map.
const chartOf = new WeakMap<GameMap, string>();
function chartKey(map: GameMap): string {
  let key = chartOf.get(map);
  if (key === undefined) {
    const at = (c: Vec2 | undefined) => (c ? `${c.x},${c.y}` : "");
    key = [
      map.id,
      map.structureKey ?? "",
      // (a fence piece's marks follow its side and its turn)
      map.props?.map((p) => `${p.prop}${at(p.cell)}${p.at}${p.offset?.join(",") ?? ""}${fenceFormOf(p.prop) ? `${p.rotation ?? ""}${p.fence?.opaque ?? ""}` : ""}`).join(";"),
      map.decals?.map((d) => `${at(d.cell)}${d.surface}`).join(";"),
      map.actors?.map((a) => `${at(a.cell)}${a.facing}`).join(";"),
      map.items?.map((i) => `${at(i.cell)}${i.offset?.join(",") ?? ""}`).join(";"),
      map.lights?.map((l) => `${l.x},${l.y}${l.pos?.join(",") ?? ""}`).join(";"),
      map.smokes?.map((m) => `${at(m.cell)}${m.pos.join(",")}`).join(";"),
      map.sounds?.map((s) => `${s.x},${s.y}${s.pos?.join(",") ?? ""}`).join(";"),
      map.exits?.map((e) => at(e.cell)).join(";"),
      map.stairs?.map((s) => at(s.cell)).join(";"),
      map.chanceWalls?.map((w) => at(w.cell)).join(";"),
      map.restricted?.map(at).join(";"),
      // (the operable props' links)
      operableLinks(map).map((l) => `${at(l.from)}>${at(l.to)}${l.kind}`).join(";"),
    ].join("|");
    chartOf.set(map, key);
  }
  return key;
}
const rectKey = (r: Rect | null | undefined) => (r ? `${r.x0},${r.y0},${r.x1},${r.y1}` : "");
const pasteKey = (p: { w: number; h: number; at: Vec2; layout: string[] } | null | undefined) => (p ? `${p.at.x},${p.at.y},${p.w},${p.h},${p.layout.join("")}` : "");
// The chart is drawn again only when something it shows changed: it is a few hundred SVG elements, and the
// editor changes the map on every step of a dragged slider. (The callbacks in `edit` are not compared: the
// ones that look at changing state go through refs in the app.)
function sameChart(a: MinimapProps, b: MinimapProps): boolean {
  if (a.compact !== b.compact || a.showRestricted !== b.showRestricted || a.dir !== b.dir || a.pos.x !== b.pos.x || a.pos.y !== b.pos.y) return false;
  if (a.locked?.join() !== b.locked?.join() || JSON.stringify(a.loot) !== JSON.stringify(b.loot)) return false;
  if (a.map !== b.map && chartKey(a.map) !== chartKey(b.map)) return false;
  const e = a.edit;
  const f = b.edit;
  if (!!e !== !!f) return false;
  if (e && f) {
    if (e.verb !== f.verb || e.surface !== f.surface || e.zoomed !== f.zoomed || rectKey(e.selection) !== rectKey(f.selection) || pasteKey(e.paste) !== pasteKey(f.paste)) return false;
    if ([...(e.hiddenCategories ?? [])].sort().join() !== [...(f.hiddenCategories ?? [])].sort().join()) return false;
    if (!!e.onMarker !== !!f.onMarker || !!e.onSelect !== !!f.onSelect || !!e.onZoom !== !!f.onZoom) return false;
  }
  return true;
}
export const Minimap = memo(MinimapImpl, sameChart);
