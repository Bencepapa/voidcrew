import { MAPS } from "../game/map";
import { registerMapWorld, worldOfMap } from "../game/worlds";
import type { WorldId } from "../game/worlds";
import { parseMap } from "../game/mapFormat";
import type { MapFile } from "../game/mapFormat";
import type { GameMap } from "../game/types";
import { formatMapJson, scanLayout } from "./mapJson";
import { reevaluateRoofs } from "./roofEdits";
import type { JsonLayout } from "./mapJson";
import { t } from "../i18n";

// The map files being edited (see EDITOR.md): each deck's file as loaded
// from src/maps/, then as edited - every edit re-parses it into MAPS, so
// the game (and a lift ride back to the deck) sees it at once - with its
// undo and redo history, saving to disk (dev server) and downloading.

const RAW = import.meta.glob<string>("../maps/**/*.json", { eager: true, query: "?raw", import: "default" });
const idOf = (path: string) => path.replace(/^.*\/(.+)\.json$/, "$1");

interface Entry {
  file: MapFile;
  layout: JsonLayout;
  undo: MapFile[];
  redo: MapFile[];
  // the file as last saved (or loaded): unsaved edits differ from it
  saved: MapFile;
  // its line ends (a Windows checkout has CRLF)
  eol: string;
  // the merge key of the last edit (see applyEdit)
  lastMerge?: string;
}
// (kept across hot reloads: editing a source file while the editor's open
// would otherwise forget the maps made or edited this session, while MAPS
// still lists them - "no map ..." on every edit and save)
const entries: Map<string, Entry> = import.meta.hot?.data.entries ?? new Map<string, Entry>();
if (import.meta.hot) import.meta.hot.data.entries = entries;
const CRLF = "\r\n";
const UNDO_LIMIT = 200;

function entry(id: string): Entry | null {
  let e = entries.get(id);
  if (!e) {
    const text = Object.entries(RAW).find(([path]) => idOf(path) === id)?.[1];
    if (text === undefined) return null;
    const file = JSON.parse(text) as MapFile;
    const eol = text.includes(CRLF) ? CRLF : "\n";
    e = { file, layout: scanLayout(text), undo: [], redo: [], saved: file, eol };
    entries.set(id, e);
  }
  return e;
}

export function mapFile(id: string): MapFile | null {
  return entry(id)?.file ?? null;
}

export function hasUnsavedEdits(id: string): boolean {
  const e = entries.get(id);
  return !!e && e.file !== e.saved;
}

// the map as loaded or saved last (what a draft is made against)
export function savedFile(id: string): MapFile | null {
  return entry(id)?.saved ?? null;
}

export function anyUnsavedEdits(): boolean {
  for (const id of entries.keys()) if (hasUnsavedEdits(id)) return true;
  return false;
}

// Listeners (the autosave, see mapDrafts.ts): "edit" - the map changed;
// "saved" - written to disk or shared; "downloaded"; "reverted" - back to the saved map
export type MapChange = "edit" | "saved" | "downloaded" | "reverted";
const listeners = new Set<(id: string, kind: MapChange) => void>();
export function onMapChange(fn: (id: string, kind: MapChange) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function changed(id: string, kind: MapChange) {
  for (const fn of listeners) {
    try { fn(id, kind); } catch { /* a listener must not break editing */ }
  }
}

// the shared-levels save: what's in the map now counts as saved
export function markSaved(id: string) {
  const e = entries.get(id);
  if (!e) return;
  e.saved = e.file;
  changed(id, "saved");
}

// a restored draft: the map as drafted, one undo step away from the loaded one
export function restoreFile(id: string, file: MapFile): { map: GameMap } | { error: string } {
  return applyEdit(id, () => structuredClone(file));
}

// back to the saved map (the history goes with the discarded edits)
export function revertToSaved(id: string): GameMap | null {
  const e = entries.get(id);
  if (!e) return null;
  e.undo = [];
  e.redo = [];
  e.lastMerge = undefined;
  const map = use(id, e, e.saved);
  changed(id, "reverted");
  return map;
}

export function canUndo(id: string): boolean {
  return !!entries.get(id)?.undo.length;
}
export function canRedo(id: string): boolean {
  return !!entries.get(id)?.redo.length;
}

function use(id: string, e: Entry, file: MapFile): GameMap {
  e.file = file;
  const map = parseMap(id, file);
  MAPS[id] = map;
  return map;
}

// An edit: the new file (made from a copy, never changing the given one),
// checked by parsing it. Returns the deck as edited, or why it can't be.
// `merge`: edits in a row with the same key (a slider being dragged) make
// one undo step
export function applyEdit(
  id: string,
  edit: (file: MapFile) => MapFile,
  merge?: string,
): { map: GameMap } | { error: string } {
  const e = entry(id);
  if (!e) return { error: t("editorShell.error.noMap", { id }) };
  let next: MapFile;
  let map: GameMap;
  try {
    // (the auto roofs follow what the edit did: roofed cells, floor heights, walls...)
    next = reevaluateRoofs(edit(structuredClone(e.file)));
    map = parseMap(id, next);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  // nothing changed (a texture already there, a light already off...): it
  // parses, but there's no history entry to step back through and no new
  // scene to build - the deck as it stands
  if (JSON.stringify(next) === JSON.stringify(e.file)) return { map: MAPS[id] ?? map };
  if (!merge || merge !== e.lastMerge) {
    e.undo.push(e.file);
    if (e.undo.length > UNDO_LIMIT) e.undo.shift();
  }
  e.lastMerge = merge;
  e.redo = [];
  e.file = next;
  MAPS[id] = map;
  changed(id, "edit");
  return { map };
}

export function undo(id: string): GameMap | null {
  const e = entries.get(id);
  if (e) e.lastMerge = undefined;
  const prev = e?.undo.pop();
  if (!e || !prev) return null;
  e.redo.push(e.file);
  const map = use(id, e, prev);
  changed(id, "edit");
  return map;
}

export function redo(id: string): GameMap | null {
  const e = entries.get(id);
  if (e) e.lastMerge = undefined;
  const next = e?.redo.pop();
  if (!e || !next) return null;
  e.undo.push(e.file);
  const map = use(id, e, next);
  changed(id, "edit");
  return map;
}

// the file's text, laid out as it was loaded (see mapJson)
export function mapText(id: string): string | null {
  const e = entry(id);
  return e ? formatMapJson(e.file, e.layout).split("\n").join(e.eol) : null;
}

// dev server only: writes src/maps/<id>.json
export async function saveMap(id: string): Promise<string> {
  const e = entry(id);
  const text = mapText(id);
  if (!e || text === null) throw new Error(t("editorShell.error.noMap", { id }));
  const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/map?id=${encodeURIComponent(id)}&world=${worldOfMap(id)}`, {
    method: "POST",
    body: text,
  });
  if (!res.ok) throw new Error(await res.text());
  e.saved = e.file;
  changed(id, "saved");
  return res.text();
}

export function downloadMap(id: string) {
  const text = mapText(id);
  if (text === null) return;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  changed(id, "downloaded");
}

// the maps of a world (the repo's, and any made in this session)
export function mapIds(world?: WorldId): string[] {
  return Object.keys(MAPS)
    .filter((id) => !world || worldOfMap(id) === world)
    .sort();
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The technical id of a map, made from its place and name ("Mualdeb városa" +
// "Tolvajok céhe" -> "mualdeb-varosa-tolvajok-cehe"); -2, -3... when taken
export function deriveMapId(place: string, name: string): string {
  const base = [slug(place), slug(name)].filter(Boolean).join("-") || "map";
  let id = base;
  for (let n = 2; MAPS[id]; n++) id = `${base}-${n}`;
  return id;
}

// the places of the maps (of a world), sorted
export function placesOf(world?: WorldId): string[] {
  return [...new Set(mapIds(world).map((id) => MAPS[id].place))].sort((a, b) => a.localeCompare(b));
}

// the place and name of a map changed (its id stays)
export function renameMap(id: string, place: string, name: string): { map: GameMap } | { error: string } {
  return applyEdit(id, (file) => {
    const { name: _n, place: _p, ...rest } = file;
    return { name, place, ...rest };
  });
}

// A new map (made, or copied from another - `from` keeps that one's layout
// of the file): its file not saved yet. Returns the deck, or why it can't be.
export function createMap(id: string, file: MapFile, from?: string, world?: WorldId): { map: GameMap } | { error: string } {
  if (!/^[\w-]+$/.test(id)) return { error: t("editorShell.error.badMapId", { id }) };
  if (MAPS[id]) return { error: t("editorShell.error.mapExists", { id }) };
  // (a new map belongs to the world it was made in)
  registerMapWorld(id, world ?? (from ? worldOfMap(from) : worldOfMap(Object.keys(MAPS)[0] ?? "")));
  let map: GameMap;
  try {
    map = parseMap(id, file);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const source = from ? entry(from) : null;
  entries.set(id, {
    file,
    layout: source ? new Map(source.layout) : new Map(),
    undo: [],
    redo: [],
    // nothing saved yet: every edit (and the file itself) is new
    saved: structuredClone(file),
    eol: source?.eol ?? "\n",
  });
  MAPS[id] = map;
  return { map };
}
