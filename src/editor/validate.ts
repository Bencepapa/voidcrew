import type { GameMap, Vec2, Linked, Direction } from "../game/types";
import { MAPS, cellAt, floorHeight, ceilingHeight } from "../game/map";
import { linkProblems } from "../game/mapLinks";
import { t } from "../i18n";
import { passage, jumpDown } from "../game/heights";
import { DIR_VECTOR } from "../game/movement";
import { PROP_TYPES, propPlacement } from "../game/props";
import { itemSpot } from "../game/items";
import type { PropSpec } from "../game/types";
import { getDialogue } from "../game/dialogueCatalog";
import { getShopIds } from "../game/shopCatalog";
import { simpleShopRefs, unknownShops } from "../game/simpleShop";
import { unknownDoorTextures } from "../game/doorTextures";
import { isTextureSetId } from "../render/textureSets";
import { fenceProblems } from "../game/fences";
import { operableProblems, type OperableKind } from "../game/operables";
import { propLockProblems } from "../game/propLocks";
import { soundProblems } from "../game/sounds";
import { zoneProblems } from "../game/acousticZones";
import { cleanSkyGradient } from "../game/skyGradient";
import { isSharedSkyId } from "../game/skyImage";
import { sharedImage } from "../render/sharedImages";

export type Problem = { severity: "error" | "warning"; code: string; cell?: Vec2; key: string; params?: Record<string, string | number> };

// Structural validation: doors are assumed open; story progression and random
// variations are not simulated. A reachability state includes bridge height.
export function validateMap(map: GameMap): Problem[] {
  const out: Problem[] = [];
  const add = (code: string, cell?: Vec2, params?: Problem["params"], severity: Problem["severity"] = "warning") => out.push({ severity, code, cell, key: `minimap.problem.${code}`, params });
  const open = (c: Vec2) => cellAt(map, c.x, c.y) !== "wall";
  if (!map.start?.cell) add("noStart", undefined, undefined, "error");
  // parseMap drops bad colours, but a map built by hand can still carry one
  if (map.textures?.skyGradient && !cleanSkyGradient(map.textures.skyGradient)) add("skyGradient", undefined, undefined, "error");
  // a shared sky that is not loaded (not published, or still on its way) leaves the starry sky: only a warning, like other shared refs
  if (isSharedSkyId(map.textures?.sky) && !map.textures.skyGradient && !sharedImage(map.textures.sky)) add("unknownSky", undefined, { id: map.textures.sky });

  if (!map.exits?.length && !map.stairs?.length) add("noExit");
  // gates: where they lead must exist (the way back and the arrival only warn)
  for (const problem of linkProblems(map, (id) => MAPS[id])) add(problem.code, problem.cell, { ...problem.params, kind: t(`link.kind.${problem.kind}`) }, problem.severity);

  const reached = new Set<string>();
  const states = new Set<string>();
  const queue: { cell: Vec2; height: number }[] = [];
  const enqueue = (cell: Vec2, height: number) => {
    const key = `${cell.x},${cell.y},${height}`;
    if (states.has(key)) return;
    states.add(key); reached.add(`${cell.x},${cell.y}`); queue.push({ cell, height });
  };
  if (map.start?.cell && open(map.start.cell)) {
    enqueue(map.start.cell, floorHeight(map, map.start.cell.x, map.start.cell.y));
    for (let i = 0; i < queue.length; i++) {
      const { cell, height } = queue[i];
      if (jumpDown(map, cell, height) !== null) enqueue(cell, floorHeight(map, cell.x, cell.y));
      for (const dir of Object.keys(DIR_VECTOR) as Direction[]) {
        const v = DIR_VECTOR[dir], to = { x: cell.x + v.x, y: cell.y + v.y };
        const step = passage(map, cell, height, to, dir);
        if (step.kind !== "blocked") enqueue(to, step.y);
      }
    }
    // A cell with a blocking prop (a barrel, a tree) is closed on purpose: not reported. The
    // cells that cannot be reached - the area behind it, say - are, a region a problem.
    const closed = new Set((map.props ?? []).filter((p) => PROP_TYPES[p.prop]?.blocks).map((p) => `${p.cell.x},${p.cell.y}`));
    const stray = (x: number, y: number) => open({ x, y }) && !reached.has(`${x},${y}`) && !closed.has(`${x},${y}`);
    const seen = new Set<string>();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!stray(x, y) || seen.has(`${x},${y}`)) continue;
        let count = 0;
        const flood: Vec2[] = [{ x, y }];
        seen.add(`${x},${y}`);
        for (let i = 0; i < flood.length; i++) {
          count++;
          for (const v of Object.values(DIR_VECTOR)) {
            const n = { x: flood[i].x + v.x, y: flood[i].y + v.y };
            if (stray(n.x, n.y) && !seen.has(`${n.x},${n.y}`)) {
              seen.add(`${n.x},${n.y}`);
              flood.push(n);
            }
          }
        }
        add("unreachable", { x, y }, { count });
      }
    }
  }

  const groups: { kind: string; entries: (Linked & { cell: Vec2 })[] }[] = [
    { kind: "prop", entries: map.props ?? [] }, { kind: "npc", entries: map.actors ?? [] },
    { kind: "item", entries: map.items ?? [] }, { kind: "smoke", entries: map.smokes ?? [] },
    { kind: "light", entries: (map.lights ?? []).map(l => ({ ...l, cell: { x: l.x, y: l.y } })) },
    { kind: "decal", entries: map.decals ?? [] }, { kind: "door", entries: map.doors ?? [] },
    { kind: "chanceWall", entries: map.chanceWalls ?? [] },
  ];
  const ids = new Set(groups.flatMap(g => g.entries.flatMap(e => e.id ? [e.id] : [])));
  for (const g of groups) for (const e of g.entries) {

    for (const relation of ["with", "without"] as const) if (e[relation] && !ids.has(e[relation]!)) add("missingLink", e.cell, { id: e[relation]!, relation });
  }
  // fence pieces: one to an edge, one to a cell, an edge piece with a side
  for (const p of fenceProblems(map.props)) add(p.kind === "doubleEdge" ? "fenceDoubleEdge" : p.kind === "doubleCell" ? "fenceDoubleCell" : "fenceNoSide", { x: p.x, y: p.y });
  // an NPC's dialogue must exist (library and entry passage)
  for (const a of map.actors ?? []) {
    if (!a.dialogue) continue;
    const d = getDialogue(a.dialogue.library);
    if (!d || !(a.dialogue.entry in d.passages)) add("missingDialogue", a.cell, { library: a.dialogue.library, entry: a.dialogue.entry });
  }
  // a simple shop (an NPC without a dialogue, a shop event) must name a known shop
  for (const r of unknownShops(simpleShopRefs(map), getShopIds())) add("missingShop", r.cell, { shop: r.shop });
  // A wall face exists at solid neighbours or a floor/ceiling height change.
  const surfaceExists = (c: Vec2, surface: string) => {
    if (!open(c)) return false;
    if (surface === "floor" || surface === "ceiling") return Number.isFinite(surface === "floor" ? floorHeight(map, c.x, c.y) : ceilingHeight(map, c.x, c.y));
    const v = DIR_VECTOR[surface as Direction];
    if (!v) return false;
    const x = c.x + v.x, y = c.y + v.y;
    return cellAt(map, x, y) === "wall" || floorHeight(map, x, y) > floorHeight(map, c.x, c.y) || ceilingHeight(map, x, y) < ceilingHeight(map, c.x, c.y);
  };
  for (const d of map.decals ?? []) if (!surfaceExists(d.cell, d.surface)) add("missingSurface", d.cell, { kind: "decal", surface: d.surface });
  for (const p of map.props ?? []) if (PROP_TYPES[p.prop]?.wall && ![...p.at].some(s => surfaceExists(p.cell, s))) add("missingSurface", p.cell, { kind: "prop", surface: p.at });

  const terminals = map.terminals ?? {};
  const active = new Set((map.decals ?? []).flatMap(d => d.action?.startsWith("terminal:") ? [d.action.slice(9)] : []));
  const actions = (map.triggers ?? []).flatMap(t => t.do);
  // Follow terminal show actions as well as directly placed terminal decals.
  for (const a of actions) if (a.startsWith("show:")) active.add(a.slice(5));
  const visited = new Set<string>();
  for (const id of active) {
    if (visited.has(id)) continue;
    visited.add(id);
    if (!terminals[id]) { add("missingTerminal", undefined, { id }); continue; }
    for (const a of terminals[id].do ?? []) { actions.push(a); if (a.startsWith("show:")) active.add(a.slice(5)); }
  }
  const keys = new Set([...(map.items ?? []).flatMap(i => i.sets ? [i.sets] : []), ...actions.flatMap(a => a.startsWith("set:") ? [a.slice(4).trim()] : [])]);
  const codes = [...active].some(id => terminals[id]?.codes);
  for (const d of map.doors ?? []) {
    if (d.lock?.key && !keys.has(d.lock.key)) add("missingKey", d.cell, { id: d.lock.key });
    if (d.lock?.code && !codes) add("missingCode", d.cell);
  }
  // levers, buttons, plates and traps: every target has to be a door or a wall trap; a wall trap should not face a wall
  for (const p of operableProblems(map)) {
    add(p.code, p.cell, p.code === "operableNoTarget" ? { kind: t(`operable.kind.${p.params!.kind as OperableKind}`) }
      : p.code === "operableDormantUnused" ? { what: t(`minimap.problem.what.${p.params!.what as "npc" | "item"}`) } : p.params);
  }
  // the locks of chests, levers and buttons: a key, one that something on the map gives (see propLocks.ts)
  for (const p of propLockProblems(map)) add(p.code, p.cell, p.params);
  // sound emitters: one that makes no sound, reaches nowhere, or pulses with a zero time
  for (const p of soundProblems(map.sounds)) add(p.code, p.cell, { index: p.index + 1 });
  // sound zones: one with no cells, or with cells that are walls or off the map
  for (const p of zoneProblems(map.acoustics)) add(p.code, p.cell, { index: p.index + 1, ...(p.count !== undefined ? { count: p.count } : {}) });
  // a door's own leaf / frame texture must be a texture set (a shared one counts once it's loaded)
  for (const u of unknownDoorTextures(map.doors, isTextureSetId)) add("unknownDoorTexture", u.cell, { id: u.id, field: t(`editorBar.door${u.field === "leafTexture" ? "Leaf" : "Frame"}Texture`) });
  return [...out, ...placementProblems(placedMap(map), c => !open(c))];
}
import type { MapFile } from "../game/mapFormat";

type PlacedKind = "prop" | "npc" | "item" | "light" | "smoke" | "sound" | "exit" | "stairs" | "ladder" | "bridge" | "door" | "chanceWall" | "decal" | "restricted" | "start" | "patrol";
type Placed = { kind: PlacedKind; index: number; cell: Vec2; point?: Vec2; reach?: { x: number; z: number }; data: Record<string, unknown>; field: string };
const fields = { props: "prop", actors: "npc", items: "item", lights: "light", smokes: "smoke", sounds: "sound", exits: "exit", stairs: "stairs", ladders: "ladder", bridges: "bridge", doors: "door", chanceWalls: "chanceWall", decals: "decal", restricted: "restricted" } as const;
const gameplay = new Set<PlacedKind>(["npc", "item", "exit", "stairs", "ladder", "bridge", "door", "start", "patrol"]);

function placedFile(file: MapFile): Placed[] {
  const records: Placed[] = [];
  for (const [field, kind] of Object.entries(fields)) {
    const entries = file[field as keyof typeof fields] ?? [];
    entries.forEach((entry, index) => {
      const data = (Array.isArray(entry) ? { x: entry[0], y: entry[1] } : entry) as unknown as Record<string, unknown>;
      const cell = { x: Number(data.x), y: Number(data.y) };
      const offset = (data.offset ?? data.pos) as number[] | undefined;
      let point = offset ? { x: cell.x + (offset[0] ?? 0), y: cell.y + (offset[offset.length === 3 ? 2 : 1] ?? 0) } : undefined;
      let reach: Placed["reach"];
      if (kind==="prop" && PROP_TYPES[String(data.prop)]) {
        const at=propPlacement({...data,cell,at:data.at ?? "center"} as unknown as PropSpec);
        point={x:at.x,y:at.z};
        reach={x:at.reachX,z:at.reachZ};
      }
      records.push({ kind, index, field, cell, point, reach, data });
      if (kind === "npc") (data.patrol as [number, number][] | undefined)?.forEach(([x,y], patrolIndex) =>
        records.push({ kind: "patrol", index, field, cell: { x,y }, data: { patrolIndex } }));
    });
  }
  if (file.start) records.push({ kind: "start", index: 0, field: "start", cell: file.start, data: { ...file.start } });
  return records;
}

function placedMap(map: GameMap): Placed[] {
  const file: Record<string, unknown> = {};
  for (const field of Object.keys(fields)) {
    file[field] = (map[field as keyof typeof fields] ?? []).map((e: unknown) => {
      const record = e as Record<string, unknown>;
      const cell = (record.cell ?? record) as Vec2;
      return { ...record, x: cell.x, y: cell.y, ...(field==="decals" ? {px:record.x,py:record.y} : {}), patrol: (record.patrol as Vec2[] | undefined)?.map(c => [c.x,c.y]) };
    });
  }
  file.start = map.start ? { ...map.start.cell, facing: map.start.facing } : undefined;
  return placedFile(file as unknown as MapFile);
}

// What is buried in the wall: a thing whose spot is in a wall cell - a prop only when its whole
// footprint is (a pillar sunk half into a wall for the geometry is on purpose; a prop hung on
// a wall is meant to be at it).
function buried(p: Placed, wall: (cell: Vec2) => boolean): boolean {
  if (p.kind === "chanceWall") return false;
  if (p.kind === "prop") {
    if (PROP_TYPES[String(p.data.prop)]?.wall) return false;
    if (!p.point || !p.reach) return wall(p.cell);
    const x0 = Math.round(p.point.x - p.reach.x + 1e-6);
    const x1 = Math.round(p.point.x + p.reach.x - 1e-6);
    const y0 = Math.round(p.point.y - p.reach.z + 1e-6);
    const y1 = Math.round(p.point.y + p.reach.z - 1e-6);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!wall({ x, y })) return false;
    return true;
  }
  if (wall(p.cell)) return true;
  if (!p.point) return false;
  // a spot on or just inside a wall's face (a vent, a lamp at the wall) is not buried: a little
  // way in, all round it
  const x0 = Math.round(p.point.x - POINT_DEPTH);
  const x1 = Math.round(p.point.x + POINT_DEPTH);
  const y0 = Math.round(p.point.y - POINT_DEPTH);
  const y1 = Math.round(p.point.y + POINT_DEPTH);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!wall({ x, y })) return false;
  return true;
}
const POINT_DEPTH = 0.1;

function inWallProblems(records: Placed[], wall: (cell: Vec2) => boolean): Problem[] {
  return records.filter(p => buried(p, wall)).map(p => ({
    code: "inWall." + p.kind, key: "minimap.problem.inWall", severity: gameplay.has(p.kind) ? "error" : "warning",
    cell: p.cell, params: { kind: p.kind, index: p.index + 1, name: String(p.data.prop ?? p.data.item ?? p.data.type ?? p.data.decal ?? "") },
  }));
}

// Approximate positions for grouping, while retaining all meaningful payload fields
// in the safe repair below. Coincident objects with different contents are never deleted.
function canonical(value: unknown): string {
  if (typeof value === "number") return String(Math.round(value * 10000) / 10000);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([,v])=>v !== undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",") + "}";
  return JSON.stringify(value) ?? "";
}
function duplicateGroups(records: Placed[]): Placed[][] {
  const groups = new Map<string, Placed[]>();
  for (const p of records) {
    if (p.kind === "start" || p.kind === "patrol") continue;
    const d = p.data;
    const detail = p.kind === "prop" ? [d.prop, d.at ?? "center", d.offset ?? [0,0], d.elevation ?? 0, d.rotation ?? 0]
      : p.kind === "decal" ? [d.decal,d.surface,d.px,d.py,d.rotation ?? 0,d.scale ?? 1]
      : p.kind === "item" ? [d.item,itemSpot(d.offset as [number,number] | undefined,p.index),d.elevation ?? 0]
      : p.kind === "light" || p.kind === "smoke" ? [d.pos ?? null]
      // (a beep and a hiss in one spot are two sounds; the same one twice is one too many)
      : p.kind === "sound" ? [d.pos ?? null, d.kind, d.wave ?? null, d.pitch ?? null, d.noise ?? null]
      : p.kind === "ladder" ? [d.wall] : p.kind === "bridge" ? [d.height,d.axis] : [];
    const key = canonical([p.kind,p.cell.x,p.cell.y,detail]);
    groups.set(key, [...(groups.get(key) ?? []),p]);
  }
  return [...groups.values()].filter(group=>group.length>1);
}
function placementProblems(records: Placed[], wall: (cell: Vec2) => boolean): Problem[] {
  return [...inWallProblems(records,wall),...duplicateGroups(records).map(group=>({
    code:"duplicate",key:"minimap.problem.duplicate",severity:gameplay.has(group[0].kind) ? "error" as const : "warning" as const,
    cell:group[0].cell,params:{kind:group[0].kind,indexes:group.map(p=>p.index+1).join(", ")}
  }))];
}
const fileWall = (file: MapFile) => (cell: Vec2) => {
  const character=file.layout[cell.y]?.[cell.x];
  return character === undefined || character === "W" || !!file.chanceWalls?.some(w=>w.x===cell.x && w.y===cell.y);
};

// Works even on files rejected by parseMap, so stale objects can be diagnosed.
export function validateMapFilePlacements(file: MapFile): Problem[] {
  return placementProblems(placedFile(file),fileWall(file));
}
export function removeInWall(file: MapFile): MapFile {
  const next = structuredClone(file);
  const wall = fileWall(file);
  const records = placedFile(file);
  for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
    const bad = new Set(records.filter(p=>p.field===field && p.kind!=="patrol" && buried(p, wall)).map(p=>p.index));
    const entries = next[field];
    if (entries) (next as unknown as Record<string, unknown>)[field] = entries.filter((_,i)=>!bad.has(i));
  }
  next.actors?.forEach(a=>{if(a.patrol)a.patrol=a.patrol.filter(([x,y])=>!wall({x,y}));});
  // A start is mandatory and cannot safely be deleted or relocated automatically.
  return next;
}
export function removeDuplicates(file: MapFile): MapFile {
  const next = structuredClone(file);
  for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
    const seen = new Set<string>();
    const entries = next[field];
    if(entries)(next as unknown as Record<string,unknown>)[field]=entries.filter(entry=>{
      const key=canonical(entry);
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
  }
  return next;
}
