// The sound zones' editing state: the cells picked on the minimap (Shift+click a room), the zone being worked on, and what
// the panel and the minimap do with them. Every change to the map goes through `edit` (the app's applyEdit: one undo step
// for each, a dragged slider one in all).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameMap } from "../game/types";
import type { MapFile } from "../game/mapFormat";
import { cellKey, countRunCells, resolveZone, runsOfKeys, type Acoustics, type ZonePreset } from "../game/acousticZones";
import { connectedArea, estimateArea } from "../audio/acoustics";
import { addZoneCells, createZone, removeZone, removeZoneCells, renameZone, setZonePreset, setZoneValues } from "./acousticEdits";
import { rectCells, type Rect } from "./mapEdits";
import { zoneColor, type AcousticsPanel, type MinimapZones, type ZonePick } from "./acousticsPanel";
import { t } from "../i18n";

export interface AcousticsEditorEnv {
  map: GameMap;
  // the dragged block of the zoomed minimap, if there is one
  block: Rect | null;
  // makes an edit of the map file (and takes it into the app); `merge`: edits in a row with the same key are one undo step
  edit(change: (file: MapFile) => MapFile, merge?: string): void;
  log(text: string): void;
}

const keysOfRuns = (runs: readonly (readonly [number, number, number])[]) => {
  const out: string[] = [];
  for (const [y, x0, x1] of runs) for (let x = x0; x <= x1; x++) out.push(cellKey(x, y));
  return out;
};

export function useAcousticsEditor(env: AcousticsEditorEnv): { panel: AcousticsPanel; minimap: MinimapZones } {
  const { map } = env;
  const [pick, setPick] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedRaw, setSelected] = useState<number | null>(null);
  // (the callbacks the minimap holds on to read the newest state through this)
  const latest = useRef({ env, pick });
  latest.current = { env, pick };

  // another map: nothing picked, no zone
  useEffect(() => {
    setPick(new Set());
    setSelected(null);
  }, [map.id]);

  const zones = map.acoustics ?? [];
  const selected = selectedRaw !== null && selectedRaw < zones.length ? selectedRaw : null;

  // Escape lets go of the picked cells
  useEffect(() => {
    if (!pick.size) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPick(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick]);

  const onPick = useCallback((cell: { x: number; y: number }, mode: ZonePick) => {
    const area = keysOfRuns(connectedArea(latest.current.env.map, cell.x, cell.y));
    if (!area.length) return;
    setPick((now) => {
      const next = new Set(mode === "replace" ? [] : now);
      for (const key of area) {
        if (mode === "remove") next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }, []);

  const pickRuns = useMemo(() => runsOfKeys(pick), [pick]);
  const pickEstimate = useMemo(() => (pick.size ? estimateArea(map, pickRuns) : null), [map, pick, pickRuns]);
  const zoneEstimate = useMemo(() => (selected !== null ? estimateArea(map, zones[selected].cells) : null), [map, selected, zones]);

  const minimap = useMemo<MinimapZones>(
    () => ({
      key: `${map.id}|${zones.map((z) => z.cells.map((r) => r.join(".")).join(";")).join("/")}|${selected}|${pickRuns.map((r) => r.join(".")).join(";")}`,
      zones: zones.map((z, i) => ({ cells: z.cells, color: zoneColor(i), selected: i === selected })),
      pick: pickRuns,
      onPick,
    }),
    [map.id, zones, selected, pickRuns, onPick],
  );

  const clearPick = () => setPick(new Set());
  const panel: AcousticsPanel = {
    zones: zones.map((z, i) => ({
      index: i,
      name: z.name ?? t("acoustics.zoneN", { n: i + 1 }),
      ownName: z.name,
      preset: z.preset ?? "room",
      values: resolveZone(z),
      cells: countRunCells(z.cells),
      color: zoneColor(i),
    })),
    selected,
    pickCount: pick.size,
    pickEstimate,
    zoneEstimate,
    hasBlock: !!env.block,
    onSelect: (index) => setSelected(index),
    onClearPick: clearPick,
    onAddBlock: () => {
      if (!env.block) return;
      const keys = new Set(pick);
      for (const c of rectCells(env.block)) if (map.cells[c.y]?.[c.x] === "floor") keys.add(cellKey(c.x, c.y));
      setPick(keys);
    },
    onCreate: () => {
      if (!pick.size) return;
      const index = zones.length;
      env.edit((file) => {
        createZone(file, pickRuns);
        return file;
      });
      env.log(t("acoustics.created", { cells: pick.size }));
      setSelected(index);
      clearPick();
    },
    onAddCells: () => {
      if (selected === null || !pick.size) return;
      env.edit((file) => addZoneCells(file, selected, pickRuns));
      clearPick();
    },
    onRemoveCells: () => {
      if (selected === null || !pick.size) return;
      env.edit((file) => removeZoneCells(file, selected, pickRuns));
      clearPick();
    },
    onDelete: () => {
      if (selected === null) return;
      env.edit((file) => removeZone(file, selected));
      setSelected(null);
    },
    onName: (name) => {
      if (selected !== null) env.edit((file) => renameZone(file, selected, name), `zone ${selected} name`);
    },
    onPreset: (preset: ZonePreset) => {
      if (selected !== null) env.edit((file) => setZonePreset(file, selected, preset));
    },
    onValues: (patch: Partial<Acoustics>, merge = "") => {
      if (selected !== null) env.edit((file) => setZoneValues(file, selected, patch), `zone ${selected} ${Object.keys(patch).join()} ${merge}`);
    },
    onUseAuto: () => {
      if (selected === null || !zoneEstimate) return;
      const a = zoneEstimate.acoustics;
      env.edit((file) => setZoneValues(file, selected, { reverb: a.reverb, decay: a.decay, softness: a.softness, insulation: a.insulation }));
    },
  };
  return { panel, minimap };
}
