import type { Key } from "../i18n";
import type { SearchTarget } from "./targets";

const fields = {
  name: ["assetManager.image.name", "prop név", "prop name"],
  shape: ["assetManager.propDraft.shape", "csillag", "sokszög", "hasáb", "star", "polygon", "prism"],
  texture: ["assetManager.propDraft.texture", "tárgytextúra", "prop texture"],
  width: ["assetManager.propDraft.width", "prop szélesség", "prop width"],
  height: ["assetManager.propDraft.height", "prop magasság", "prop height"],
  depth: ["assetManager.propDraft.depth", "befoglaló mélység", "prop depth"],
  elevation: ["assetManager.propDraft.elevation", "prop emelés", "prop elevation"],
  shadow: ["assetManager.propDraft.shadow", "árnyék", "talajárnyék", "shadow", "shadow strength"],
  relief: ["assetManager.reliefDepth", "prop domborzat", "prop relief"],
  wall: ["assetManager.propDraft.wall", "falra szerelt", "wall mounted"],
  blocks: ["assetManager.propDraft.blocks", "ütközés", "collision"],
  sides: ["assetManager.propDraft.prismSides", "sokszög", "csillag", "polygon", "star", "prism sides"],
  inset: ["assetManager.propDraft.prismInset", "csillag", "behúzás", "star inset"],
  wrap: ["assetManager.propDraft.prismWrap", "textúra körbefutás", "sokszög", "prism wrap", "texture wrap"],
  textureB: ["assetManager.propDraft.textureB", "váltakozó textúra", "alternating texture"],
} as const satisfies Record<string, readonly [Key, ...string[]]>;

export type PropSearchField = keyof typeof fields;
export const propFieldTargetId = (field: PropSearchField) => `assetManager.prop.${field}`;
export const ASSET_MANAGER_TARGETS: readonly SearchTarget[] = (Object.keys(fields) as PropSearchField[]).map(propField => {
  const [titleKey, ...synonyms] = fields[propField];
  return {
    id: propFieldTargetId(propField), kind: "assetManager", titleKey, synonyms,
    keywords: ["asset manager", "assetkezelő", "prop", "tárgy"], propField,
  };
});
export interface AssetManagerSearchRequest { targetId: string; propField?: PropSearchField }
export const isPrismField = (field: PropSearchField) =>
  field === "sides" || field === "inset" || field === "wrap" || field === "textureB";
