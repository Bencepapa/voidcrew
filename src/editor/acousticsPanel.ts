// What the sound zones' panel (inspector/AcousticsFields.tsx) and the minimap's zone layer are given by the editor
// (useAcousticsEditor.ts): plain data and callbacks, so the components know nothing of the map file.
import type { Acoustics, CellRun, ZonePreset } from "../game/acousticZones";
import type { AreaEstimate } from "../audio/acoustics";

// a zone's colour on the minimap
export const zoneColor = (index: number) => `hsl(${(index * 67 + 20) % 360} 75% 55%)`;

export interface ZoneView {
  index: number;
  // the name shown (a zone with none is "Zone 3") and the one it has
  name: string;
  ownName?: string;
  preset: ZonePreset;
  values: Acoustics;
  cells: number;
  color: string;
}

export type ZonePick = "replace" | "add" | "remove";

export interface AcousticsPanel {
  zones: ZoneView[];
  // the zone being worked on (its cells are lit on the minimap), or none
  selected: number | null;
  // the cells picked on the minimap for a new zone (or to add to the selected one)
  pickCount: number;
  // what the picked cells would be by themselves (the automatic value), and what the selected zone's cells are
  pickEstimate: AreaEstimate | null;
  zoneEstimate: AreaEstimate | null;
  // a block is dragged on the zoomed minimap
  hasBlock: boolean;
  onSelect(index: number | null): void;
  onClearPick(): void;
  onAddBlock(): void;
  onCreate(): void;
  onAddCells(): void;
  onRemoveCells(): void;
  onDelete(): void;
  onName(name: string): void;
  onPreset(preset: ZonePreset): void;
  onValues(patch: Partial<Acoustics>, merge?: string): void;
  onUseAuto(): void;
}

// the minimap's side: what to light, and what a Shift+click does
export interface MinimapZones {
  // changes when anything drawn changes (the minimap compares it instead of the cells)
  key: string;
  zones: { cells: readonly CellRun[]; color: string; selected: boolean }[];
  pick: readonly CellRun[];
  onPick(cell: { x: number; y: number }, mode: ZonePick): void;
}
