// Which shared (store) assets a map references by id. Pure: the editor's on-demand loader uses it, so a guest
// fetches exactly what the current map needs and nothing else (see editor/guestShared.ts).
//
// An id says what it is: `<world>_shared_<uuid>` a texture, `<world>_<decal|item|portrait>_<uuid>` an image,
// `<world>_<prop|door|actor>_<uuid>` a definition. A prop's or a door type's own textures are known only once
// its definition is loaded, so the caller asks again afterwards (the lookups below answer for what is loaded).

import type { GameMap } from "./types";

export interface SharedRefs {
  textures: Set<string>;
  images: Set<string>;
  props: Set<string>;
  doors: Set<string>;
  actors: Set<string>;
}

export interface RefLookups {
  /** The texture a loaded prop definition wears (undefined: not loaded / none). */
  propTexture: (propId: string) => string | undefined;
  /** The leaf and frame textures of a loaded door type. */
  doorTextures: (typeId: string) => readonly (string | undefined)[];
}

const UUID = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const TEXTURE = /^(?:fantasy|scifi)_shared_[A-Za-z0-9_-]+$/;
const IMAGE = new RegExp(`^(?:fantasy|scifi)_(?:decal|item|portrait)_${UUID}$`);
const PROP = new RegExp(`^(?:fantasy|scifi)_prop_${UUID}$`);
const DOOR = new RegExp(`^(?:fantasy|scifi)_door_${UUID}$`);
const ACTOR = new RegExp(`^(?:fantasy|scifi)_actor_${UUID}$`);

export const isSharedTextureId = (id: string) => TEXTURE.test(id);
export const isSharedImageId = (id: string) => IMAGE.test(id);
export const isSharedDefinitionId = (id: string) => PROP.test(id) || DOOR.test(id) || ACTOR.test(id);

/** Every shared id the map uses, by kind (the first loading picture only: not those of the maps it links to). */
export function mapSharedRefs(map: GameMap, lookups: RefLookups): SharedRefs {
  const refs: SharedRefs = { textures: new Set(), images: new Set(), props: new Set(), doors: new Set(), actors: new Set() };
  const texture = (id: string | undefined) => { if (id && TEXTURE.test(id)) refs.textures.add(id); };
  const image = (id: string | undefined) => { if (id && IMAGE.test(id)) refs.images.add(id); };
  const interaction = (value: { kind: string; image?: string; portrait?: string } | undefined) => {
    if (value?.kind === "image") image(value.image);
    else image(value?.portrait);
  };

  for (const id of Object.values(map.textures ?? {})) texture(id);
  // (painted cells: one pass over the grid)
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    texture(map.floorAt?.(x, y));
    texture(map.wallTextureAt?.(x, y));
    texture(map.ceilingTextureAt?.(x, y));
    if (map.faceTextureAt) for (const side of ["N", "E", "S", "W"] as const) texture(map.faceTextureAt(x, y, side));
  }

  for (const spec of map.props ?? []) {
    if (PROP.test(spec.prop)) {
      refs.props.add(spec.prop);
      texture(lookups.propTexture(spec.prop));
    }
    texture(spec.texture);
    for (const loot of spec.loot ?? []) image(loot.item);
    interaction(spec.interaction);
  }
  for (const spec of map.doors ?? []) {
    texture(spec.leafTexture);
    texture(spec.frameTexture);
    if (spec.type && DOOR.test(spec.type)) {
      refs.doors.add(spec.type);
      for (const id of lookups.doorTextures(spec.type)) texture(id);
    }
    interaction(spec.interaction);
  }
  for (const spec of map.actors ?? []) {
    if (ACTOR.test(spec.actor)) refs.actors.add(spec.actor);
    image(spec.portrait);
  }
  for (const spec of map.decals ?? []) {
    image(spec.decal);
    interaction(spec.interaction);
  }
  for (const spec of map.items ?? []) {
    image(spec.item);
    interaction(spec.interaction);
  }
  for (const target of map.wallInteractions ?? []) interaction(target.interaction);
  image(map.loadingImage);
  return refs;
}

/** The world an asset id belongs to (its prefix). */
export const worldOfAssetId = (id: string): "fantasy" | "scifi" => id.startsWith("scifi_") ? "scifi" : "fantasy";
