// Pure helpers for the shared store's content kinds that are not tied to one world
// (dialogue libraries, shops) and for bundling definition-style assets (props, doors, NPCs) into a release.
// Used by the editor's shared loaders and by scripts/pull-shared.ts (no browser or React here).
//
//   void-textures/common/dialogue/<id>/r<rev>/meta.json   { v, type: "dialogue", rev, definition: { name, twee } }
//   void-textures/common/shop/<id>/r<rev>/meta.json       { v, type: "shop", rev, definition: ShopDef }
//
// Both are JSON only, so the bucket's existing allowed types and policies cover them (no SQL needed).
import { parseShop, type ShopDef } from "./shop";

export const COMMON_FOLDER = "common";
export type CommonKind = "dialogue" | "shop";
export type DefinitionKind = "prop" | "door" | "actor";
export const MAX_TWEE_CHARS = 512 * 1024;

export interface SharedDialogueDefinition { name: string; twee: string }

const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const commonIdOk = (id: unknown): id is string => typeof id === "string" && idPattern.test(id);
export const commonFolder = (kind: CommonKind, id: string) => `${COMMON_FOLDER}/${kind}/${id}`;

/** The r<N> folder names of a listing as numbers, highest first (anything else is ignored). */
export const revisionNumbers = (names: readonly { name: string }[]): number[] =>
  names.flatMap(({ name }) => /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : [])
    .filter(Number.isSafeInteger).sort((a, b) => b - a);

export const nextRevision = (names: readonly { name: string }[]) => (revisionNumbers(names)[0] ?? 0) + 1;

export const commonMeta = (kind: CommonKind, rev: number, definition: object) => ({ v: 1, type: kind, rev, definition });

/** The definition inside a revision's meta.json, checked; undefined when it is not a usable `kind`. */
export function readCommonDefinition(kind: "dialogue", meta: unknown, id: string): SharedDialogueDefinition | undefined;
export function readCommonDefinition(kind: "shop", meta: unknown, id: string): ShopDef | undefined;
export function readCommonDefinition(kind: CommonKind, meta: unknown, id: string): SharedDialogueDefinition | ShopDef | undefined;
export function readCommonDefinition(kind: CommonKind, meta: unknown, id: string): SharedDialogueDefinition | ShopDef | undefined {
  if (!commonIdOk(id) || !meta || typeof meta !== "object") return;
  const { type, definition } = meta as { type?: unknown; definition?: unknown };
  if (type !== kind || !definition || typeof definition !== "object") return;
  if (kind === "shop") {
    const shop = parseShop(definition, id);
    return shop?.id === id ? shop : undefined;
  }
  const { name, twee } = definition as Partial<SharedDialogueDefinition>;
  if (typeof twee !== "string" || !twee.trim() || twee.length > MAX_TWEE_CHARS) return;
  return { name: typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : id, twee };
}

/** Where a bundled NPC's files are served from, relative to the site base (public/shared-actors/<id>/). */
export const bundledActorFolder = (id: string) => `shared-actors/${id}/`;

/** The files of a published NPC revision: the colour map (png or webp) and, when it has one, the normal map. */
export function actorFiles(definition: { diffuseFile?: string; hasNormal?: boolean }): string[] {
  const diffuse = definition.diffuseFile === "diffuse.webp" ? "diffuse.webp" : "diffuse.png";
  return definition.hasNormal === true ? [diffuse, "normal.png"] : [diffuse];
}

/** Ids of shared definitions look like <world>_<kind>_<uuid>; true when `id` is one of that world and kind. */
export const definitionIdOk = (world: string, kind: DefinitionKind, id: string) =>
  new RegExp(`^${world}_${kind}_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$`).test(id);
