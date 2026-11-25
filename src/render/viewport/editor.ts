import type { EditTool } from "../../editor/mapEdits";

// the map editor: how far (world units) it picks cells, and the highlight's
// colors - a wall to dig out, a floor to fill in
export const EDIT_REACH = 8;
export const EDIT_DIG_COLOR = 0xffa040;
export const EDIT_FILL_COLOR = 0x40d0ff;
// the Texture tool paints the surface green; the Light tool shows yellow
// where a click adds a ceiling light, blue where it takes one away
export const EDIT_PAINT_COLOR = 0x60ff80;
export const EDIT_LIGHT_ADD_COLOR = 0xffe040;
export const EDIT_SELECT_COLOR = 0x80f0ff;
// the editor tools whose layer can be locked (and the layer each edits)
export const TOOL_LAYER: Partial<Record<EditTool, string>> = { texture: "texture", light: "light", prop: "prop", roofauto: "prop", fenceblock: "prop", fenceedge: "prop", fencemid: "prop", decal: "decal", robot: "robot", item: "item", smoke: "smoke", sound: "sound" };
// the tools that work by strokes (a button held while the pointer crosses cells): the roof and the fences
export const STROKE_TOOLS: ReadonlySet<EditTool> = new Set<EditTool>(["roofauto", "fenceblock", "fenceedge", "fencemid"]);

export const EDIT_LIGHT_REMOVE_COLOR = 0x40d0ff;
