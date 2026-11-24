// The guest's way to the shared store: no listing, no polling, no loading of the whole store. The map on screen says
// which shared ids it references (game/mapSharedRefs.ts); each one that is not bundled and not registered yet is
// fetched by its own folder (one folder listing + its meta.json + the files the game then uses). A prop's or door
// type's own textures are known once its definition is in, so the lookup repeats until nothing new is missing.
//
// Not covered (they stay as the bundled files give them, see the report of the egress work): shared dialogue
// libraries and shops (`npm run pull:shared` bundles them into src/), other maps' loading pictures, anything an
// id in a story text names.

import { ACTOR_TYPES } from "../game/actors";
import { isSharedDefinitionId, isSharedImageId, isSharedTextureId, mapSharedRefs, worldOfAssetId } from "../game/mapSharedRefs";
import { PROP_TYPES } from "../game/props";
import type { GameMap } from "../game/types";
import type { WorldId } from "../game/worlds";
import { sharedImage } from "../render/sharedImages";
import { isTextureSetId } from "../render/textureSets";
import { sharedConfigured } from "./sharedAuth";
import { loadSharedActorsById } from "./sharedActors";
import { doorType, loadSharedDoorsById } from "./sharedDoorTypes";
import { loadSharedImagesById } from "./sharedImages";
import { loadSharedPropsById } from "./sharedProps";
import { loadSharedTexturesById } from "./sharedTextures";

const MAX_ROUNDS = 3;
// ids asked for in this page load, found or not: a missing one is not asked again
const asked = new Set<string>();

const byWorld = (ids: Iterable<string>) => {
  const groups = new Map<WorldId, Set<string>>();
  for (const id of ids) {
    const world = worldOfAssetId(id);
    if (!groups.has(world)) groups.set(world, new Set());
    groups.get(world)!.add(id);
  }
  return groups;
};

/** What the map references that is not registered yet and was not asked for before. */
function missing(map: GameMap, extraImages: readonly string[]) {
  const refs = mapSharedRefs(map, {
    propTexture: (id) => (PROP_TYPES[id] as { texture?: string } | undefined)?.texture,
    doorTextures: (id) => { const type = doorType(id); return type ? [type.leaf, type.frame] : []; },
  });
  for (const id of extraImages) if (isSharedImageId(id)) refs.images.add(id);
  const fresh = (ids: Iterable<string>, known: (id: string) => boolean) => [...ids].filter(id => !asked.has(id) && !known(id));
  return {
    textures: fresh(refs.textures, id => isTextureSetId(id) || !isSharedTextureId(id)),
    images: fresh(refs.images, id => !!sharedImage(id)),
    props: fresh(refs.props, id => !!PROP_TYPES[id]),
    doors: fresh(refs.doors, id => !!doorType(id)),
    actors: fresh(refs.actors, id => !!ACTOR_TYPES[id]),
  };
}

/**
 * Loads the shared assets `map` references (and `extraImages`, e.g. the picture of an open interaction) that are
 * neither bundled nor registered. Cheap when there is nothing to do: one pass over the map.
 */
export async function loadSharedForMap(map: GameMap, extraImages: readonly string[] = []): Promise<void> {
  if (!sharedConfigured) return;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const need = missing(map, extraImages);
    const all = [...need.textures, ...need.images, ...need.props, ...need.doors, ...need.actors];
    if (!all.length) return;
    for (const id of all) asked.add(id);
    const settle = (work: Promise<unknown>) => work.catch((error) => console.warn("[shared] could not load what the map references:", error));
    const definitions = (ids: string[], load: (world: WorldId, set: ReadonlySet<string>) => Promise<void>) =>
      [...byWorld(ids)].map(([world, set]) => settle(load(world, set)));
    await Promise.all([
      settle(loadSharedTexturesById(need.textures)),
      settle(loadSharedImagesById(need.images)),
      ...definitions(need.props.filter(isSharedDefinitionId), loadSharedPropsById),
      ...definitions(need.doors.filter(isSharedDefinitionId), loadSharedDoorsById),
      ...definitions(need.actors.filter(isSharedDefinitionId), loadSharedActorsById),
    ]);
  }
}
