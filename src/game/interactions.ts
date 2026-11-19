import type { Direction, GameMap, Vec2 } from "./types";
import type { WallFacePart } from "./mapGeometry";

export type Interaction = { clickOnly?: true } & (
  | { kind: "message"; text: string; modal: boolean; position: "top" | "center" | "bottom"; timeout?: number }
  | { kind: "image"; text: string; image?: string }
);

export type WallInteractionTarget = { kind: "wall"; cell: Vec2; side: Direction; part?: WallFacePart };

export type InteractionTarget =
  | WallInteractionTarget
  | { kind: "door"; cell: Vec2 }
  | { kind: "decal" | "prop" | "item"; index: number };

export const sameInteractionCell = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

export function interactionAt(map: GameMap, target: InteractionTarget): Interaction | undefined {
  switch (target.kind) {
    case "wall": return map.wallInteractions?.find(w => w.side === target.side && w.part === target.part && sameInteractionCell(w.cell, target.cell))?.interaction;
    case "door": return map.doors?.find(d => sameInteractionCell(d.cell, target.cell))?.interaction;
    case "prop": return map.props?.[target.index]?.interaction;
    case "decal": return map.decals?.[target.index]?.interaction;
    case "item": return map.items?.[target.index]?.interaction;
  }
}

export function readInteraction(raw: Interaction | undefined): Interaction | undefined {
  if (!raw || typeof raw.text !== "string") return undefined;
  const click = raw.clickOnly === true ? { clickOnly: true as const } : {};
  if (raw.kind === "image") return { ...click, kind: "image", text: raw.text, image: typeof raw.image === "string" ? raw.image : undefined };
  if (raw.kind !== "message") return undefined;
  return {
    ...click,
    kind: "message", text: raw.text, modal: raw.modal === true,
    position: raw.position === "top" || raw.position === "bottom" ? raw.position : "center",
    timeout: typeof raw.timeout === "number" && Number.isFinite(raw.timeout) && raw.timeout > 0 ? raw.timeout : undefined,
  };
}
