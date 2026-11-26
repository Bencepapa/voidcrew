import { fenceFormOf, fenceIndex, fenceModelSpec } from "../../game/fences";
import type { PropType } from "../../game/props";
import type { GameMap, PropSpec } from "../../game/types";
import { retextured } from "./propRetexture";

// a prop type's texture sets: a box's side and top, its views, or a
// cutout's one
export const propSets = (type: PropType, primarySet: string): string[] =>
  type.kind === "box"
    ? [type.side, type.top]
    : type.kind === "views"
      ? ["front", "side", "top"].map((v) => `${type.views}_${v}`)
      : type.kind === "cabin"
        ? [type.door, type.inside, `${type.views}_side`, `${type.views}_top`]
        : type.kind === "pillar"
          ? [type.texture ?? primarySet]
          : type.kind === "chamfer" || type.kind === "roof" || type.kind === "fence" || type.kind === "operable"
            ? []
            : [type.texture];

// what a prop's model depends on: its type and texture, and for a pillar or
// a chamfer its height and the wall texture around it
type PropModelMap = Pick<GameMap, "props" | "wallTextureAt" | "floorHeights" | "ceilingHeights">;

export function propBuildKey(m: PropModelMap, spec: PropSpec, index: number, deps: {
  wallHeight: number;
  primarySet: string;
  isTextureSetId: (id: string | undefined) => boolean;
  propTypes: Record<string, PropType>;
  propHeight: (map: PropModelMap, spec: PropSpec) => number;
}): string {
  const { wallHeight, primarySet, isTextureSetId, propTypes, propHeight } = deps;
  // a fence or block piece: its settings and what its neighbours make of it (see fenceModelSpec) - a
  // neighbour changing changes this piece's key
  if (fenceFormOf(spec.prop)) {
    const fences = fenceIndex(m.props);
    const piece = fences.byIndex.get(index);
    return piece ? `fence|${JSON.stringify(fenceModelSpec(fences, piece))}` : `${spec.prop}|`;
  }
  const texture = spec.texture ?? "";
  const type = retextured(propTypes[spec.prop], texture || undefined, isTextureSetId);
  if (type.kind !== "pillar" && type.kind !== "chamfer") return `${spec.prop}|${texture}`;
  const h = propHeight(m, spec) * wallHeight;
  // its own texture, else the wall texture painted in its cell or beside it, else the deck's
  const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => m.wallTextureAt?.(spec.cell.x + dx, spec.cell.y + dy))
    .find((id) => isTextureSetId(id));
  const own = texture || near;
  const setId = isTextureSetId(own) ? own : primarySet;
  return `${spec.prop}|${texture}|${h}|${setId}`;
}
