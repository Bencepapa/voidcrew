// Per-frame placement fixes for actor sprite sheets, made in the actor
// editor (?editor=actors) and saved to src/actors/<sheet>.json: each sheet
// cell's shift in sheet pixels, right and down, so the figure stands steady
// through its walk cycle and turns.

export interface ActorOffsets {
  // a sheet cell's size in pixels
  cell: [number, number];
  // [dx, dy] per cell, row by row
  offsets: [number, number][];
}

const files = import.meta.glob<ActorOffsets>("../actors/*.json", { eager: true, import: "default" });

export function actorOffsets(sheet: string): ActorOffsets | undefined {
  return files[`../actors/${sheet}.json`];
}
