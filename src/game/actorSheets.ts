export const ACTOR_ROW_ROLES = ["unused", "idle", "walk", "attack", "hit", "die", "wreck"] as const;
export type ActorRowRole = typeof ACTOR_ROW_ROLES[number];

export interface ActorView {
  col: number;
  mirror: boolean;
}

export interface ActorSheetLayout {
  cols: number;
  rows: number;
  idleRow: number;
  walkRows: number[];
  shootRow?: number;
  shootRows?: number[];
  hitRow?: number;
  dieRows?: number[];
  wreckRow?: number;
  directions?: ActorView[];
}

export function defaultActorView(cols: number, sector: number): ActorView {
  const turn = (sector % 8 + 8) % 8;
  if (cols >= 6) return { col: Math.floor(turn * cols / 8), mirror: false };
  const distance = Math.min(turn, 8 - turn);
  const col = Math.round(distance * (cols - 1) / 4);
  return { col, mirror: turn > 4 && col > 0 && col < cols - 1 };
}

export function actorView(layout: Pick<ActorSheetLayout, "cols" | "directions">, angle: number): ActorView {
  const step = Math.round(Math.abs(angle) / (Math.PI / 4));
  const sector = ((angle < 0 ? -step : step) % 8 + 8) % 8;
  return layout.directions?.[sector] ?? defaultActorView(layout.cols, sector);
}

export function sheetLayout(cols: number, roles: ActorRowRole[], directions?: ActorView[]): ActorSheetLayout {
  const rowsFor = (role: ActorRowRole) => roles.flatMap((value, index) => value === role ? [index] : []);
  const idleRow = Math.max(0, roles.indexOf("idle"));
  const walkRows = rowsFor("walk");
  const shootRows = rowsFor("attack");
  const dieRows = rowsFor("die");
  return {
    cols, rows: roles.length, idleRow, walkRows: walkRows.length ? walkRows : [idleRow], directions,
    shootRow: shootRows[0], shootRows: shootRows.length ? shootRows : undefined,
    hitRow: rowsFor("hit")[0], dieRows: dieRows.length ? dieRows : undefined, wreckRow: rowsFor("wreck")[0],
  };
}

export const isSharedActorId = (id: string) =>
  /^(scifi|fantasy)_actor_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
