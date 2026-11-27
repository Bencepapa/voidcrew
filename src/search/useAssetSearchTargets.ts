import { useMemo } from "react";
import { SAMPLE_IDS, SAMPLES } from "../audio/samples";
import { useSharedActorVersion } from "../editor/sharedActors";
import { useSharedPropVersion } from "../editor/sharedProps";
import { useSharedSounds } from "../editor/sharedSounds";
import { textureStatus, useTextureVersion } from "../editor/textureLibrary";
import { ACTOR_TYPES } from "../game/actors";
import { ITEM_TYPES } from "../game/items";
import { PROP_TYPES } from "../game/props";
import { assetInWorld, assetWorld } from "../game/worlds";
import { dictionaryText, hasKey, type Key } from "../i18n";
import { useSharedImages } from "../render/sharedImages";
import { TEXTURE_SETS } from "../render/textureSets";
import { assetTarget, type SearchAsset } from "./assetTargets";

const worldFor = (id: string) => assetInWorld(id, "fantasy") && assetInWorld(id, "scifi") ? undefined : assetWorld(id);
const translatedName = (name: string): Key | undefined => {
  const key = `assetTree.name.${name}`;
  return hasKey(key) && dictionaryText(key, "hu") !== undefined ? key : undefined;
};
const surfaceOrder = ["wall", "floor", "ceiling"] as const;
const surfaceTags = { wall: "fal", floor: "padló", ceiling: "plafon" };

export function useAssetSearchTargets() {
  const props = useSharedPropVersion();
  const textures = useTextureVersion();
  const actors = useSharedActorVersion();
  const images = useSharedImages();
  const sounds = useSharedSounds();

  const propTargets = useMemo(() => Object.entries(PROP_TYPES).map(([id, prop]) => {
    const tab = prop.kind === "pillar" || prop.kind === "chamfer" ? "pillar" :
      prop.kind === "billboard" || prop.kind === "cross" ? "billboard" : "3D";
    const tree = prop.kind === "fence" ? { group: "fence", entry: `fence:${prop.form}` } :
      prop.kind === "operable" ? { group: "operable", entry: id } : { group: "prop", entry: id, tab };
    const nameKey = prop.kind === "fence" ? `fence.${prop.form}` as const : prop.name ? undefined : translatedName(id);
    return assetTarget({
      kind: "assetProp", id, name: prop.name ?? id, nameKey, world: worldFor(id), category: prop.kind, tree,
      tags: ["prop", "tárgy", ...(prop.kind === "prism" ? ["csillag", "sokszög", "polygon", "star"] : [])],
    });
  }), [props]);

  const textureTargets = useMemo(() => Object.entries(TEXTURE_SETS).filter(([id]) => textureStatus(id) !== "new").map(([id, texture]) => {
    const kinds = [texture.kind].flat();
    const surface = surfaceOrder.find(kind => kinds.includes(kind));
    return assetTarget({
      kind: "assetTexture", id, name: texture.label, nameKey: translatedName(texture.label), world: worldFor(id),
      category: kinds.join(" "), tags: ["texture", "textúra", ...surfaceOrder.filter(kind => kinds.includes(kind)).map(kind => surfaceTags[kind])],
      tree: surface ? { group: "texture", entry: `${surface}:${id}`, tab: surface } : undefined,
    });
  }), [textures]);

  const actorTargets = useMemo(() => Object.entries(ACTOR_TYPES).map(([id, actor]) => assetTarget({
    kind: "assetActor", id, name: actor.name, nameKey: translatedName(actor.name), world: worldFor(id),
    category: "NPC", tags: ["actor", "szereplő"], tree: { group: "robot", entry: id },
  })), [actors]);

  const itemTargets = useMemo(() => Object.entries(ITEM_TYPES).map(([id, item]) => assetTarget({
    kind: "assetItem", id, name: item.name, nameKey: translatedName(item.name), world: worldFor(id),
    category: item.category, tags: ["item", "pickup", "felszedhető", "tárgy"], tree: { group: "item", entry: id },
  })), [images]);

  const soundTargets = useMemo(() => {
    const builtins: SearchAsset[] = SAMPLE_IDS.map(id => ({
      kind: "assetSound", id, name: SAMPLES[id].name, nameKey: `sound.sample.${id}`,
      category: SAMPLES[id].category, tree: { group: "sound", entry: `sample:${id}` }, tags: ["sound", "hang"],
    }));
    return [...builtins, ...sounds.map(({ id, name, world, category }): SearchAsset => ({
      kind: "assetSound", id, name, world, category, tree: { group: "sound", entry: id },
      tags: ["sound", "hang", dictionaryText(`sound.assets.category.${category}`, "hu") ?? ""],
    }))].map(assetTarget);
  }, [sounds]);

  return useMemo(() => [...propTargets, ...textureTargets, ...actorTargets, ...itemTargets, ...soundTargets],
    [propTargets, textureTargets, actorTargets, itemTargets, soundTargets]);
}
