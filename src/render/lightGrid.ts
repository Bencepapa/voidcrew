import * as THREE from "three";
import { ACCENT_GLSL, ACCENT_UNIFORMS } from "./accent";
import { cellAt, ceilingHeight, floorHeight } from "../game/map";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH } from "../game/heights";
import { PROP_TYPES, propHeight, propPlacement } from "../game/props";
import type { LightSpec } from "../game/lights";
import type { GameMap } from "../game/types";

// Baked lighting: a deck's static lights summed up once, on a grid of sample
// points through its rooms (an irradiance volume, like Quake's light grid),
// which every lit material looks up by its world position (see
// useLightGrid). Any number of lights costs the same to draw; the few real
// three.js lights are left for what moves - muzzle flashes, sparks.
//
// Each sample holds the light arriving from six directions (+x, -x, +y, -y,
// +z, -z - an "ambient cube"), so a surface facing a lamp is lit and one
// facing away isn't. A lamp reaches a sample only past no wall, floor or
// ceiling (a march along the line between them on the grid), and falls off
// with distance as a three.js point light does (decay 2, cut off at its
// range). Samples inside walls take their nearest room sample's light, so
// the trilinear lookup at a wall's surface doesn't blend in darkness - nor
// light from the room on the wall's other side.

// samples per cell across (default), and per wall height up (per sample
// across: the same spacing up as across, at least 4 per wall height)
export const GRID_PER_CELL = 3;

// How a sample keeps its light:
// - cube: from six directions (an ambient cube) - smooth, but light from
//   one lamp spreads over the directions around it
// - directional: the direction most of it comes from, how much comes from
//   there, and the rest as ambient (as Quake 3's light grid) - the shader
//   treats the main part as a real light, highlights on metal included
export type LightGridMode = "cube" | "directional";
// the light not from the main direction, as ambient: about the share a
// surface gets of light from all round
const AMBIENT_SHARE = 0.3;
// the march's step (cells), and how far from a light its own cell is ignored
// (a light behind a window's glass sits in the wall)
const MARCH_STEP = 0.12;

export interface LightGridData {
  // samples along x (columns), z (rows) and y (up)
  nx: number;
  nz: number;
  ny: number;
  // world position of the grid's corner (sample edges, not centers), and its
  // extent (world units)
  min: THREE.Vector3;
  size: THREE.Vector3;
  // cube: the six directions' light, RGB per sample: [+x, -x, +y, -y, +z,
  // -z]; directional: [ambient RGB, main light RGB, its direction XYZ]
  faces: Float32Array[];
  mode: LightGridMode;
}

const AXES: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function bakeLightGrid(
  map: GameMap,
  lights: LightSpec[],
  wallHeight: number,
  options: { perCell?: number; mode?: LightGridMode } = {},
): LightGridData {
  const perCell = Math.max(1, Math.round(options.perCell ?? GRID_PER_CELL));
  const mode = options.mode ?? "cube";
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (cellAt(map, x, y) === "wall") continue;
      lo = Math.min(lo, floorHeight(map, x, y));
      hi = Math.max(hi, ceilingHeight(map, x, y));
    }
  }
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  const nx = map.width * perCell;
  const nz = map.height * perCell;
  const ny = Math.max(2, Math.round((hi - lo) * Math.max(4, perCell)) + 1);
  const step = 1 / perCell;
  const stepY = (hi - lo) / (ny - 1 || 1);
  // sample centers: x, z in cells; y in wall heights
  const sx = (i: number) => -0.5 + (i + 0.5) * step;
  const sz = (k: number) => -0.5 + (k + 0.5) * step;
  const sy = (j: number) => lo + j * stepY;
  const index = (i: number, k: number, j: number) => i + k * nx + j * nx * nz;
  const count = nx * nz * ny;

  const occluders = occludersOf(map);
  // where a sample stands in a room (its cell open, between its floor and
  // ceiling) - one inside a prop still counts: the prop's own surfaces read
  // it (see clearLine)
  const open = (x: number, y: number, z: number) => {
    const cx = Math.round(x);
    const cz = Math.round(z);
    if (cellAt(map, cx, cz) === "wall") return false;
    return y >= floorHeight(map, cx, cz) - 1e-3 && y <= ceilingHeight(map, cx, cz) + 1e-3;
  };
  const valid = new Uint8Array(count);
  for (let j = 0; j < ny; j++) {
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) if (open(sx(i), sy(j), sz(k))) valid[index(i, k, j)] = 1;
    }
  }

  const faces = (mode === "cube" ? AXES : AXES.slice(0, 3)).map(() => new Float32Array(count * 3));
  const color = new THREE.Color();
  // directional: the light's main direction per sample first (pass 0: the
  // brightness-weighted sum of where each light comes from), then how much
  // comes from along it and the rest (pass 1)
  const mainDir = mode === "directional" ? new Float32Array(count * 3) : null;
  const passes = mode === "directional" ? [0, 1] : [1];
  for (const pass of passes) {
    for (const light of lights) {
      // an unsteady one is a real light instead (see lightEffects.ts)
      if (light.effect) continue;
      const lx = light.x;
      const lz = light.z;
      const ly = light.y;
      const lightCell = { x: Math.round(lx), z: Math.round(lz) };
      color.setHex(light.color);
      const range = light.range;
      // the samples within its range
      const i0 = Math.max(0, Math.floor((lx - range + 0.5) / step));
      const i1 = Math.min(nx - 1, Math.ceil((lx + range + 0.5) / step));
      const k0 = Math.max(0, Math.floor((lz - range + 0.5) / step));
      const k1 = Math.min(nz - 1, Math.ceil((lz + range + 0.5) / step));
      const rangeY = range / wallHeight;
      const j0 = Math.max(0, Math.floor((ly - rangeY - lo) / stepY));
      const j1 = Math.min(ny - 1, Math.ceil((ly + rangeY - lo) / stepY));
      for (let j = j0; j <= j1; j++) {
        for (let k = k0; k <= k1; k++) {
          for (let i = i0; i <= i1; i++) {
            const n = index(i, k, j);
            if (!valid[n]) continue;
            const px = sx(i);
            const pz = sz(k);
            const py = sy(j);
            // world offsets (y in world units)
            const dx = lx - px;
            const dy = (ly - py) * wallHeight;
            const dz = lz - pz;
            const d = Math.hypot(dx, dy, dz);
            if (d >= range || d < 1e-4) continue;
            if (!clearLine(map, occluders, px, py, pz, lx, ly, lz, lightCell)) continue;
            // three.js's point light falloff (decay 2, cut off at `distance`)
            const cut = Math.max(0, 1 - (d / range) ** 4);
            const atten = (1 / Math.max(d * d, 0.01)) * cut * cut * light.intensity;
            if (mainDir) {
              const lum = atten * (0.3 * color.r + 0.59 * color.g + 0.11 * color.b);
              if (pass === 0) {
                mainDir[n * 3] += (lum * dx) / d;
                mainDir[n * 3 + 1] += (lum * dy) / d;
                mainDir[n * 3 + 2] += (lum * dz) / d;
                continue;
              }
              const mx = mainDir[n * 3];
              const my = mainDir[n * 3 + 1];
              const mz = mainDir[n * 3 + 2];
              const ml = Math.hypot(mx, my, mz) || 1;
              // how far it comes from along the main direction
              const w = Math.max(0, (mx * dx + my * dy + mz * dz) / (ml * d));
              const [amb, main] = faces;
              amb[n * 3] += color.r * atten * (1 - w) * AMBIENT_SHARE;
              amb[n * 3 + 1] += color.g * atten * (1 - w) * AMBIENT_SHARE;
              amb[n * 3 + 2] += color.b * atten * (1 - w) * AMBIENT_SHARE;
              main[n * 3] += color.r * atten * w;
              main[n * 3 + 1] += color.g * atten * w;
              main[n * 3 + 2] += color.b * atten * w;
              continue;
            }
            for (let a = 0; a < 6; a++) {
              const [ax, ay, az] = AXES[a];
              const cos = (ax * dx + ay * dy + az * dz) / d;
              if (cos <= 0) continue;
              const f = faces[a];
              f[n * 3] += color.r * atten * cos;
              f[n * 3 + 1] += color.g * atten * cos;
              f[n * 3 + 2] += color.b * atten * cos;
            }
          }
        }
      }
    }
  }

  // directional: the main directions, normalized
  if (mainDir) {
    const dir = faces[2];
    for (let n = 0; n < count; n++) {
      const l = Math.hypot(mainDir[n * 3], mainDir[n * 3 + 1], mainDir[n * 3 + 2]);
      if (l < 1e-6) continue;
      dir[n * 3] = mainDir[n * 3] / l;
      dir[n * 3 + 1] = mainDir[n * 3 + 1] / l;
      dir[n * 3 + 2] = mainDir[n * 3 + 2] / l;
    }
  }

  // Samples outside the rooms take their nearest room sample's light (a
  // breadth-first flood from the room samples, one step at a time)
  let frontier: number[] = [];
  const done = new Uint8Array(count);
  for (let n = 0; n < count; n++) {
    if (valid[n]) {
      done[n] = 1;
      frontier.push(n);
    }
  }
  while (frontier.length) {
    const next: number[] = [];
    for (const n of frontier) {
      const i = n % nx;
      const k = Math.floor(n / nx) % nz;
      const j = Math.floor(n / (nx * nz));
      for (const [di, dk, dj] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        const ii = i + di;
        const kk = k + dk;
        const jj = j + dj;
        if (ii < 0 || kk < 0 || jj < 0 || ii >= nx || kk >= nz || jj >= ny) continue;
        const m = index(ii, kk, jj);
        if (done[m]) continue;
        done[m] = 1;
        for (const f of faces) {
          f[m * 3] = f[n * 3];
          f[m * 3 + 1] = f[n * 3 + 1];
          f[m * 3 + 2] = f[n * 3 + 2];
        }
        next.push(m);
      }
    }
    frontier = next;
  }

  return {
    nx,
    nz,
    ny,
    min: new THREE.Vector3(-0.5, lo * wallHeight - (stepY * wallHeight) / 2, -0.5),
    size: new THREE.Vector3(map.width, (hi - lo + stepY) * wallHeight, map.height),
    faces,
    mode,
  };
}

// What else casts shadows in the bake: the props (but plants - they're
// mostly leaves and gaps) and the bridges' decks, as boxes (x, z in cells;
// y in wall heights) listed under each cell they reach into. Doors don't:
// the grid is baked once, as if they were all open.
interface Occluder {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}
// (per cell, row by row; none: an empty list)
interface Occluders {
  width: number;
  cells: (Occluder[] | undefined)[];
}

function occludersOf(map: GameMap): Occluders {
  const out: Occluders = { width: map.width, cells: [] };
  const add = (box: Occluder) => {
    for (let z = Math.max(0, Math.round(box.minZ)); z <= Math.min(map.height - 1, Math.round(box.maxZ)); z++) {
      for (let x = Math.max(0, Math.round(box.minX)); x <= Math.min(map.width - 1, Math.round(box.maxX)); x++) {
        (out.cells[z * map.width + x] ??= []).push(box);
      }
    }
  };
  for (const spec of map.props ?? []) {
    if (PROP_TYPES[spec.prop]?.kind === "cross") continue;
    const { x, z, reachX, reachZ } = propPlacement(spec);
    const bottom = floorHeight(map, spec.cell.x, spec.cell.y) + (spec.elevation ?? 0);
    add({ minX: x - reachX, maxX: x + reachX, minY: bottom, maxY: bottom + propHeight(map, spec), minZ: z - reachZ, maxZ: z + reachZ });
  }
  for (const bridge of map.bridges ?? []) {
    const half = BRIDGE_WIDTH / 2;
    const [hx, hz] = bridge.axis === "NS" ? [half, 0.5] : [0.5, half];
    const { x, y } = bridge.cell;
    add({ minX: x - hx, maxX: x + hx, minY: bridge.height - BRIDGE_THICKNESS, maxY: bridge.height, minZ: y - hz, maxZ: y + hz });
  }
  return out;
}

const inside = (b: Occluder, x: number, y: number, z: number) =>
  x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z > b.minZ && z < b.maxZ;

// the box around a point in its cell, if any (but `skip`)
function blockedAt(occluders: Occluders, cx: number, cz: number, x: number, y: number, z: number, skip?: Occluder[]): boolean {
  if (cx < 0 || cx >= occluders.width || cz < 0) return false;
  const boxes = occluders.cells[cz * occluders.width + cx];
  if (!boxes) return false;
  return boxes.some((b) => inside(b, x, y, z) && !skip?.includes(b));
}

// whether the line from a sample to a light crosses no wall, floor or
// ceiling, prop or bridge (the light's own cell doesn't count - it may sit
// in a wall, or on a prop)
function clearLine(
  map: GameMap,
  occluders: Occluders,
  px: number,
  py: number,
  pz: number,
  lx: number,
  ly: number,
  lz: number,
  lightCell: { x: number; z: number },
): boolean {
  const steps = Math.ceil(Math.hypot(lx - px, lz - pz, ly - py) / MARCH_STEP);
  // a sample inside a prop isn't in the prop's own shadow (its surfaces read
  // it, and they're lit as if it weren't there)
  const cx0 = Math.round(px);
  const cz0 = Math.round(pz);
  const own = cx0 >= 0 && cx0 < occluders.width && cz0 >= 0 ? (occluders.cells[cz0 * occluders.width + cx0] ?? []).filter((b) => inside(b, px, py, pz)) : [];
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = px + (lx - px) * t;
    const y = py + (ly - py) * t;
    const z = pz + (lz - pz) * t;
    const cx = Math.round(x);
    const cz = Math.round(z);
    if (cx === lightCell.x && cz === lightCell.z) continue;
    if (cellAt(map, cx, cz) === "wall") return false;
    if (y < floorHeight(map, cx, cz) - 1e-3 || y > ceilingHeight(map, cx, cz) + 1e-3) return false;
    if (blockedAt(occluders, cx, cz, x, y, z, own)) return false;
  }
  return true;
}

// The shared uniforms every lit material reads the grid through (one set per
// scene: a new bake swaps their values).
export interface LightGridUniforms {
  faces: { value: THREE.Data3DTexture }[];
  min: { value: THREE.Vector3 };
  size: { value: THREE.Vector3 };
  // 0: off (the old way: every map light real); else its brightness
  scale: { value: number };
  // 0: cube, 1: directional (see LightGridMode)
  mode: { value: number };
  // directional: 1 when the ambient part comes from a grid of its own - a
  // coarser one, whose blur spreads a lit room's light into the cells
  // around it while the main part keeps the fine grid's sharp shadows (its
  // texture in faces[3]); and where that grid lies
  split: { value: number };
  min2: { value: THREE.Vector3 };
  size2: { value: THREE.Vector3 };
}

export function createLightGridUniforms(): LightGridUniforms {
  const empty = () => {
    const tex = new THREE.Data3DTexture(new Uint16Array(4), 1, 1, 1);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.HalfFloatType;
    tex.needsUpdate = true;
    return tex;
  };
  return {
    faces: AXES.map(() => ({ value: empty() })),
    min: { value: new THREE.Vector3() },
    size: { value: new THREE.Vector3(1, 1, 1) },
    scale: { value: 0 },
    mode: { value: 0 },
    split: { value: 0 },
    min2: { value: new THREE.Vector3() },
    size2: { value: new THREE.Vector3(1, 1, 1) },
  };
}

// puts a bake into the uniforms (the old textures freed); `ambient`: a
// coarser directional bake to take the ambient part from (see
// LightGridUniforms.split)
export function setLightGrid(uniforms: LightGridUniforms, data: LightGridData, ambient?: LightGridData) {
  const put = (f: Float32Array, a: number, grid: LightGridData) => {
    const rgba = new Uint16Array((f.length / 3) * 4);
    for (let n = 0; n < f.length / 3; n++) {
      rgba[n * 4] = THREE.DataUtils.toHalfFloat(f[n * 3]);
      rgba[n * 4 + 1] = THREE.DataUtils.toHalfFloat(f[n * 3 + 1]);
      rgba[n * 4 + 2] = THREE.DataUtils.toHalfFloat(f[n * 3 + 2]);
      rgba[n * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    const tex = new THREE.Data3DTexture(rgba, grid.nx, grid.nz, grid.ny);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.HalfFloatType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    uniforms.faces[a].value.dispose();
    uniforms.faces[a].value = tex;
  };
  data.faces.forEach((f, a) => put(f, a, data));
  uniforms.min.value.copy(data.min);
  uniforms.size.value.copy(data.size);
  uniforms.mode.value = data.mode === "directional" ? 1 : 0;
  const split = data.mode === "directional" && ambient?.mode === "directional";
  uniforms.split.value = split ? 1 : 0;
  if (split) {
    put(ambient.faces[0], 3, ambient);
    uniforms.min2.value.copy(ambient.min);
    uniforms.size2.value.copy(ambient.size);
  }
}

export function disposeLightGrid(uniforms: LightGridUniforms) {
  for (const f of uniforms.faces) f.value.dispose();
}

// how strongly the grid's light shows in the reflections (see useLightGrid)
const SHEEN = 0.9;

// Makes a lit (standard) material read the grid: its light at the surface
// (a little in front of it), from the directions its normal faces, added to
// the ambient light - so the AO map shades it too. Keeps whatever the
// material's own onBeforeCompile does.
export function useLightGrid(material: THREE.Material, uniforms: LightGridUniforms) {
  if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial || material.userData.lightGrid) return;
  material.userData.lightGrid = true;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  // (the ship's livery only on the deck's own surfaces - its walls, floors,
  // ceilings, doors: those ask for it; props, decals and actors keep their
  // colours)
  const accent = material.userData.accent === true;
  material.customProgramCacheKey = () => `${previousKey}|light-grid${accent ? "" : "|no-accent"}`;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    uniforms.faces.forEach((f, a) => (shader.uniforms[`uLgFace${a}`] = f));
    shader.uniforms.uLgMin = uniforms.min;
    shader.uniforms.uLgSize = uniforms.size;
    shader.uniforms.uLgScale = uniforms.scale;
    shader.uniforms.uLgMode = uniforms.mode;
    shader.uniforms.uLgSplit = uniforms.split;
    shader.uniforms.uLgMin2 = uniforms.min2;
    shader.uniforms.uLgSize2 = uniforms.size2;
    // the ship's accent color (see accent.ts)
    Object.assign(shader.uniforms, ACCENT_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLgWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvLgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLgWorld;
uniform highp sampler3D uLgFace0;
uniform highp sampler3D uLgFace1;
uniform highp sampler3D uLgFace2;
uniform highp sampler3D uLgFace3;
uniform highp sampler3D uLgFace4;
uniform highp sampler3D uLgFace5;
uniform vec3 uLgMin;
uniform vec3 uLgSize;
uniform float uLgScale;
uniform float uLgMode;
uniform float uLgSplit;
uniform vec3 uLgMin2;
uniform vec3 uLgSize2;
${ACCENT_GLSL}
#define LG_SHEEN ${SHEEN.toFixed(2)}
// the light arriving at a grid point from direction d (an ambient cube)
vec3 lgCube(vec3 d, vec3 uvw) {
  vec3 d2 = d * d;
  return d2.x * (d.x > 0.0 ? texture(uLgFace0, uvw).rgb : texture(uLgFace1, uvw).rgb) +
    d2.y * (d.y > 0.0 ? texture(uLgFace2, uvw).rgb : texture(uLgFace3, uvw).rgb) +
    d2.z * (d.z > 0.0 ? texture(uLgFace4, uvw).rgb : texture(uLgFace5, uvw).rgb);
}`,
      )
      .replace("#include <map_fragment>", `#include <map_fragment>${accent ? "\ndiffuseColor.rgb = accentShift(diffuseColor.rgb);" : ""}`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>${accent ? "\ntotalEmissiveRadiance = accentShift(totalEmissiveRadiance);" : ""}`,
      )
      .replace(
        "#include <lights_fragment_begin>",
        `#include <lights_fragment_begin>
if (uLgScale > 0.0) {
  vec3 lgN = inverseTransformDirection(normal, viewMatrix);
  vec3 lgP = vLgWorld + lgN * 0.06;
  // the grid's textures run x, z, y
  vec3 lgUvw = vec3((lgP.x - uLgMin.x) / uLgSize.x, (lgP.z - uLgMin.z) / uLgSize.z, (lgP.y - uLgMin.y) / uLgSize.y);
  if (uLgMode < 0.5) {
    irradiance += lgCube(lgN, lgUvw) * uLgScale;
    // the metal's sheen: the light the view reflects off the surface -
    // from the same cube, the other way round (a soft stand-in for the
    // lights' highlights, which the cube has none of)
    vec3 lgR = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
    radiance += lgCube(lgR, lgUvw) * uLgScale * LG_SHEEN;
  } else {
    // the ambient part, and the main part as a real light from its
    // direction - shaded (highlights too) as the real lights are
    if (uLgSplit > 0.5) {
      vec3 lgUvw2 = vec3((lgP.x - uLgMin2.x) / uLgSize2.x, (lgP.z - uLgMin2.z) / uLgSize2.z, (lgP.y - uLgMin2.y) / uLgSize2.y);
      irradiance += texture(uLgFace3, lgUvw2).rgb * uLgScale;
    } else {
      irradiance += texture(uLgFace0, lgUvw).rgb * uLgScale;
    }
    vec3 lgDir = texture(uLgFace2, lgUvw).xyz;
    float lgLen = length(lgDir);
    if (lgLen > 1e-3) {
      IncidentLight lgMain;
      lgMain.color = texture(uLgFace1, lgUvw).rgb * uLgScale;
      lgMain.direction = normalize((viewMatrix * vec4(lgDir / lgLen, 0.0)).xyz);
      lgMain.visible = true;
      RE_Direct(lgMain, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
  }
}`,
      );
  };
  material.needsUpdate = true;
}
