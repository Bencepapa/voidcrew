// A placed door's own textures: `leafTexture` and `frameTexture` on its spec override the door
// type's (or the deck's default) leaf and frame; unset means the type's. Plain texture set ids,
// built-in or shared (the same ids as a prop's or a wall's texture).
import type { Vec2 } from "./types";

export const DOOR_TEXTURE_FIELDS = ["leafTexture", "frameTexture"] as const;
export type DoorTextureField = typeof DOOR_TEXTURE_FIELDS[number];

// the ids a shared texture can have (see readDoorType: the same rule)
export const readDoorTexture = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-z0-9_-]+$/i.test(value) ? value : undefined;

type Textured = { leafTexture?: string; frameTexture?: string };

// every texture set the doors name themselves (for loading the shared ones a map needs)
export function doorTextureIds(doors: readonly Textured[] | undefined): string[] {
  const ids = new Set<string>();
  for (const door of doors ?? []) for (const field of DOOR_TEXTURE_FIELDS) if (door[field]) ids.add(door[field]!);
  return [...ids];
}

// the doors' own textures that no texture set answers to
export function unknownDoorTextures(
  doors: readonly (Textured & { cell: Vec2 })[] | undefined,
  known: (id: string) => boolean,
): { cell: Vec2; field: DoorTextureField; id: string }[] {
  const out: { cell: Vec2; field: DoorTextureField; id: string }[] = [];
  for (const door of doors ?? []) for (const field of DOOR_TEXTURE_FIELDS) {
    const id = door[field];
    if (id && !known(id)) out.push({ cell: door.cell, field, id });
  }
  return out;
}
