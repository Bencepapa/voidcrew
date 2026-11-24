import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapFile } from "../game/mapFormat";
import type { GameMap, Vec2 } from "../game/types";
import { sharedImage } from "../render/sharedImages";
import { t, type Key } from "../i18n";
import { isTextEntry } from "../keyboardFocus";
import { clipSkipped, collectArea, clipThings, knownDecalSize, loadClip, orientClip, pasteArea, rememberDecalSize, saveClip, type AreaClip } from "./areaClipboard";
import type { Rect } from "./mapEdits";

// The editor's side of the area clipboard (see areaClipboard.ts for what is copied and how): Ctrl+C on the big
// minimap's block of cells copies it, Ctrl+V starts pasting - the area's outline follows the pointer over the
// minimap and the 3D view, a click puts it down with its top-left corner on the cell pointed at (and stays in
// the mode, to put it down again), R turns it, F mirrors it, Esc or the right button stops. A paste is one edit
// of the map file, so one undo step.

export interface AreaClipboardParams {
  editMode: boolean;
  // the map being edited (a paste into another map takes the clipboard along: it is kept in the browser's storage)
  mapId: string;
  // the minimap's block of cells, if one is selected
  selection: Rect | null;
  getFile: () => MapFile | null;
  // an edit of the map (mapStore.applyEdit for this map); the new map goes to `applied`
  edit: (change: (file: MapFile) => MapFile) => { map: GameMap } | { error: string };
  applied: (map: GameMap) => void;
  log: (text: string, kind: "editor" | "error") => void;
}

export interface AreaGhost {
  w: number;
  h: number;
  // the cell under the pointer: where its top-left corner is
  at: Vec2;
  // the area's cells as it will be put down, turned and mirrored (W wall, . floor, D door)
  layout: string[];
}

// the pictures' sizes, found as the copy is made (a floor decal turns about its picture's middle)
function loadDecalSizes(names: string[]): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();
  return Promise.all(
    names
      .filter((name) => !knownDecalSize(name))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => {
              if (image.naturalWidth && image.naturalHeight) rememberDecalSize(name, [image.naturalWidth, image.naturalHeight]);
              resolve();
            };
            image.onerror = () => resolve();
            image.src = sharedImage(name)?.url ?? `${import.meta.env.BASE_URL}decals/${name}/diffuse.png`;
          }),
      ),
  ).then(() => undefined);
}

export function useAreaClipboard(params: AreaClipboardParams) {
  const [clip, setClip] = useState<AreaClip | null>(() => loadClip());
  const [pasting, setPasting] = useState(false);
  const [turns, setTurns] = useState(0);
  const [flip, setFlip] = useState(false);
  const [hover, setHover] = useState<Vec2 | null>(null);
  const oriented = useMemo(() => (clip ? orientClip(clip, turns, flip) : null), [clip, turns, flip]);

  // what the handlers (set up once) see: the latest of everything
  const live = useRef({ params, clip, oriented, pasting, turns, flip, hover });
  live.current = { params, clip, oriented, pasting, turns, flip, hover };
  // which of the two clipboards - this one or the single selected thing's (App.tsx) - was filled last
  const latest = useRef<"area" | "single">("area");

  const cancel = useCallback((silent = false) => {
    if (!live.current.pasting) return;
    setPasting(false);
    setHover(null);
    if (!silent) live.current.params.log(t("area.stopped"), "editor");
  }, []);

  const copy = useCallback(async () => {
    const { selection } = live.current.params;
    if (!selection) return;
    const first = live.current.params.getFile();
    if (!first) return;
    const names = [...new Set((first.decals ?? []).filter((d) => d.x >= selection.x0 && d.x <= selection.x1 && d.y >= selection.y0 && d.y <= selection.y1).map((d) => d.decal))];
    await loadDecalSizes(names);
    const { params: now } = live.current;
    const file = now.getFile();
    const made = file && collectArea(file, selection, { source: now.mapId, decalSize: knownDecalSize });
    if (!made) {
      now.log(t("area.outside"), "error");
      return;
    }
    latest.current = "area";
    setClip(made);
    setTurns(0);
    setFlip(false);
    saveClip(made);
    now.log(t("area.copied", { count: clipThings(made), w: made.w, h: made.h }), "editor");
    if (clipSkipped(made)) {
      const what = Object.entries(made.skipped)
        .map(([kind, n]) => `${n} ${t(`area.kind.${kind}` as Key)}`)
        .join(", ");
      now.log(t("area.skipped", { count: clipSkipped(made), what }), "editor");
    }
  }, []);

  const startPaste = useCallback(() => {
    const { clip: current, params: now } = live.current;
    if (!current) {
      now.log(t("area.empty"), "editor");
      return;
    }
    setPasting(true);
  }, []);

  const rotate = useCallback((by: number) => setTurns((n) => (((n + by) % 4) + 4) % 4), []);
  // (left to right as it is seen now: the mirror is applied before the turns, so a turn is undone as the sides swap)
  const mirror = useCallback(() => {
    setFlip((f) => !f);
    setTurns((n) => (4 - n) % 4);
  }, []);

  const place = useCallback((cell: Vec2) => {
    const { oriented: area, params: now } = live.current;
    if (!area) return;
    let report: ReturnType<typeof pasteArea> | null = null;
    const result = now.edit((file) => {
      report = pasteArea(file, area, cell);
      return file;
    });
    if ("error" in result) {
      now.log(t("app.editorError", { error: result.error }), "error");
      return;
    }
    now.applied(result.map);
    const done = report as ReturnType<typeof pasteArea> | null;
    if (!done) return;
    now.log(t("area.pasted", { count: done.things, x: cell.x, y: cell.y, w: area.w, h: area.h }), "editor");
    if (done.clipped) now.log(t("area.clipped", { count: done.clipped }), "editor");
    if (done.kept) now.log(t("area.kept", { count: done.kept }), "editor");
    if (done.dropped) now.log(t("area.dropped", { count: done.dropped }), "editor");
  }, []);

  const onHover = useCallback((cell: Vec2 | null) => {
    if (!live.current.pasting) return;
    setHover((old) => (old?.x === cell?.x && old?.y === cell?.y ? old : cell));
  }, []);

  // the keys, ahead of the editor's other handlers (R turns a prop, Esc picks the Select tool...): swallowed
  // while they mean something here
  useEffect(() => {
    if (!params.editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextEntry(e.target)) return;
      const { params: now, clip: current, pasting: active, hover: at } = live.current;
      const key = e.key.toLowerCase();
      const own = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === "c" || key === "v")) {
        if (key === "c") {
          // (a block of cells is selected: the area, else it is the single selected thing's copy - App.tsx)
          if (now.selection) {
            own();
            void copy();
          }
        } else if (current && latest.current === "area") {
          own();
          startPaste();
        }
        return;
      }
      if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
      if (key === "escape") {
        own();
        cancel();
      } else if (key === "r") {
        own();
        rotate(e.shiftKey ? -1 : 1);
      } else if (key === "f") {
        own();
        mirror();
      } else if (key === "enter" && at) {
        own();
        place(at);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [params.editMode, copy, startPaste, cancel, rotate, mirror, place]);

  // leaving the editor or the map ends the paste (the clipboard stays: another map can paste it)
  useEffect(() => cancel(true), [params.editMode, params.mapId, cancel]);

  const ghost: AreaGhost | null = pasting && oriented && hover ? { w: oriented.w, h: oriented.h, at: hover, layout: oriented.layout } : null;
  return {
    clip,
    pasting,
    size: pasting && oriented ? { w: oriented.w, h: oriented.h } : null,
    ghost,
    hint: pasting && oriented ? t("area.hint", { w: oriented.w, h: oriented.h }) : undefined,
    copy,
    startPaste,
    cancel,
    rotate,
    mirror,
    place,
    onHover,
    // the single-thing copy (Ctrl+C on a selected prop, light...) was made: Ctrl+V pastes that now
    noteSingleCopy: () => {
      latest.current = "single";
    },
    latestIsArea: () => latest.current === "area",
  };
}
