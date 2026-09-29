import { MAPS } from "../game/map";
import { parseMap } from "../game/mapFormat";
import type { MapFile } from "../game/mapFormat";
import type { GameMap } from "../game/types";
import { formatMapJson, scanLayout } from "./mapJson";
import type { JsonLayout } from "./mapJson";

// The map files being edited (see EDITOR.md): each deck's file as loaded
// from src/maps/, then as edited - every edit re-parses it into MAPS, so
// the game (and a lift ride back to the deck) sees it at once - with its
// undo and redo history, saving to disk (dev server) and downloading.

const RAW = import.meta.glob<string>("../maps/*.json", { eager: true, query: "?raw", import: "default" });
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
const entries = new Map<string, Entry>();
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
  if (!e) return { error: `no map "${id}"` };
  let next: MapFile;
  let map: GameMap;
  try {
    next = edit(structuredClone(e.file));
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
  return { map };
}

export function undo(id: string): GameMap | null {
  const e = entries.get(id);
  if (e) e.lastMerge = undefined;
  const prev = e?.undo.pop();
  if (!e || !prev) return null;
  e.redo.push(e.file);
  return use(id, e, prev);
}

export function redo(id: string): GameMap | null {
  const e = entries.get(id);
  if (e) e.lastMerge = undefined;
  const next = e?.redo.pop();
  if (!e || !next) return null;
  e.undo.push(e.file);
  return use(id, e, next);
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
  if (!e || text === null) throw new Error(`no map "${id}"`);
  const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/map?id=${encodeURIComponent(id)}`, {
    method: "POST",
    body: text,
  });
  if (!res.ok) throw new Error(await res.text());
  e.saved = e.file;
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
}

// every map there is (the repo's, and any made in this session)
export function mapIds(): string[] {
  return Object.keys(MAPS).sort();
}

// A new map (made, or copied from another - `from` keeps that one's layout
// of the file): its file not saved yet. Returns the deck, or why it can't be.
export function createMap(id: string, file: MapFile, from?: string): { map: GameMap } | { error: string } {
  if (!/^[\w-]+$/.test(id)) return { error: `"${id}" isn't a usable map id (letters, digits, - and _)` };
  if (MAPS[id]) return { error: `there's a map "${id}" already` };
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
