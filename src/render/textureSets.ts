// Texture sets: the renderer's texture set ids, where each one's files live
// under public/textures/, and what it is for. The map editor's palette reads
// this table (see EDITOR.md) - a set can't be named without being here, since
// TextureSetId is the table's own keys.

export type TextureSetKind = "wall" | "floor" | "ceiling" | "door" | "window" | "propFace";

// the files of any texture set, listed or not (see textureFolder)
export interface TextureSetFiles {
  diffuse: string;
  normal: string;
  depth: string;
  pixelArt: boolean;
  // mask of the parts that glow when lit (a ceiling light panel)
  emissive?: string;
  // a glow map: what isn't black in it always shines in its own color,
  // whatever the light (a status strip, indicator lamps, a screen)
  glow?: string;
  // how shiny and how metal each texel is: green the roughness, blue the
  // metalness (texture:process --gloss/--metal) - else the viewer's own
  surface?: string;
  // a grate floor: its lowest this many height levels are the slots, cut
  // open where it's a bridge deck (see through it)
  grateLevels?: number;
}

export interface TextureSetPaths extends TextureSetFiles {
  // which palettes the set belongs to (the lift cabin's plates are both
  // floor and wall, for example)
  kind: TextureSetKind | TextureSetKind[];
  // short name for the palette buttons
  label: string;
}

export const TEXTURE_SETS = {
  // import.meta.env.BASE_URL matches Vite's `base` config (e.g. "/voidcrew/"
  // on GitHub Pages) - a hardcoded "/textures/..." would 404 there since the
  // app isn't served from the domain root.
  wall1: {
    kind: "wall", label: "Wall 1",
    diffuse: `${import.meta.env.BASE_URL}textures/wall1/diffuse.jpeg`,
    normal: `${import.meta.env.BASE_URL}textures/wall1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall1/depth.png`,
    pixelArt: false,
  },
  wall2: {
    kind: "wall", label: "Wall 2",
    diffuse: `${import.meta.env.BASE_URL}textures/wall2/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall2/normal.png`,
    // wall2 has no real depth map from the Sprite Lamp pass - flat/neutral
    // fallback so displacement is just a no-op instead of erroring.
    depth: `${import.meta.env.BASE_URL}textures/wall2/depth.png`,
    pixelArt: true,
  },
  wall3: {
    kind: "wall", label: "Wall 3",
    diffuse: `${import.meta.env.BASE_URL}textures/wall3/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall3/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall3/depth.png`,
    pixelArt: true,
  },
  // Gemini 1254px diffuse + depth run through scripts/process-texture.ts
  // (256px, 32 colors, baked height levels, normal derived from depth)
  wall4: {
    kind: "wall", label: "Wall 4",
    diffuse: `${import.meta.env.BASE_URL}textures/wall4/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall4/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall4/depth.png`,
    glow: `${import.meta.env.BASE_URL}textures/wall4/glow.png`,
    pixelArt: true,
  },
  wall5: {
    kind: "wall", label: "Wall 5",
    diffuse: `${import.meta.env.BASE_URL}textures/wall5/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall5/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall5/depth.png`,
    glow: `${import.meta.env.BASE_URL}textures/wall5/glow.png`,
    pixelArt: true,
  },
  // one floor tile per cell: a grate with recessed slots
  floor1: {
    kind: "floor", label: "Grate floor",
    diffuse: `${import.meta.env.BASE_URL}textures/floor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/floor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/floor1/depth.png`,
    pixelArt: true,
    grateLevels: 2,
  },
  // diamond plate with a raised frame
  floor2: {
    kind: "floor", label: "Diamond plate",
    diffuse: `${import.meta.env.BASE_URL}textures/floor2/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/floor2/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/floor2/depth.png`,
    pixelArt: true,
  },
  // sliding door panel
  door1: {
    kind: "door", label: "Sliding door",
    diffuse: `${import.meta.env.BASE_URL}textures/door1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/door1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/door1/depth.png`,
    pixelArt: true,
  },
  // door frame; its opening is transparent in both diffuse and depth
  doorframe1: {
    kind: "door", label: "Door frame",
    diffuse: `${import.meta.env.BASE_URL}textures/doorframe1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/doorframe1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/doorframe1/depth.png`,
    pixelArt: true,
  },
  // lift door panel: slides sideways; a blank field on its left takes a label
  liftdoor1: {
    kind: "door", label: "Lift door",
    diffuse: `${import.meta.env.BASE_URL}textures/liftdoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/liftdoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/liftdoor1/depth.png`,
    pixelArt: true,
  },
  // lift cabin wall: two plain plates
  lift1: {
    kind: ["floor", "wall"], label: "Lift cabin",
    diffuse: `${import.meta.env.BASE_URL}textures/lift1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/lift1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/lift1/depth.png`,
    pixelArt: true,
  },
  // lift cabin ceiling: two light strips that glow (emissive)
  liftceil1: {
    kind: "ceiling", label: "Lift ceiling",
    diffuse: `${import.meta.env.BASE_URL}textures/liftceil1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/liftceil1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/liftceil1/depth.png`,
    emissive: `${import.meta.env.BASE_URL}textures/liftceil1/emissive.png`,
    pixelArt: true,
  },
  // the medical deck (generated from concept/medical_concept.png): sterile
  // light grey plates with medical-green accents
  // crew quarters wall panel
  crewwall1: {
    kind: "wall", label: "Crew wall",
    diffuse: `${import.meta.env.BASE_URL}textures/crewwall1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crewwall1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crewwall1/depth.png`,
    pixelArt: true,
  },
  medwall1: {
    kind: "wall", label: "Med wall",
    diffuse: `${import.meta.env.BASE_URL}textures/medwall1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwall1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwall1/depth.png`,
    pixelArt: true,
  },
  // the officers' bridge: walnut, marble and brass gone to ruin, royal-blue
  // trim (the livery's)
  bridgewall1: {
    kind: "wall", label: "Bridge wood",
    diffuse: `${import.meta.env.BASE_URL}textures/bridgewall1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/bridgewall1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/bridgewall1/depth.png`,
    surface: `${import.meta.env.BASE_URL}textures/bridgewall1/surface.png`,
    pixelArt: true,
  },
  bridgewall2: {
    kind: "wall", label: "Bridge marble",
    diffuse: `${import.meta.env.BASE_URL}textures/bridgewall2/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/bridgewall2/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/bridgewall2/depth.png`,
    surface: `${import.meta.env.BASE_URL}textures/bridgewall2/surface.png`,
    pixelArt: true,
  },
  bridgewall3: {
    kind: "wall", label: "Bridge consoles",
    diffuse: `${import.meta.env.BASE_URL}textures/bridgewall3/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/bridgewall3/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/bridgewall3/depth.png`,
    surface: `${import.meta.env.BASE_URL}textures/bridgewall3/surface.png`,
    glow: `${import.meta.env.BASE_URL}textures/bridgewall3/glow.png`,
    pixelArt: true,
  },
  bridgewall4: {
    kind: "wall", label: "Bridge wrecked",
    diffuse: `${import.meta.env.BASE_URL}textures/bridgewall4/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/bridgewall4/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/bridgewall4/depth.png`,
    surface: `${import.meta.env.BASE_URL}textures/bridgewall4/surface.png`,
    pixelArt: true,
  },
  medfloor1: {
    kind: "floor", label: "Med floor",
    diffuse: `${import.meta.env.BASE_URL}textures/medfloor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medfloor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medfloor1/depth.png`,
    pixelArt: true,
  },
  medceil1: {
    kind: "ceiling", label: "Med ceiling",
    diffuse: `${import.meta.env.BASE_URL}textures/medceil1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medceil1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medceil1/depth.png`,
    emissive: `${import.meta.env.BASE_URL}textures/medceil1/emissive.png`,
    pixelArt: true,
  },
  // the crew quarters' doors, frame and window
  crewdoor1: {
    kind: "door", label: "Crew door",
    diffuse: `${import.meta.env.BASE_URL}textures/crewdoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crewdoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crewdoor1/depth.png`,
    pixelArt: true,
  },
  crewdoorframe1: {
    kind: "door", label: "Crew door frame",
    diffuse: `${import.meta.env.BASE_URL}textures/crewdoorframe1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crewdoorframe1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crewdoorframe1/depth.png`,
    pixelArt: true,
  },
  crewliftdoor1: {
    kind: "door", label: "Crew lift door",
    diffuse: `${import.meta.env.BASE_URL}textures/crewliftdoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crewliftdoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crewliftdoor1/depth.png`,
    pixelArt: true,
  },
  crewwindow1: {
    kind: "window", label: "Crew window",
    diffuse: `${import.meta.env.BASE_URL}textures/crewwindow1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crewwindow1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crewwindow1/depth.png`,
    pixelArt: true,
  },
  meddoor1: {
    kind: "door", label: "Med door",
    diffuse: `${import.meta.env.BASE_URL}textures/meddoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/meddoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/meddoor1/depth.png`,
    pixelArt: true,
  },
  // door frame: its opening is transparent
  meddoorframe1: {
    kind: "door", label: "Med door frame",
    diffuse: `${import.meta.env.BASE_URL}textures/meddoorframe1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/meddoorframe1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/meddoorframe1/depth.png`,
    pixelArt: true,
  },
  medliftdoor1: {
    kind: "door", label: "Med lift door",
    diffuse: `${import.meta.env.BASE_URL}textures/medliftdoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medliftdoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medliftdoor1/depth.png`,
    pixelArt: true,
  },
  // wall panel with a window frame; its opening is transparent
  window1: {
    kind: "window", label: "Window",
    diffuse: `${import.meta.env.BASE_URL}textures/window1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1/depth.png`,
    pixelArt: true,
  },
  // the pieces of a wider window (scripts/make-window-strip.ts): its ends
  // and a middle that repeats, split by mullions on the seams
  window1_left: {
    kind: "window", label: "Window left",
    diffuse: `${import.meta.env.BASE_URL}textures/window1_left/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1_left/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1_left/depth.png`,
    pixelArt: true,
  },
  window1_mid: {
    kind: "window", label: "Window mid",
    diffuse: `${import.meta.env.BASE_URL}textures/window1_mid/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1_mid/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1_mid/depth.png`,
    pixelArt: true,
  },
  window1_right: {
    kind: "window", label: "Window right",
    diffuse: `${import.meta.env.BASE_URL}textures/window1_right/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1_right/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1_right/depth.png`,
    pixelArt: true,
  },
  medwindow1: {
    kind: "window", label: "Med window",
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1/depth.png`,
    pixelArt: true,
  },
  medwindow1_left: {
    kind: "window", label: "Med window left",
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1_left/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1_left/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1_left/depth.png`,
    pixelArt: true,
  },
  medwindow1_mid: {
    kind: "window", label: "Med window mid",
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1_mid/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1_mid/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1_mid/depth.png`,
    pixelArt: true,
  },
  medwindow1_right: {
    kind: "window", label: "Med window right",
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1_right/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1_right/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1_right/depth.png`,
    pixelArt: true,
  },
  // a prop crate's sides and top (see src/game/props.ts)
  crate1: {
    kind: "propFace", label: "Crate",
    diffuse: `${import.meta.env.BASE_URL}textures/crate1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crate1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crate1/depth.png`,
    pixelArt: true,
  },
  crate1_top: {
    kind: "propFace", label: "Crate top",
    diffuse: `${import.meta.env.BASE_URL}textures/crate1_top/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crate1_top/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crate1_top/depth.png`,
    pixelArt: true,
  },
  // a prop's orthographic views (see src/game/props.ts)
  medbed1_front: {
    kind: "propFace", label: "Med bed front",
    diffuse: `${import.meta.env.BASE_URL}textures/medbed1_front/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medbed1_front/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medbed1_front/depth.png`,
    pixelArt: true,
  },
  medbed1_side: {
    kind: "propFace", label: "Med bed side",
    diffuse: `${import.meta.env.BASE_URL}textures/medbed1_side/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medbed1_side/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medbed1_side/depth.png`,
    pixelArt: true,
  },
  medbed1_top: {
    kind: "propFace", label: "Med bed top",
    diffuse: `${import.meta.env.BASE_URL}textures/medbed1_top/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medbed1_top/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medbed1_top/depth.png`,
    pixelArt: true,
  },
  // ceiling tile; its center panel glows in cells with a ceiling light
  ceiling1: {
    kind: "ceiling", label: "Ceiling tile",
    diffuse: `${import.meta.env.BASE_URL}textures/ceiling1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/ceiling1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/ceiling1/depth.png`,
    emissive: `${import.meta.env.BASE_URL}textures/ceiling1/emissive.png`,
    pixelArt: true,
  },
};

// a texture set that isn't listed: the maps in public/textures/<name>/
// the unlisted folders (props' views) that have a glow map too - a glow.png
// next to their diffuse (see TextureSetFiles.glow)
const FOLDER_GLOWS = new Set(["kitchen1_front"]);

export function textureFolder(name: string): TextureSetFiles {
  const base = `${import.meta.env.BASE_URL}textures/${name}/`;
  return {
    diffuse: `${base}diffuse.png`,
    normal: `${base}normal.png`,
    depth: `${base}depth.png`,
    pixelArt: true,
    ...(FOLDER_GLOWS.has(name) ? { glow: `${base}glow.png` } : {}),
  };
}

export function isTextureSetId(id: string | undefined): id is TextureSetId {
  return id !== undefined && id in TEXTURE_SETS;
}
export type TextureSetId = keyof typeof TEXTURE_SETS;

// the sets offered for one surface (the editor's palette)
export function textureSetsOfKind(kind: TextureSetKind): TextureSetId[] {
  return (Object.keys(TEXTURE_SETS) as TextureSetId[]).filter((id) => {
    const k = TEXTURE_SETS[id].kind;
    return Array.isArray(k) ? k.includes(kind) : k === kind;
  });
}