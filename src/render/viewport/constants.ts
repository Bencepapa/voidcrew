import * as THREE from "three";
import type { Direction, DoorSpec } from "../../game/types";
import type { TextureSetId } from "../textureSets";

// custom HMR event sent by the texture hot-reload plugin in vite.config.ts
export const TEXTURE_CHANGED_EVENT = "voidcrew:texture-changed";
// how long the editor leaves the quick flat preview of its structural edits before the scene's full build
export const EDIT_SETTLE_MS = 3000;
export const LIGHT_EDIT_SETTLE_MS = 500;
export const ORIGIN_NDC = new THREE.Vector2(0, 0);

// objects wider or deeper than this (cells) are never culled
export const CULL_MAX_SIZE = 1.3;

// Doors: a door cell holds one door at its center, across the passage, so
// the doorway reads as a thick bulkhead with a shallow alcove on each side.
// The frame is a two-sided slab (two relief halves back to back, their
// opening's jambs meeting at the center plane); the panel is a thinner
// two-sided slab inside it, recessed behind the frame's faces, that slides
// up into the ceiling to open.
export const DOOR_FRAME_SET: TextureSetId = "doorframe1";
// Windows: the frame panel, how deep its opening recesses into the wall
// (the glass sits at the back), and the glass's slight cool tint
export const WINDOW_SET: TextureSetId = "window1";
export const WINDOW_DEPTH = 0.1;
export const NO_LAYERS: ReadonlySet<string> = new Set();

// ... and a coarser one: their faces are small, so a full-size height grid
// packs several times the walls' triangles into them
export const PROP_COARSE = 2;
export const GLASS_TINT = 0xdfe8ff;
// how strongly lights glint on the glass
export const GLASS_SHEEN = 0.25;

// how far away an interactive decal can be touched (world units)
export const TOUCH_REACH = 1.4;
// a camera's light on the crew: watching, raising the alarm
export const CAMERA_WATCH_LIGHT = 0xffc23a;
export const CAMERA_ALARM_LIGHT = 0xff2418;

// how far off a surface a free-standing light is placed (world units)
export const LIGHT_SPOT_GAP = 0.12;

// a surface's pixels across one panel (as decals count them - see decals.ts)
export const SURFACE_PIXELS = 256;
// smoke's own color where the map gives none (see SmokeSpec)
export const SMOKE_COLOR = 0xb4b8bc;
// how strongly a texture set's glow map shines (see TextureSetFiles.glow)
export const SURFACE_GLOW = 1.2;

export const DOOR_PANEL_SETS: Record<DoorSpec["kind"], TextureSetId> = {
  standard: "door1",
  lift: "liftdoor1",
};
// door group Y rotation that turns its local +Z toward the door's facing
export const FACING_ROTATION: Record<Direction, number> = {
  S: 0,
  E: Math.PI / 2,
  N: Math.PI,
  W: -Math.PI / 2,
};
// where a door's label goes on its panel texture (pixels): the blank field
// on the left of the lift door panel, minus the strip hidden behind the
// frame's jamb (the panel reaches DOOR_PANEL_OVERLAP behind the frame)
export const DOOR_LABEL_AREA = { x: 14, y: 8, w: 78, h: 240 };
// label letters are at most this many texture pixels per font pixel (a 5x7
// letter at 4 = 20x28 of the panel's 256px)
export const DOOR_LABEL_MAX_SCALE = 4;
// a lift door's deck number sits this far (panel pixels) above its label
export const DOOR_NUMBER_GAP = 12;
// the dark red of the walls' painted stripes
export const LABEL_PAINT: [number, number, number] = [156, 27, 26];
export const LABEL_PAINT_DARK: [number, number, number] = [133, 22, 24];
// each frame half's base plane sits this far from the center plane (keep it
// deeper than the frame relief's deepest recess)
export const DOOR_FRAME_HALF_DEPTH = 0.05;
// same for the panel: well behind the frame's faces
export const DOOR_PANEL_HALF_DEPTH = 0.02;
// how far the panel reaches behind the frame around the opening
export const DOOR_PANEL_OVERLAP = 0.03;
export const DOOR_OPEN_MS = 400;

// trim textures cut from the decals (scripts/make-trim-textures.ts), mapped
// at the walls' density: texels per world unit
export const TRIM_PAINT_URL = `${import.meta.env.BASE_URL}textures/trim_paint/diffuse.png`;
export const TRIM_HAZARD_URL = `${import.meta.env.BASE_URL}textures/trim_hazard/diffuse.png`;
export const TRIM_TEXELS = 256;

// Ladders (world units), in the worn yellow paint
export const LADDER_HALF_WIDTH = 0.16;
export const LADDER_RAIL = 0.03;
export const LADDER_RUNG = 0.022;
// in front of the step face, clear of its relief
export const LADDER_STANDOFF = 0.09;
// the rails reach this far above the ledge (wall heights)...
export const LADDER_HANDHOLD = 0.3;
// ...and come down onto it this far back from the edge
export const LADDER_NECK = 0.12;
// the low plate along a bridge deck's edges (world units): as tall as the
// hazard stripe band
export const BRIDGE_KICK = 16 / TRIM_TEXELS;
// the beams along a see-through deck's edges, under it
export const BRIDGE_STRINGER = 0.04;
