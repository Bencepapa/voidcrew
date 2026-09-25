import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { cellAt } from "../game/map";
import { DIR_VECTOR } from "../game/movement";
import type { Direction, GameMap, Vec2 } from "../game/types";
import { createReliefWallGeometry, loadHeightGrid } from "../render/reliefMesh";
import { generateLights } from "../game/lights";
import { doorCellKey } from "../game/useGameState";
import { forwardOf } from "../game/freeMovement";
import type { FreePose } from "../game/freeMovement";
import type { PeekState } from "./useViewControls";

export type TextureSetId =
  | "wall1"
  | "wall2"
  | "wall3"
  | "wall4"
  | "wall5"
  | "floor1"
  | "floor2"
  | "door1"
  | "doorframe1"
  | "ceiling1";
export type WallProfileId = "flat" | "convex" | "concave" | "relief";

export interface ViewportSettings {
  textureSet: TextureSetId;
  // a second texture set used on a share of the walls
  accentTextureSet: TextureSetId | "none";
  accentRatio: number;
  // "map" = per cell, as the map specifies (GameMap.floorAt); a set id
  // forces that floor everywhere; "none" = plain dark floor
  floorTextureSet: TextureSetId | "map" | "none";
  // "none" = plain dark ceiling
  ceilingTextureSet: TextureSetId | "none";
  // step cell by cell (true) or move freely with joysticks/held keys (false)
  gridMovement: boolean;
  wallProfile: WallProfileId;
  eyeHeight: number;
  wallHeight: number;
  cameraPullback: number;
  moveDurationMs: number;
  fov: number;
  pointLightIntensity: number;
  ambientIntensity: number;
  bobEnabled: boolean;
  bevelFraction: number;
  bevelAngleDeg: number;
  displacementScale: number;
  reliefDepth: number;
  reliefLevels: number;
  reliefMinIsland: number;
  mapLightIntensity: number;
  roughness: number;
  metalness: number;
  normalStrength: number;
  // ambient occlusion (relief walls only): strength on ambient light, how
  // much it also darkens direct lights, and how far it looks for occluders
  aoIntensity: number;
  aoDirect: number;
  aoRadius: number;
}

export interface ReliefStats {
  trianglesPerWall: number;
  levelCount: number;
  // levels came straight from the map's distinct grays
  baked: boolean;
}

export interface ViewportStats {
  // triangles actually drawn last frame (after frustum culling)
  renderedTriangles: number;
  // null unless the relief wall type is active and built
  relief: ReliefStats | null;
}

export const DEFAULT_SETTINGS: ViewportSettings = {
  textureSet: "wall4",
  accentTextureSet: "wall5",
  accentRatio: 0.35,
  floorTextureSet: "map",
  ceilingTextureSet: "ceiling1",
  gridMovement: true,
  wallProfile: "relief",
  eyeHeight: 0.5,
  wallHeight: 1.0,
  cameraPullback: 0.3,
  moveDurationMs: 220,
  fov: 72,
  pointLightIntensity: 1.6,
  ambientIntensity: 0.35,
  bobEnabled: true,
  bevelFraction: 0.2,
  bevelAngleDeg: 30,
  displacementScale: 0.03,
  reliefDepth: 0.04,
  reliefLevels: 6,
  reliefMinIsland: 3,
  mapLightIntensity: 1.6,
  roughness: 0.55,
  metalness: 0.45,
  normalStrength: 1,
  aoIntensity: 1,
  aoDirect: 0.6,
  aoRadius: 6,
};

// three.js applies aoMap to ambient/indirect light only, so crevices facing a
// point light still light up fully. This extends the same occlusion term to
// direct light by `uCavity` (0 = physically standard, 1 = full) - a common
// stylization that makes cracks and step feet read as dark.
function addDirectLightOcclusion(material: THREE.MeshStandardMaterial, cavity: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCavity = cavity;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uCavity;")
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
#ifdef USE_AOMAP
  reflectedLight.directDiffuse *= mix( 1.0, ambientOcclusion, uCavity );
  reflectedLight.directSpecular *= mix( 1.0, ambientOcclusion, uCavity );
#endif`,
      );
  };
}

// A flat wall panel with the top/bottom edges beveled, like the classic
// sci-fi corridor look: floor and ceiling stay flush with the grid boundary,
// but the middle band bulges toward the room (convex, sign=+1) or recedes
// away from it (concave, sign=-1) via two angled bevels.
//
// Each wall face is built independently, so a naive width-uniform bevel
// doesn't meet correctly where two perpendicular walls share a corner: convex
// leaves a gap (both edges pull away from the true corner line in different
// directions) and concave overlaps (both edges push past it). The fix is to
// taper the bevel amount back to zero within a small margin of each side
// edge, so every panel is flush (z=0) exactly at the corner regardless of
// direction, and only bulges/recedes in its own middle stretch.
// `subdivisions` splits each coarse height-band/width-column into a fine
// grid - a displacementMap needs enough vertices to read as smooth relief
// instead of a handful of blocky quads.
function createBeveledWallGeometry(
  width: number,
  height: number,
  bevelFraction: number,
  bevelAngleDeg: number,
  sign: 1 | -1,
  subdivisions = 10,
): THREE.BufferGeometry {
  const bevelH = height * bevelFraction;
  // bevelAngleDeg is measured from horizontal (the floor/ceiling plane), not
  // from vertical - so recess = adjacent/opposite = bevelH / tan(angle).
  // Lower angle -> closer to flat/horizontal -> more dramatic recess.
  const recess = (bevelH / Math.tan((bevelAngleDeg * Math.PI) / 180)) * sign;
  const halfH = height / 2;
  const halfW = width / 2;
  const margin = Math.min(0.15, width * 0.2);

  // profile points (y, zBase) centered on the origin to match
  // THREE.PlaneGeometry's local coordinate convention (both are positioned
  // by the same `mesh.position.y = wallHeight / 2` call)
  const yProfile: [number, number][] = [
    [-halfH, 0],
    [-halfH + bevelH, recess],
    [halfH - bevelH, recess],
    [halfH, 0],
  ];

  // width columns: flush at the true edges, full effect inside the margin
  const xCols = [-halfW, -halfW + margin, halfW - margin, halfW];
  const taper = [0, 1, 1, 0];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let yi = 0; yi < yProfile.length - 1; yi++) {
    const [y0, z0base] = yProfile[yi];
    const [y1, z1base] = yProfile[yi + 1];

    // flat per-row normal from the height-direction slope only (the small
    // extra slope introduced by the width taper near corners is ignored -
    // an acceptable approximation given how narrow that margin is)
    const dy = y1 - y0;
    const dz = z1base - z0base;
    let ny = -dz;
    let nz = dy;
    const len = Math.hypot(ny, nz) || 1;
    ny /= len;
    nz /= len;
    if (nz < 0) {
      ny = -ny;
      nz = -nz;
    }

    for (let xi = 0; xi < xCols.length - 1; xi++) {
      const x0 = xCols[xi];
      const x1 = xCols[xi + 1];
      const t0 = taper[xi];
      const t1 = taper[xi + 1];
      const uvBase0 = yi / (yProfile.length - 1);
      const uvBase1 = (yi + 1) / (yProfile.length - 1);

      for (let sv = 0; sv < subdivisions; sv++) {
        const fv0 = sv / subdivisions;
        const fv1 = (sv + 1) / subdivisions;
        const yA = lerp(y0, y1, fv0);
        const yB = lerp(y0, y1, fv1);
        const zBaseA = lerp(z0base, z1base, fv0);
        const zBaseB = lerp(z0base, z1base, fv1);
        const uvA = lerp(uvBase0, uvBase1, fv0);
        const uvB = lerp(uvBase0, uvBase1, fv1);

        for (let sh = 0; sh < subdivisions; sh++) {
          const fh0 = sh / subdivisions;
          const fh1 = (sh + 1) / subdivisions;
          const xA = lerp(x0, x1, fh0);
          const xB = lerp(x0, x1, fh1);
          const tA = lerp(t0, t1, fh0);
          const tB = lerp(t0, t1, fh1);
          const uA = (xA + halfW) / width;
          const uB = (xB + halfW) / width;

          const v00 = [xA, yA, zBaseA * tA];
          const v10 = [xB, yA, zBaseA * tB];
          const v11 = [xB, yB, zBaseB * tB];
          const v01 = [xA, yB, zBaseB * tA];

          positions.push(...v00, ...v10, ...v11, ...v00, ...v11, ...v01);
          for (let k = 0; k < 6; k++) normals.push(0, ny, nz);
          uvs.push(uA, uvA, uB, uvA, uB, uvB, uA, uvA, uB, uvB, uA, uvB);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

interface TextureSetPaths {
  diffuse: string;
  normal: string;
  depth: string;
  pixelArt: boolean;
  // mask of the parts that glow when lit (a ceiling light panel)
  emissive?: string;
}

const TEXTURE_SETS: Record<TextureSetId, TextureSetPaths> = {
  // import.meta.env.BASE_URL matches Vite's `base` config (e.g. "/voidcrew/"
  // on GitHub Pages) - a hardcoded "/textures/..." would 404 there since the
  // app isn't served from the domain root.
  wall1: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall1/diffuse.jpeg`,
    normal: `${import.meta.env.BASE_URL}textures/wall1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall1/depth.png`,
    pixelArt: false,
  },
  wall2: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall2/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall2/normal.png`,
    // wall2 has no real depth map from the Sprite Lamp pass - flat/neutral
    // fallback so displacement is just a no-op instead of erroring.
    depth: `${import.meta.env.BASE_URL}textures/wall2/depth.png`,
    pixelArt: true,
  },
  wall3: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall3/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall3/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall3/depth.png`,
    pixelArt: true,
  },
  // Gemini 1254px diffuse + depth run through scripts/process-texture.ts
  // (256px, 32 colors, baked height levels, normal derived from depth)
  wall4: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall4/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall4/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall4/depth.png`,
    pixelArt: true,
  },
  wall5: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall5/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall5/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall5/depth.png`,
    pixelArt: true,
  },
  // one floor tile per cell: a grate with recessed slots
  floor1: {
    diffuse: `${import.meta.env.BASE_URL}textures/floor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/floor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/floor1/depth.png`,
    pixelArt: true,
  },
  // diamond plate with a raised frame
  floor2: {
    diffuse: `${import.meta.env.BASE_URL}textures/floor2/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/floor2/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/floor2/depth.png`,
    pixelArt: true,
  },
  // sliding door panel
  door1: {
    diffuse: `${import.meta.env.BASE_URL}textures/door1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/door1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/door1/depth.png`,
    pixelArt: true,
  },
  // door frame; its opening is transparent in both diffuse and depth
  doorframe1: {
    diffuse: `${import.meta.env.BASE_URL}textures/doorframe1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/doorframe1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/doorframe1/depth.png`,
    pixelArt: true,
  },
  // ceiling tile; its center panel glows in cells with a ceiling light
  ceiling1: {
    diffuse: `${import.meta.env.BASE_URL}textures/ceiling1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/ceiling1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/ceiling1/depth.png`,
    emissive: `${import.meta.env.BASE_URL}textures/ceiling1/emissive.png`,
    pixelArt: true,
  },
};

// warm white of a lit ceiling panel (matches the ceiling light color)
const LIGHT_PANEL_COLOR = 0xfff4e0;
const LIGHT_PANEL_INTENSITY = 1.6;

// floor used where the map doesn't specify one
const DEFAULT_FLOOR: TextureSetId = "floor1";

function isTextureSetId(id: string | undefined): id is TextureSetId {
  return id !== undefined && id in TEXTURE_SETS;
}

interface WallSlot {
  x: number;
  z: number;
  rotY: number;
  // ceiling tile under a ceiling light: use the kit's glowing material
  lit?: boolean;
}

// Everything the walls (or floors, ceilings) of one texture set need: its own
// materials and, in relief mode, its own geometry (built from that set's
// depth map).
interface WallKit {
  depthUrl: string;
  wallMat: THREE.MeshStandardMaterial;
  // relief step sides: same texture, no normal map (see reliefMesh.ts groups)
  sideMat: THREE.MeshStandardMaterial;
  // wallMat plus the set's emissive mask glowing, if it has one
  litMat?: THREE.MeshStandardMaterial;
  // disposed with the scene (incl. the relief AO map once built)
  textures: THREE.Texture[];
  slots: WallSlot[];
}

// Stable pseudo-random 0..1 per wall face, from its position (face centers
// sit on half-cell coordinates, so doubled they're integers). Keeps the
// accent texture on the same walls across reloads and setting changes.
function kitMaterials(kit: WallKit): THREE.MeshStandardMaterial[] {
  return kit.litMat ? [kit.wallMat, kit.sideMat, kit.litMat] : [kit.wallMat, kit.sideMat];
}

function wallVariantRoll(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 2), 374761393) ^ Math.imul(Math.round(z * 2), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// custom HMR event sent by the texture hot-reload plugin in vite.config.ts
const TEXTURE_CHANGED_EVENT = "voidcrew:texture-changed";

const FOG_NEAR = 1.6;
const FOG_FAR = 5.5;

// Map lights are served by a fixed pool of point lights reassigned to the
// nearest sources every frame: three.js compiles the light count into its
// shaders, so a constant pool avoids recompiles, and the per-pixel lighting
// cost stays bounded however many lights the map has. Lights fade out with
// distance so a source dropping out of the pool doesn't pop visibly.
const LIGHT_POOL_SIZE = 6;
const LIGHT_FADE_START = 3.5;
const LIGHT_FADE_END = 5;

// settings.fov is applied to the screen's shorter side; on a portrait screen
// that makes the vertical FOV large, capped here to limit distortion
const MAX_VERTICAL_FOV = 115;

// Doors: a door cell holds one door at its center, across the passage, so
// the doorway reads as a thick bulkhead with a shallow alcove on each side.
// The frame is a two-sided slab (two relief halves back to back, their
// opening's jambs meeting at the center plane); the panel is a thinner
// two-sided slab inside it, recessed behind the frame's faces, that slides
// up into the ceiling to open.
const DOOR_FRAME_SET: TextureSetId = "doorframe1";
const DOOR_PANEL_SET: TextureSetId = "door1";
// each frame half's base plane sits this far from the center plane (keep it
// deeper than the frame relief's deepest recess)
const DOOR_FRAME_HALF_DEPTH = 0.05;
// same for the panel: well behind the frame's faces
const DOOR_PANEL_HALF_DEPTH = 0.02;
// how far the panel reaches behind the frame around the opening
const DOOR_PANEL_OVERLAP = 0.03;
const DOOR_OPEN_MS = 400;

// a peek eases back to center once its input has been idle this long...
const PEEK_IDLE_MS = 300;
// ...with this time constant (s)
const PEEK_RETURN_TAU = 0.25;

interface GameViewportProps {
  map: GameMap;
  pos: Vec2;
  dir: Direction;
  openingDoor: Vec2 | null;
  // door cells ("x,y") that are open
  openDoors: ReadonlySet<string>;
  // free movement: called every frame with the frame time (s), returns the
  // camera pose; when absent the camera follows pos/dir on the grid
  freeTick?: (dt: number) => FreePose;
  // grid movement: glance-around yaw offset (see useViewControls); eased
  // back to 0 here once its input goes idle
  peekRef?: MutableRefObject<PeekState>;
  settings: ViewportSettings;
  onStats?: (stats: ViewportStats) => void;
}

// direction -> the Y rotation a boundary plane needs so its front face is
// visible from the walkable cell it belongs to (see derivation in-repo history)
const WALL_ROTATION: Record<Direction, number> = {
  N: 0,
  S: Math.PI,
  E: -Math.PI / 2,
  W: Math.PI / 2,
};

interface CamTarget {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

function computeTarget(pos: Vec2, dir: Direction): CamTarget {
  const fwd = DIR_VECTOR[dir];
  return { x: pos.x, z: pos.y, tx: pos.x + fwd.x, tz: pos.y + fwd.y };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// vertical FOV that shows `fov` degrees across the shorter screen side
function verticalFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const v = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(MAX_VERTICAL_FOV, v);
}

export function GameViewport({
  map,
  pos,
  dir,
  openingDoor,
  openDoors,
  freeTick,
  peekRef,
  settings,
  onStats,
}: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  // bumped whenever a file under public/textures changes on disk (dev only),
  // which rebuilds the scene with cache-busted texture URLs - edit a height
  // map in GIMP/Aseprite, save, and the walls update in place
  const [textureVersion, setTextureVersion] = useState(0);
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onChange = () => setTextureVersion((v) => v + 1);
    hot.on(TEXTURE_CHANGED_EVENT, onChange);
    return () => hot.off(TEXTURE_CHANGED_EVENT, onChange);
  }, []);
  // continuously-updated "where the camera actually is right now", read and
  // written every animation frame, whether mid-transition or settled
  const liveRef = useRef<CamTarget>(computeTarget(pos, dir));
  const animRef = useRef<{ from: CamTarget; to: CamTarget; start: number } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const peekRefRef = useRef(peekRef);
  peekRefRef.current = peekRef;

  useEffect(() => {
    const peek = peekRefRef.current?.current;
    if (peek?.snapTurn) {
      // a peek turned into this turn: the peek offset already carries the
      // view across, so jump the facing instead of swinging it again
      peek.snapTurn = false;
      animRef.current = null;
      liveRef.current = computeTarget(pos, dir);
      return;
    }
    animRef.current = { from: { ...liveRef.current }, to: computeTarget(pos, dir), start: performance.now() };
  }, [pos, dir]);

  const freeTickRef = useRef(freeTick);
  freeTickRef.current = freeTick;
  const freeMode = !!freeTick;
  // back to grid movement: glide from wherever free movement left the camera
  // onto the current cell and facing
  useEffect(() => {
    if (freeMode) return;
    animRef.current = { from: { ...liveRef.current }, to: computeTarget(pos, dir), start: performance.now() };
    // only on the mode switch - pos/dir changes are handled above
  }, [freeMode]);

  // door panels by door cell key ("x,y"); each remembers its open height in
  // userData.openY
  const doorPanelsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const doorAnimRef = useRef<{ panel: THREE.Object3D; start: number; from: number; to: number } | null>(null);
  const openDoorsRef = useRef(openDoors);
  openDoorsRef.current = openDoors;

  useEffect(() => {
    if (!openingDoor) return;
    const panel = doorPanelsRef.current.get(doorCellKey(openingDoor));
    if (panel) {
      doorAnimRef.current = { panel, start: performance.now(), from: panel.position.y, to: panel.userData.openY };
    }
  }, [openingDoor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);

    // anything past the fog's end renders pure black anyway, so the far plane
    // sits just beyond it and frustum culling skips those walls entirely
    // (a big saving with relief walls' thousands of triangles each)
    const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, FOG_FAR + 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x445566, settings.ambientIntensity);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(0xfff2d9, settings.pointLightIntensity, 8, 2);
    scene.add(pointLight);

    const bust = textureVersion ? `?v=${textureVersion}` : "";
    const loader = new THREE.TextureLoader();
    const isRelief = settings.wallProfile === "relief";
    const wallHeight = settings.wallHeight;
    const cavity = { value: settings.aoDirect };

    // `displace`: whether flat/beveled geometry gets the depth map as
    // displacement - not for floors, whose single quad would only tilt
    function createWallKit(setId: TextureSetId, displace = true): WallKit {
      const paths = TEXTURE_SETS[setId];
      const diffuse = loader.load(paths.diffuse + bust);
      const normalMap = loader.load(paths.normal + bust);
      const depthMap = loader.load(paths.depth + bust);
      diffuse.colorSpace = THREE.SRGBColorSpace;
      if (paths.pixelArt) {
        // crisp texels up close instead of bilinear blur; minification keeps
        // mipmaps so distant walls don't shimmer
        diffuse.magFilter = THREE.NearestFilter;
        normalMap.magFilter = THREE.NearestFilter;
      }
      const wallMat = new THREE.MeshStandardMaterial({
        map: diffuse,
        normalMap,
        // relief walls already carry the depth as real geometry
        displacementMap: isRelief || !displace ? null : depthMap,
        displacementScale: settings.displacementScale,
        roughness: settings.roughness,
        metalness: settings.metalness,
      });
      const sideMat = new THREE.MeshStandardMaterial({
        map: diffuse,
        roughness: settings.roughness,
        metalness: settings.metalness,
      });
      addDirectLightOcclusion(wallMat, cavity);
      addDirectLightOcclusion(sideMat, cavity);
      const textures = [diffuse, normalMap, depthMap];

      let litMat: THREE.MeshStandardMaterial | undefined;
      if (paths.emissive) {
        const emissiveMap = loader.load(paths.emissive + bust);
        if (paths.pixelArt) emissiveMap.magFilter = THREE.NearestFilter;
        textures.push(emissiveMap);
        litMat = new THREE.MeshStandardMaterial({
          map: diffuse,
          normalMap,
          roughness: settings.roughness,
          metalness: settings.metalness,
          emissive: LIGHT_PANEL_COLOR,
          emissiveMap,
          emissiveIntensity: LIGHT_PANEL_INTENSITY,
        });
        addDirectLightOcclusion(litMat, cavity);
      }

      return { depthUrl: paths.depth + bust, wallMat, sideMat, litMat, textures, slots: [] };
    }

    // most walls use the main texture set; a stable, position-based share of
    // them gets the accent set for variety
    const primaryKit = createWallKit(settings.textureSet);
    const accentKit =
      settings.accentTextureSet !== "none" &&
      settings.accentTextureSet !== settings.textureSet &&
      settings.accentRatio > 0
        ? createWallKit(settings.accentTextureSet)
        : null;
    const kits = accentKit ? [primaryKit, accentKit] : [primaryKit];
    // floor kits are created on demand, one per floor texture actually used
    const floorKits = new Map<TextureSetId, WallKit>();
    function floorKitAt(x: number, y: number): WallKit | null {
      const choice = settings.floorTextureSet;
      if (choice === "none") return null;
      const fromMap = map.floorAt?.(x, y);
      const setId = choice !== "map" ? choice : isTextureSetId(fromMap) ? fromMap : DEFAULT_FLOOR;
      let kit = floorKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        floorKits.set(setId, kit);
      }
      return kit;
    }

    const ceilingKit = settings.ceilingTextureSet !== "none" ? createWallKit(settings.ceilingTextureSet, false) : null;
    // cells with a ceiling light: their ceiling tile's light panel glows
    const mapLights = generateLights(map);
    const litCells = new Set(
      mapLights.filter((l) => l.kind === "ceiling").map((l) => `${Math.round(l.x)},${Math.round(l.z)}`),
    );

    const frameKit = createWallKit(DOOR_FRAME_SET, false);
    const panelKit = createWallKit(DOOR_PANEL_SET, false);
    // door cells, with the Y rotation that faces the door along the passage
    const doorCells: { x: number; z: number; rotY: number; key: string }[] = [];
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 1 });

    const WALL_SUBDIVISIONS = 10;
    // relief geometry needs the height map's pixels, so it's built once the
    // image has loaded; flat/beveled walls are ready immediately
    const geometries: THREE.BufferGeometry[] = [];
    let wallGeo: THREE.BufferGeometry | null = null;
    if (settings.wallProfile === "flat") {
      wallGeo = new THREE.PlaneGeometry(1, wallHeight, WALL_SUBDIVISIONS * 3, WALL_SUBDIVISIONS * 3);
    } else if (settings.wallProfile === "convex" || settings.wallProfile === "concave") {
      wallGeo = createBeveledWallGeometry(
        1,
        wallHeight,
        settings.bevelFraction,
        settings.bevelAngleDeg,
        settings.wallProfile === "convex" ? 1 : -1,
        WALL_SUBDIVISIONS,
      );
    }
    if (wallGeo) geometries.push(wallGeo);
    const floorGeo = new THREE.PlaneGeometry(1, 1);
    geometries.push(floorGeo);

    const group = new THREE.Group();
    scene.add(group);
    doorPanelsRef.current.clear();

    let reliefStats: ReliefStats | null = null;

    function placeWalls(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], slots: WallSlot[]) {
      for (const slot of slots) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(slot.x, wallHeight / 2, slot.z);
        mesh.rotation.y = slot.rotY;
        group.add(mesh);
      }
    }

    // wall-style geometry (facing +Z) laid flat, facing up
    function placeFloors(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], slots: WallSlot[]) {
      for (const slot of slots) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(slot.x, 0, slot.z);
        group.add(mesh);
      }
    }

    // ... and turned to face down from the ceiling; lit slots get the kit's
    // glowing front material
    function placeCeilings(geo: THREE.BufferGeometry, kit: WallKit, relief: boolean) {
      for (const slot of kit.slots) {
        const front = slot.lit && kit.litMat ? kit.litMat : kit.wallMat;
        const mesh = new THREE.Mesh(geo, relief ? [front, kit.sideMat] : front);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(slot.x, wallHeight, slot.z);
        group.add(mesh);
      }
    }

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (cellAt(map, x, y) === "wall") continue;

        const floorKit = floorKitAt(x, y);
        if (floorKit) {
          floorKit.slots.push({ x, z: y, rotY: 0 });
        } else {
          const floor = new THREE.Mesh(floorGeo, floorMat);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(x, 0, y);
          group.add(floor);
        }

        if (ceilingKit) {
          ceilingKit.slots.push({ x, z: y, rotY: 0, lit: litCells.has(`${x},${y}`) });
        } else {
          const ceiling = new THREE.Mesh(floorGeo, ceilMat);
          ceiling.rotation.x = Math.PI / 2;
          ceiling.position.set(x, wallHeight, y);
          group.add(ceiling);
        }

        (Object.keys(DIR_VECTOR) as Direction[]).forEach((d) => {
          const v = DIR_VECTOR[d];
          if (cellAt(map, x + v.x, y + v.y) !== "wall") return;
          const slot = { x: x + v.x * 0.5, z: y + v.y * 0.5, rotY: WALL_ROTATION[d] };
          const kit = accentKit && wallVariantRoll(slot.x, slot.z) < settings.accentRatio ? accentKit : primaryKit;
          kit.slots.push(slot);
        });

        if (cellAt(map, x, y) === "door") {
          // the passage runs between the two open neighbors; the door stands
          // across it, facing along it
          const northSouth = cellAt(map, x, y - 1) !== "wall" || cellAt(map, x, y + 1) !== "wall";
          doorCells.push({ x, z: y, rotY: northSouth ? 0 : Math.PI / 2, key: doorCellKey({ x, y }) });
        }
      }
    }

    // floor glow fixtures, lifted above the floor relief once it's built
    const floorStrips: THREE.Mesh[] = [];

    // a height map caught mid-save by an image editor (hot reload) or
    // fetched while the dev server restarts fails to decode - retry briefly
    const loadWithRetry = async (url: string, attempts: number): Promise<Awaited<ReturnType<typeof loadHeightGrid>>> => {
      try {
        return await loadHeightGrid(url);
      } catch (err) {
        if (attempts <= 1 || disposed) throw err;
        await new Promise((resolve) => setTimeout(resolve, 400));
        return loadWithRetry(url, attempts - 1);
      }
    };

    // builds a kit's relief geometry from its depth map and hooks up its AO;
    // resolves to null if the scene was torn down meanwhile
    async function buildRelief(
      kit: WallKit,
      shape: { width?: number; height: number; flushEdges: boolean; holeBackZ?: number },
    ) {
      const grid = await loadWithRetry(kit.depthUrl, 4);
      if (disposed) return null;
      const relief = createReliefWallGeometry(grid, {
        wallWidth: shape.width ?? 1,
        wallHeight: shape.height,
        depth: settings.reliefDepth,
        levels: settings.reliefLevels,
        minIsland: settings.reliefMinIsland,
        aoRadius: settings.aoRadius,
        flushEdges: shape.flushEdges,
        holeBackZ: shape.holeBackZ,
      });
      geometries.push(relief.geometry);
      kit.textures.push(relief.aoMap);
      for (const mat of kitMaterials(kit)) {
        mat.aoMap = relief.aoMap;
        mat.aoMapIntensity = settingsRef.current.aoIntensity;
        mat.needsUpdate = true;
      }
      return relief;
    }

    if (wallGeo) {
      for (const kit of kits) placeWalls(wallGeo, kit.wallMat, kit.slots);
    } else {
      for (const kit of kits) {
        buildRelief(kit, { height: wallHeight, flushEdges: true })
          .then((relief) => {
            if (!relief) return;
            if (kit === primaryKit) {
              reliefStats = { trianglesPerWall: relief.triangles, levelCount: relief.levelCount, baked: relief.baked };
            }
            placeWalls(relief.geometry, [kit.wallMat, kit.sideMat], kit.slots);
          })
          .catch((err) => console.error("Relief wall build failed:", err));
      }
    }

    // every kit, for per-frame material updates and disposal
    const allKits = [...kits, ...floorKits.values(), frameKit, panelKit, ...(ceilingKit ? [ceilingKit] : [])];

    if (ceilingKit) {
      if (isRelief) {
        buildRelief(ceilingKit, { height: 1, flushEdges: false })
          .then((relief) => relief && placeCeilings(relief.geometry, ceilingKit, true))
          .catch((err) => console.error("Relief ceiling build failed:", err));
      } else {
        placeCeilings(floorGeo, ceilingKit, false);
      }
    }

    let floorTop = 0;
    for (const floorKit of floorKits.values()) {
      if (isRelief) {
        buildRelief(floorKit, { height: 1, flushEdges: false })
          .then((relief) => {
            if (!relief) return;
            placeFloors(relief.geometry, [floorKit.wallMat, floorKit.sideMat], floorKit.slots);
            // keep the strips above the highest floor relief
            floorTop = Math.max(floorTop, relief.maxZ);
            for (const strip of floorStrips) strip.position.y = floorTop + 0.003;
          })
          .catch((err) => console.error("Relief floor build failed:", err));
      } else {
        placeFloors(floorGeo, floorKit.wallMat, floorKit.slots);
      }
    }

    // Doors are always relief (a frame needs its cut-out opening), whatever
    // the wall type. The frame is built first: the panel is sized to fit its
    // opening.
    if (doorCells.length) {
      (async () => {
        const frame = await buildRelief(frameKit, {
          height: wallHeight,
          flushEdges: false,
          // the opening's jambs reach back to the center plane, where they
          // meet the other half's
          holeBackZ: -DOOR_FRAME_HALF_DEPTH,
        });
        if (!frame) return;
        const hole = frame.holeBounds ?? { minX: -0.35, maxX: 0.35, minY: -wallHeight / 2, maxY: wallHeight * 0.3 };
        const panelWidth = hole.maxX - hole.minX + 2 * DOOR_PANEL_OVERLAP;
        // from the floor up behind the frame's header
        const panelHeight = wallHeight / 2 + hole.maxY + DOOR_PANEL_OVERLAP;
        const panel = await buildRelief(panelKit, { width: panelWidth, height: panelHeight, flushEdges: false });
        if (!panel) return;
        const panelCenterX = (hole.minX + hole.maxX) / 2;

        for (const cell of doorCells) {
          const door = new THREE.Group();
          door.position.set(cell.x, 0, cell.z);
          door.rotation.y = cell.rotY;

          // two halves back to back, each facing out of one side
          for (const side of [1, -1]) {
            const frameHalf = new THREE.Mesh(frame.geometry, [frameKit.wallMat, frameKit.sideMat]);
            frameHalf.position.set(0, wallHeight / 2, side * DOOR_FRAME_HALF_DEPTH);
            frameHalf.rotation.y = side === 1 ? 0 : Math.PI;
            door.add(frameHalf);
          }

          const slider = new THREE.Group();
          for (const side of [1, -1]) {
            const panelHalf = new THREE.Mesh(panel.geometry, [panelKit.wallMat, panelKit.sideMat]);
            panelHalf.position.set(panelCenterX, panelHeight / 2, side * DOOR_PANEL_HALF_DEPTH);
            panelHalf.rotation.y = side === 1 ? 0 : Math.PI;
            slider.add(panelHalf);
          }
          // open = slid up until its bottom clears the opening
          slider.userData.openY = panelHeight;
          if (openDoorsRef.current.has(cell.key)) slider.position.y = panelHeight;
          door.add(slider);

          group.add(door);
          doorPanelsRef.current.set(cell.key, slider);
        }
      })().catch((err) => console.error("Door build failed:", err));
    }

    // --- map lights: small glowing fixtures + the shared point-light pool ---
    const ceilingFixtureGeo = new THREE.PlaneGeometry(0.26, 0.26);
    const floorFixtureGeo = new THREE.PlaneGeometry(0.3, 0.05);
    geometries.push(ceilingFixtureGeo, floorFixtureGeo);
    const fixtureMats = new Map<number, THREE.MeshBasicMaterial>();
    const fixtureMat = (color: number) => {
      let mat = fixtureMats.get(color);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color });
        fixtureMats.set(color, mat);
      }
      return mat;
    };

    for (const light of mapLights) {
      if (light.kind === "ceiling") {
        // a textured ceiling brings its own glowing light panel
        if (ceilingKit?.litMat) continue;
        const panel = new THREE.Mesh(ceilingFixtureGeo, fixtureMat(light.color));
        panel.rotation.x = Math.PI / 2;
        panel.position.set(light.x, wallHeight - 0.002, light.z);
        group.add(panel);
      } else if (light.kind === "floorGlow" && light.wall) {
        // a thin strip on the floor along the foot of the wall
        const v = DIR_VECTOR[light.wall];
        const strip = new THREE.Mesh(floorFixtureGeo, fixtureMat(light.color));
        strip.rotation.set(-Math.PI / 2, 0, v.x !== 0 ? Math.PI / 2 : 0);
        strip.position.set(light.x + v.x * 0.1, 0.003, light.z + v.y * 0.1);
        group.add(strip);
        floorStrips.push(strip);
      }
      // wall glows have no fixture - the light itself reads as a lit patch
    }

    const lightPool = Array.from({ length: LIGHT_POOL_SIZE }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      scene.add(light);
      return light;
    });

    function updateLightPool(camX: number, camZ: number, intensityScale: number) {
      const ranked = mapLights
        .map((light) => ({ light, dist: Math.hypot(light.x - camX, light.z - camZ) }))
        .sort((a, b) => a.dist - b.dist);
      lightPool.forEach((slot, i) => {
        const entry = ranked[i];
        if (!entry) {
          slot.intensity = 0;
          return;
        }
        slot.color.setHex(entry.light.color);
        slot.position.set(entry.light.x, entry.light.elevation * wallHeight, entry.light.z);
        slot.distance = entry.light.range;
        slot.intensity =
          entry.light.intensity * intensityScale * (1 - smoothstep(LIGHT_FADE_START, LIGHT_FADE_END, entry.dist));
      });
    }

    function resize() {
      const w = container!.clientWidth || 1;
      const h = container!.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = verticalFov(settingsRef.current.fov, camera.aspect);
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const startedAt = performance.now();
    let lastFrameAt = startedAt;
    let lastStatsAt = 0;

    function renderFrame() {
      const s = settingsRef.current;
      const now = performance.now();
      const t = (now - startedAt) / 1000;
      // capped so a stall (tab switch, breakpoint) doesn't teleport the
      // free-moving player through a wall
      const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

      const anim = animRef.current;
      const freeTick = freeTickRef.current;
      let cam: CamTarget;
      // free movement puts the eye right at the pose; grid movement pulls it
      // back from the cell center
      let pullback = s.cameraPullback;
      if (freeTick) {
        const pose = freeTick(dt);
        const f = forwardOf(pose.yaw);
        cam = { x: pose.x, z: pose.z, tx: pose.x + f.x, tz: pose.z + f.z };
        animRef.current = null;
        pullback = 0;
      } else if (anim) {
        const p = Math.min(1, (now - anim.start) / s.moveDurationMs);
        const e = easeOutQuad(p);
        cam = {
          x: lerp(anim.from.x, anim.to.x, e),
          z: lerp(anim.from.z, anim.to.z, e),
          tx: lerp(anim.from.tx, anim.to.tx, e),
          tz: lerp(anim.from.tz, anim.to.tz, e),
        };
        if (p >= 1) animRef.current = null;
      } else {
        cam = liveRef.current;
      }
      liveRef.current = cam;

      const doorAnim = doorAnimRef.current;
      if (doorAnim) {
        const p = Math.min(1, (now - doorAnim.start) / DOOR_OPEN_MS);
        doorAnim.panel.position.y = lerp(doorAnim.from, doorAnim.to, easeOutQuad(p));
        if (p >= 1) doorAnimRef.current = null;
      }

      const bobY = s.bobEnabled ? Math.sin((t * 2 * Math.PI) / 3.2) * 0.035 : 0;
      const bobRoll = s.bobEnabled ? Math.cos((t * 2 * Math.PI) / 1.6) * 0.015 : 0;

      const fwdX = cam.tx - cam.x;
      const fwdZ = cam.tz - cam.z;
      const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
      const camX = cam.x - (fwdX / fwdLen) * pullback;
      const camZ = cam.z - (fwdZ / fwdLen) * pullback;

      const fov = verticalFov(s.fov, camera.aspect);
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      // glance-around (grid movement only): ease back to center once idle,
      // then turn the head by the offset around the eye
      const peek = peekRefRef.current?.current;
      let peekYaw = 0;
      if (peek && !freeTick) {
        if (!peek.held && now - peek.lastInputAt > PEEK_IDLE_MS) {
          peek.offset *= Math.exp(-dt / PEEK_RETURN_TAU);
          if (Math.abs(peek.offset) < 1e-3) peek.offset = 0;
        }
        peekYaw = peek.offset;
      }
      // rotating the facing clockwise (seen from above) by peekYaw
      const fx = fwdX / fwdLen;
      const fz = fwdZ / fwdLen;
      const cos = Math.cos(peekYaw);
      const sin = Math.sin(peekYaw);
      const lookX = fx * cos - fz * sin;
      const lookZ = fz * cos + fx * sin;

      camera.position.set(camX, s.eyeHeight + bobY, camZ);
      camera.lookAt(camX + lookX, s.eyeHeight + bobY, camZ + lookZ);
      camera.rotateZ(bobRoll);

      ambient.intensity = s.ambientIntensity;
      pointLight.intensity = s.pointLightIntensity;
      for (const kit of allKits) {
        for (const mat of kitMaterials(kit)) {
          mat.roughness = s.roughness;
          mat.metalness = s.metalness;
          mat.aoMapIntensity = s.aoIntensity;
        }
        kit.wallMat.normalScale.set(s.normalStrength, s.normalStrength);
        kit.litMat?.normalScale.set(s.normalStrength, s.normalStrength);
      }
      cavity.value = s.aoDirect;
      // a headlamp-like light orbiting the camera; the small radius keeps it
      // well inside the side walls of the current cell - a light that slips
      // behind a wall plane lights the back of its front faces and only the
      // step sides of relief walls
      pointLight.position.set(
        camX + Math.cos(t * 0.5) * 0.15,
        // above the eyes, but never through the ceiling
        Math.min(s.eyeHeight + 0.3, s.wallHeight - 0.08),
        camZ + Math.sin(t * 0.5) * 0.15,
      );
      updateLightPool(camX, camZ, s.mapLightIntensity);

      renderer.render(scene, camera);

      if (now - lastStatsAt > 500) {
        lastStatsAt = now;
        onStatsRef.current?.({
          renderedTriangles: renderer.info.render.triangles,
          relief: reliefStats,
        });
      }

    }

    function animate() {
      if (disposed) return;
      renderFrame();
      raf = requestAnimationFrame(animate);
    }
    animate();

    // dev-only: render a frame on demand and return it as an image, for the
    // voidcrew.capture() console helper - works even when the browser has
    // paused requestAnimationFrame (hidden tab/pane)
    const snapshot = () => {
      renderFrame();
      return renderer.domElement.toDataURL("image/jpeg", 0.9);
    };
    if (import.meta.env.DEV) Object.assign(window, { __voidcrewSnapshot: snapshot });

    return () => {
      disposed = true;
      const w = window as { __voidcrewSnapshot?: () => string };
      if (w.__voidcrewSnapshot === snapshot) delete w.__voidcrewSnapshot;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      container.removeChild(renderer.domElement);
      for (const geo of geometries) geo.dispose();
      for (const kit of allKits) {
        kit.wallMat.dispose();
        kit.sideMat.dispose();
        kit.litMat?.dispose();
        for (const tex of kit.textures) tex.dispose();
      }
      floorMat.dispose();
      ceilMat.dispose();
      for (const mat of fixtureMats.values()) mat.dispose();
      renderer.dispose();
    };
  }, [
    map,
    settings.textureSet,
    settings.accentTextureSet,
    settings.accentRatio,
    settings.floorTextureSet,
    settings.ceilingTextureSet,
    settings.wallProfile,
    settings.wallHeight,
    settings.bevelFraction,
    settings.bevelAngleDeg,
    settings.displacementScale,
    settings.reliefDepth,
    settings.reliefLevels,
    settings.reliefMinIsland,
    settings.aoRadius,
    textureVersion,
  ]);

  return <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black" />;
}
