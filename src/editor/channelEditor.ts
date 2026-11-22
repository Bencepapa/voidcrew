// The one shape every Asset Manager category hands to the shared channel UI (ChannelControls.tsx): the maps it has
// (diffuse, normal, depth...), what each can do (upload, Auto, None, AI depth, normal from depth) and how a change is
// stored in the category's own draft. The Textures category was the first to have it (useTextureEditor in
// TexturePanel.tsx); props, pickups, decals and NPC sheets write a thin adapter over their own draft store.
//
// Pure: type imports only (erased at run time) plus the depth to normal conversion, so the tests run under tsx.

import { generateNormal } from "../render/depthNormal";
import type { Transparency } from "./imageTools";
import type { MapKey, MapMode } from "./textureDrafts";

export interface ChannelSlot { mode: MapMode; has: boolean }

// what the AI depth needs to know about the diffuse, and what the cards show
export interface ChannelView {
  pixelArt: boolean;
  transparency: Transparency;
  slot: (key: MapKey) => ChannelSlot;
}

export interface ChannelEditor {
  view?: ChannelView;
  // a change is being saved: the controls wait
  busy: boolean;
  // the depth is an AI result (a label only)
  aiDepth: boolean;
  // the cards the category has, in order; the AI section sits under "depth", or under "normal" when there is no depth
  channels: readonly MapKey[];
  // the mode buttons a channel offers (a single one: no buttons)
  modes: (key: MapKey) => MapMode[];
  chooseFile: (key: MapKey, file: File) => Promise<void>;
  // `open` asks for the file dialog (Uploaded chosen while nothing is uploaded yet)
  setMode: (key: MapKey, mode: MapMode, open?: () => void) => void;
  remove: (key: MapKey) => Promise<void>;
  diffuseBlob: () => Promise<Blob | null | undefined>;
  // the AI result: the depth (a category without a depth channel drops it) and optionally the normal made from it
  applyAiMaps: (depth: Blob, normal?: Blob) => Promise<void>;
  // "Normal from depth": the uploaded depth and where the made normal goes; a category that cannot do it leaves them out
  depthBlob?: () => Promise<Blob | null | undefined>;
  applyNormal?: (normal: Blob) => Promise<void>;
  onError: (message: string) => void;
}

// the modes of a texture's channels (what every adapter shows unless its format cannot store one)
export const TEXTURE_MODES = (key: MapKey): MapMode[] =>
  key === "diffuse" ? ["uploaded"] : key === "normal" || key === "depth" ? ["uploaded", "auto", "none"] : ["uploaded", "none"];

export const SURFACE_CHANNELS: readonly MapKey[] = ["diffuse", "normal", "depth"];

// which card carries the AI section (it makes a depth, so the depth card; with no depth channel the normal card)
export const aiChannelOf = (channels: readonly MapKey[]): MapKey | undefined =>
  channels.includes("depth") ? "depth" : channels.includes("normal") ? "normal" : undefined;

// the AI depth is only useful with a diffuse to read, and "Normal from depth" only with an uploaded depth
export const canGenerateAi = (view: ChannelView | undefined) => !!view?.slot("diffuse").has;
export function canDeriveNormal(editor: Pick<ChannelEditor, "view" | "depthBlob" | "applyNormal" | "channels">): boolean {
  const slot = editor.view?.slot("depth");
  return !!editor.depthBlob && !!editor.applyNormal && editor.channels.includes("normal") && editor.channels.includes("depth") &&
    !!slot && slot.mode === "uploaded" && slot.has;
}

// a normal map (RGBA pixels) from a depth map's pixels: the one conversion the AI run and the button share
export function normalPixelsFromDepth(depth: { data: Uint8ClampedArray; width: number; height: number }): Uint8ClampedArray {
  return generateNormal(depth.data, depth.width, depth.height);
}

// A prop's own texture: the shared texture whose id is derived from the prop's id (see propTextureId in sharedProps.ts).
// Returns the texture id when the prop uses it, otherwise "" (it uses somebody else's texture, or none yet).
export const propOwnTextureId = (propId: string) => propId.replace("_prop_", "_shared_");
export const ownedPropTexture = (propId: string, texture: string | undefined) =>
  texture && texture === propOwnTextureId(propId) ? texture : "";
