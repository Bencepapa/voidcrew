import type { PropType } from "../game/props";
import type { WorldId } from "../game/worlds";
import { isPrismField, type PropSearchField } from "../search/assetManagerTargets";
import type { PropDraft } from "./sharedProps";

export function findSearchProp(field: PropSearchField, world: WorldId, drafts: readonly PropDraft[], catalogue: Record<string, PropType>,
  inWorld: (id: string, world: WorldId) => boolean): string {
  const suitable = (prop: PropType) => isPrismField(field) ? prop.kind === "prism"
    : field === "relief" ? prop.kind === "panel" || prop.kind === "cross"
    : prop.kind === "panel" || prop.kind === "cross" || prop.kind === "prism" || prop.kind === "billboard";
  return drafts.find(draft => draft.world === world && suitable(draft.definition))?.id ??
    Object.entries(catalogue).find(([id, type]) => !drafts.some(draft => draft.id === id) && inWorld(id, world) && suitable(type))?.[0] ?? "";
}

export function searchPropExample(field: PropSearchField, world: WorldId, id: string, prop?: PropType): PropDraft {
  if (prop && (prop.kind === "panel" || prop.kind === "billboard" || prop.kind === "cross" || prop.kind === "prism")) {
    return { id, world, definition: { ...prop, name: prop.name ?? id } };
  }
  return { id: "", world, definition: { kind: isPrismField(field) ? "prism" : "panel", texture: "", size: [.6, .6, .6] } };
}
