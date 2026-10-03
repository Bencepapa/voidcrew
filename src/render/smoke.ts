import * as THREE from "three";
import type { LightGridUniforms } from "./lightGrid";

// Smoke: each emitter lets out soft puffs that rise, widen and fade - a
// leaking pipe, a smouldering console - or blows them out some way first (a
// vent, a burst pipe), where they slow down and then rise. The puffs are camera-facing quads
// drawn in one instanced mesh; every point of one takes its light from the
// baked light grid where it is (see lightGrid.ts), so smoke by a red lamp is
// red - and it shows by the light it catches: thick and bright in a lamp's
// light, thin in the dark, shading from one to the other across a puff.

export interface SmokeEmitter {
  // where it comes out (world units)
  x: number;
  y: number;
  z: number;
  // the ceiling above it (world y): the smoke gathers under it - and the
  // floor under it, which smoke blown downward spreads over
  ceiling: number;
  floor: number;
  // the speed it's blown out with (world units / s; none: it just rises)
  blow?: [number, number, number];
  // how much (1: a steady wisp), how big its puffs get (1: about half a
  // cell across), and its own color
  density: number;
  size: number;
  color: THREE.Color;
  // the cell it's in ("x,y"), to leave it undrawn when out of sight
  cell: string;
}

// What the puffs bump into (world units): the deck's walls and the floor
// and ceiling of each cell, its props as boxes - and, each frame, its robots.
export interface SmokeWorld {
  // whether (x, z) is in a wall (or off the deck)
  wall(x: number, z: number): boolean;
  // the floor and ceiling (world y) of the cell at (x, z)
  floor(x: number, z: number): number;
  ceiling(x: number, z: number): number;
  boxes: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }[];
}
// a robot as the smoke feels it: where it stands, its feet and its top
export interface SmokeBody {
  x: number;
  z: number;
  bottom: number;
  top: number;
}
// which of them the smoke feels (each can be off)
export interface SmokePhysics {
  walls: boolean;
  props: boolean;
  actors: SmokeBody[] | null;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  // what's left of the speed it was blown out with
  jx: number;
  jy: number;
  jz: number;
  age: number;
  life: number;
  turn: number;
  spin: number;
  // which of the puff shapes it is (0..1: picked from those of the style)
  shape: number;
  // how bright it is beside the others (1: as its emitter's color)
  shade: number;
  emitter: number;
}

// puffs per emitter of density 1, how long one lasts (s), how fast it rises
// (world units / s), how wide it starts and ends (world units, at size 1)
// and how opaque it gets (in full light)
const PUFFS = 16;
const LIFE: [number, number] = [3.2, 5];
const RISE: [number, number] = [0.14, 0.24];
const WIDTH: [number, number] = [0.1, 0.6];
const OPACITY = 0.42;
// how fast blown smoke loses its speed (per second: it gets speed / DRAG
// far), and how much one puff's speed and heading differ from another's
const DRAG = 1.6;
const BLOW_SPREAD = 0.14;
// A puff bumps into things by a small box round its middle (its picture
// is bigger: it still wraps round what it bumps into): how big, how much of
// its speed it bounces back with, how far from a robot's middle it's kept
// and how hard a robot pushes it away
const PUFF_REACH = 0.05;
const BOUNCE = 0.3;
const ACTOR_REACH = 0.22;
const ACTOR_PUSH = 0.35;
// how much of that opacity is left in the dark, and the baked light (its
// brightness as the smoke shows it) from which it's all there
const DARK_OPACITY = 0.3;
const FULL_LIGHT = 0.5;
// how much of the scene's ambient light it shows (all of it would make it
// glow among dark walls)
const AMBIENT_SHARE = 0.35;
// Each puff lit as a lumpy ball rather than a flat card: its side toward the
// main light brighter, its far side darker (0: flat, 1: fully), how much its
// own lumps bend that, and how far round its far side light still wraps
const ROUNDNESS = 1;
const BUMP = 6;
const WRAP = 0.5;
// the shares of a puff's life it takes to appear, and to fade away at the end
const FADE_IN = 0.15;
const FADE_OUT = 0.4;
// (blown smoke is there at once: it's thickest at its nozzle)
const BLOWN_FADE_IN = 0.03;
// how much one puff's brightness differs from another's (darkest, brightest)
const SHADE: [number, number] = [0.7, 1.3];
const MAX_PUFFS = 600;

// The puffs' shapes: PUFF_SHAPES x PUFF_SHAPES shapeless little clouds in
// one texture (its alpha), each from layered smooth noise fading out toward
// its tile's edge - so no two puffs side by side look stamped from one mold.
const PUFF_SHAPES = 2;
const PUFF_TILE = 128;
function puffTexture(): THREE.CanvasTexture {
  const size = PUFF_TILE * PUFF_SHAPES;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  // a lattice of random values, smoothly blended between (value noise)
  const hash = (x: number, y: number, seed: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number, seed: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const top = hash(x0, y0, seed) * (1 - fx) + hash(x0 + 1, y0, seed) * fx;
    const bottom = hash(x0, y0 + 1, seed) * (1 - fx) + hash(x0 + 1, y0 + 1, seed) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  // four octaves: big lumps, then finer wisps
  const cloud = (x: number, y: number, seed: number) => {
    let sum = 0;
    let weight = 0;
    for (let octave = 0, scale = 3, gain = 1; octave < 4; octave++, scale *= 2, gain *= 0.5) {
      sum += noise(x * scale, y * scale, seed + octave * 17) * gain;
      weight += gain;
    }
    return sum / weight;
  };
  for (let tile = 0; tile < PUFF_SHAPES * PUFF_SHAPES; tile++) {
    const ox = (tile % PUFF_SHAPES) * PUFF_TILE;
    const oy = Math.floor(tile / PUFF_SHAPES) * PUFF_TILE;
    for (let y = 0; y < PUFF_TILE; y++) {
      for (let x = 0; x < PUFF_TILE; x++) {
        const u = x / (PUFF_TILE - 1);
        const v = y / (PUFF_TILE - 1);
        // how far out from the tile's middle (1: its edge), its outline
        // pushed in and out by the noise itself
        const lumps = cloud(u, v, tile * 101 + 7);
        const reach = Math.hypot(u - 0.5, v - 0.5) * 2 + (0.5 - lumps) * 0.9;
        const body = Math.max(0, Math.min(1, (1 - reach) / 0.55));
        const alpha = smooth(body) * (0.35 + 0.65 * cloud(u + 3.1, v + 1.7, tile * 53 + 29));
        const i = ((oy + y) * size + ox + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

// What the puffs look like: "noise" the clouds above, made here; "painted"
// the painted ones (public/textures/smoke1, made by
// scripts/make-smoke-puffs.ts: 6 x 6, each column one puff thinning away
// row by row) - their first rows, as still puffs; "animated" those played
// through as a puff lives, thinning away; "squares" plain see-through
// squares standing upright, "turnedSquares" the same turning as they rise;
// "paintedFew" the painted puffs, fewer and thicker and upright, so each
// one's shape shows (many thin ones blur into one mass but for their edges);
// "paintedFewAnimated" those playing all the sheet's frames in reading
// order over their lives, once, gone after the last.
export type SmokeStyle = "noise" | "painted" | "animated" | "squares" | "turnedSquares" | "paintedFew" | "paintedFewAnimated";
// (the share of its life it takes such a puff to fade after its last frame)
const LAST_FRAME_FADE = 0.06;
// (one in how many puffs is drawn then, and how much more opaque)
const FEW_EVERY = 3;
const FEW_OPACITY = 2.2;
const PAINTED_GRID = 6;
// the painted rows still puffs are picked from, and the rows a puff plays
// through as it lives
const PAINTED_ROWS = 3;
const ANIMATED_ROWS = 5;
// how big a painted puff is drawn beside a noise one (it fills less of its tile)
const PAINTED_SCALE = 1.35;
// how big a square is drawn beside a noise puff
const SQUARE_SCALE = 0.5;
// (the squares' texture: one solid pixel)
let solidTexture: THREE.Texture | null = null;
function solid(): THREE.Texture {
  if (!solidTexture) {
    solidTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    solidTexture.needsUpdate = true;
  }
  return solidTexture;
}
let paintedTexture: THREE.Texture | null = null;
function paintedPuffs(): THREE.Texture {
  paintedTexture ??= new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/smoke1/puffs.png`);
  return paintedTexture;
}

export interface Smoke {
  mesh: THREE.Mesh;
  // moves the puffs on by dt seconds and draws those whose emitter is in a
  // cell of `visible`, nearest last; `ambient` is the scene's ambient light;
  // `style`: what they look like; `physics`: what they bump into
  update(dt: number, camera: THREE.Camera, visible: Set<string>, ambient: number, style?: SmokeStyle, physics?: SmokePhysics): void;
  dispose(): void;
}

// (a puff's box's corners, seen from above)
const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

export function createSmoke(emitters: SmokeEmitter[], grid: LightGridUniforms, world?: SmokeWorld): Smoke {
  const puffs: Puff[] = [];
  const count = Math.min(MAX_PUFFS, emitters.reduce((n, e) => n + Math.max(1, Math.round(PUFFS * e.density)), 0));
  const between = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0]);
  const spawn = (emitter: number, age: number): Puff => {
    const e = emitters[emitter];
    const [bx, by, bz] = e.blow ?? [0, 0, 0];
    const speed = Math.hypot(bx, by, bz);
    const push = 0.8 + Math.random() * 0.4;
    const stray = () => (Math.random() - 0.5) * 2 * speed * BLOW_SPREAD;
    return {
      jx: bx * push + stray(),
      jy: by * push + stray(),
      jz: bz * push + stray(),
      x: e.x + (Math.random() - 0.5) * 0.05,
      y: e.y,
      z: e.z + (Math.random() - 0.5) * 0.05,
      vx: (Math.random() - 0.5) * 0.05,
      vy: between(RISE),
      vz: (Math.random() - 0.5) * 0.05,
      age,
      life: between(LIFE),
      turn: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.5,
      shape: Math.random(),
      shade: between(SHADE),
      emitter,
    };
  };
  // (each emitter's puffs spread over their lives, as if it had been
  // smoking all along)
  emitters.forEach((e, i) => {
    const n = Math.max(1, Math.round(PUFFS * e.density));
    for (let k = 0; k < n && puffs.length < count; k++) {
      const p = spawn(i, 0);
      p.age = (k / n) * p.life;
      // (how far its blown speed has carried it by then, and what's left)
      const left = Math.exp(-DRAG * p.age);
      const carried = (1 - left) / DRAG;
      p.x += p.vx * p.age + p.jx * carried;
      p.z += p.vz * p.age + p.jz * carried;
      p.y = Math.max(e.floor + 0.03, Math.min(e.ceiling - 0.06, p.y + p.vy * p.age + p.jy * carried));
      p.jx *= left;
      p.jy *= left;
      p.jz *= left;
      puffs.push(p);
    }
  });

  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.setAttribute("uv", quad.getAttribute("uv"));
  const centers = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const params = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  const colors = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  for (const attr of [centers, params, colors]) attr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aCenter", centers);
  geometry.setAttribute("aParams", params);
  geometry.setAttribute("aColor", colors);
  geometry.instanceCount = 0;

  const texture = puffTexture();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uPuff: { value: texture },
      uAmbient: { value: 0.3 },
      uRound: { value: ROUNDNESS },
      uBump: { value: BUMP },
      uWrap: { value: WRAP },
      // dev: 1 draws the texture as it is, white, unlit
      uRaw: { value: 0 },
      // the puff texture's tiles across, and one of its pixels (in its uv)
      uGrid: { value: PUFF_SHAPES },
      uTexel: { value: 1 / (PUFF_TILE * PUFF_SHAPES) },
      uLgFace0: grid.faces[0],
      uLgFace1: grid.faces[1],
      uLgFace2: grid.faces[2],
      uLgFace3: grid.faces[3],
      uLgFace4: grid.faces[4],
      uLgFace5: grid.faces[5],
      uLgMin: grid.min,
      uLgSize: grid.size,
      uLgScale: grid.scale,
      uLgMode: grid.mode,
      uLgSplit: grid.split,
      uLgMin2: grid.min2,
      uLgSize2: grid.size2,
    },
    vertexShader: `
attribute vec3 aCenter;
// size, opacity, turn, shape: its tile in the puff texture - column + 16 x
// row from the top, and a fraction: how far on to the row below (played)
attribute vec4 aParams;
attribute vec3 aColor;
uniform float uGrid;
varying vec2 vUv;
varying vec2 vUv2;
varying float vFrame;
varying float vOpacity;
varying vec3 vWorld;
varying vec3 vColor;
// the puff's own right, up and toward-the-view in the world, and where on it
// this point is (-1..1 across)
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vBack;
varying vec2 vLocal;
#include <fog_pars_vertex>
void main() {
  vLocal = uv * 2.0 - 1.0;
  float tile = floor(aParams.w);
  float col = mod(tile, 16.0);
  float row = floor(tile / 16.0);
  vFrame = aParams.w - tile;
  vUv = (uv + vec2(col, uGrid - 1.0 - row)) / uGrid;
  vUv2 = (uv + vec2(col, uGrid - 1.0 - min(row + 1.0, uGrid - 1.0))) / uGrid;
  vOpacity = aParams.y;
  vColor = aColor;
  float c = cos(aParams.z);
  float s = sin(aParams.z);
  vec2 corner = position.xy * aParams.x;
  corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  // where this corner is in the world (the view's right and up from the
  // puff's middle): the light is looked up at each point of the puff
  vec3 viewRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 viewUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vWorld = aCenter + viewRight * corner.x + viewUp * corner.y;
  vRight = viewRight * c + viewUp * s;
  vUp = viewUp * c - viewRight * s;
  vBack = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec4 mvPosition = viewMatrix * vec4(aCenter, 1.0);
  mvPosition.xy += corner;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `
uniform sampler2D uPuff;
uniform float uAmbient;
uniform float uRound;
uniform float uBump;
uniform float uWrap;
uniform float uTexel;
uniform float uRaw;
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
varying vec2 vUv;
varying vec2 vUv2;
varying float vFrame;
varying float vOpacity;
varying vec3 vWorld;
varying vec3 vColor;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vBack;
varying vec2 vLocal;
#include <common>
#include <fog_pars_fragment>
// the light arriving at a grid point from direction d (an ambient cube)
vec3 lgCube(vec3 d, vec3 uvw) {
  vec3 d2 = d * d;
  return d2.x * (d.x > 0.0 ? texture(uLgFace0, uvw).rgb : texture(uLgFace1, uvw).rgb) +
    d2.y * (d.y > 0.0 ? texture(uLgFace2, uvw).rgb : texture(uLgFace3, uvw).rgb) +
    d2.z * (d.z > 0.0 ? texture(uLgFace4, uvw).rgb : texture(uLgFace5, uvw).rgb);
}
// how thick the puff is here (and a little off it): between its frame and
// the next as it plays
float thickness(vec2 off) {
  return mix(texture2D(uPuff, vUv + off).a, texture2D(uPuff, vUv2 + off).a, vFrame);
}
void main() {
  float alpha = thickness(vec2(0.0)) * vOpacity;
  if (uRaw > 0.5) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    return;
  }
  if (alpha < 0.003) discard;
  // which way this point of the puff faces: out from its middle like a
  // ball's, bent by its lumps (its thickness rising and falling)
  vec2 slope = vec2(
    thickness(vec2(uTexel, 0.0)) - thickness(vec2(-uTexel, 0.0)),
    thickness(vec2(0.0, uTexel)) - thickness(vec2(0.0, -uTexel))
  ) * ${PUFF_TILE / 2}.0 / 2.0;
  vec2 out2 = vLocal * 0.8 - slope * uBump / 64.0;
  vec3 n = normalize(vRight * out2.x + vUp * out2.y + vBack * sqrt(max(0.15, 1.0 - dot(out2, out2))));
  // the light at this point of the puff: smoke takes it from all round
  // (flat), and more from the side it faces (shaded)
  vec3 light = vec3(0.0);
  vec3 shaded = vec3(0.0);
  if (uLgScale > 0.0) {
    // the grid's textures run x, z, y
    vec3 uvw = vec3((vWorld.x - uLgMin.x) / uLgSize.x, (vWorld.z - uLgMin.z) / uLgSize.z, (vWorld.y - uLgMin.y) / uLgSize.y);
    if (uLgMode < 0.5) {
      light += (texture(uLgFace0, uvw).rgb + texture(uLgFace1, uvw).rgb + texture(uLgFace2, uvw).rgb +
        texture(uLgFace3, uvw).rgb + texture(uLgFace4, uvw).rgb + texture(uLgFace5, uvw).rgb) / 6.0 * uLgScale;
      shaded = mix(light, lgCube(n, uvw) * uLgScale, uRound);
    } else {
      vec3 ambient = texture(uLgFace0, uvw).rgb;
      if (uLgSplit > 0.5) {
        vec3 uvw2 = vec3((vWorld.x - uLgMin2.x) / uLgSize2.x, (vWorld.z - uLgMin2.z) / uLgSize2.z, (vWorld.y - uLgMin2.y) / uLgSize2.y);
        ambient = texture(uLgFace3, uvw2).rgb;
      }
      vec3 main = texture(uLgFace1, uvw).rgb;
      light += (ambient + main * 0.45) * uLgScale;
      // the main light from its way (the grid keeps it, toward the light)
      vec3 toward = texture(uLgFace2, uvw).xyz;
      float facing = 0.45;
      if (length(toward) > 1e-3) {
        float wrapped = max(0.0, (dot(n, normalize(toward)) + uWrap) / (1.0 + uWrap));
        facing = mix(0.45, 0.95 * wrapped, uRound);
      }
      shaded = (ambient + main * facing) * uLgScale;
    }
  }
  // smoke shows by the light it scatters: thin in the dark, thick in light
  float lit = dot(light, vec3(0.2126, 0.7152, 0.0722)) * RECIPROCAL_PI;
  alpha *= mix(${DARK_OPACITY.toFixed(3)}, 1.0, smoothstep(0.0, ${FULL_LIGHT.toFixed(3)}, lit));
  // (as a matte surface would show it: the grid holds the light arriving)
  gl_FragColor = vec4(vColor * (shaded + vec3(uAmbient * ${AMBIENT_SHARE.toFixed(3)})) * RECIPROCAL_PI, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const order: { puff: Puff; depth: number }[] = [];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const view = new THREE.Vector3();

  return {
    mesh,
    update(dt, camera, visible, ambient, style = "noise", physics) {
      const walls = !!(world && physics?.walls);
      const boxes = world && physics?.props ? world.boxes : null;
      const bodies = physics?.actors ?? null;
      // whether a puff's box at (x, y, z) is in something: a wall or a
      // cell whose floor or ceiling it's past, a prop
      const inside = (x: number, y: number, z: number) => {
        if (walls) {
          for (const [dx, dz] of CORNERS) {
            const cx = x + dx * PUFF_REACH;
            const cz = z + dz * PUFF_REACH;
            if (world!.wall(cx, cz) || y < world!.floor(cx, cz) || y > world!.ceiling(cx, cz)) return true;
          }
        }
        if (boxes) {
          for (const b of boxes) {
            if (
              x + PUFF_REACH > b.minX && x - PUFF_REACH < b.maxX &&
              z + PUFF_REACH > b.minZ && z - PUFF_REACH < b.maxZ &&
              y + PUFF_REACH > b.minY && y - PUFF_REACH < b.maxY
            ) return true;
          }
        }
        return false;
      };
      material.uniforms.uAmbient.value = ambient;
      const squares = style === "squares" || style === "turnedSquares";
      const painted = style === "painted" || style === "animated" || style === "paintedFew" || style === "paintedFewAnimated";
      const played = style === "paintedFewAnimated";
      const few = style === "paintedFew" || played;
      material.uniforms.uPuff.value = squares ? solid() : painted ? paintedPuffs() : texture;
      material.uniforms.uGrid.value = squares ? 1 : painted ? PAINTED_GRID : PUFF_SHAPES;
      material.uniforms.uTexel.value = 1 / (PUFF_TILE * (squares ? 1 : painted ? PAINTED_GRID : PUFF_SHAPES));
      // dev: __voidcrewSmokeRound = 0 in the console lights them flat, to compare
      const round = import.meta.env.DEV ? (window as { __voidcrewSmokeRound?: number }).__voidcrewSmokeRound : undefined;
      material.uniforms.uRound.value = round ?? ROUNDNESS;
      // dev: __voidcrewSmokeShade = { bump, wrap } in the console, to try the lumps' shading
      const shade = import.meta.env.DEV ? (window as { __voidcrewSmokeShade?: { bump?: number; wrap?: number } }).__voidcrewSmokeShade : undefined;
      material.uniforms.uBump.value = shade?.bump ?? BUMP;
      material.uniforms.uWrap.value = shade?.wrap ?? WRAP;
      order.length = 0;
      camera.getWorldPosition(view);
      for (let i = 0; i < puffs.length; i++) {
        let p = puffs[i];
        p.age += dt;
        if (p.age >= p.life) p = puffs[i] = spawn(p.emitter, 0);
        const e = emitters[p.emitter];
        // the room it's in: its own cell's floor and ceiling (with the walls
        // felt), else its emitter's
        let ceiling = e.ceiling;
        let floor = e.floor;
        if (walls && !world!.wall(p.x, p.z)) {
          ceiling = world!.ceiling(p.x, p.z);
          floor = world!.floor(p.x, p.z);
        }
        // under the ceiling it stops rising and spreads
        const room = ceiling - 0.06 - p.y;
        if (room < 0.12) {
          p.vy *= Math.max(0, 1 - 5 * dt);
          p.vx *= 1 + 0.6 * dt;
          p.vz *= 1 + 0.6 * dt;
        }
        // it moves a way at a time, stopped (and bounced back a little) by
        // what it would run into - unless it's in something already (let
        // out of a wall or a prop it was put in)
        const free = !inside(p.x, p.y, p.z);
        const nx = p.x + (p.vx + p.jx) * dt;
        if (free && inside(nx, p.y, p.z)) {
          p.vx *= -BOUNCE;
          p.jx *= -BOUNCE;
        } else {
          p.x = nx;
        }
        const nz = p.z + (p.vz + p.jz) * dt;
        if (free && inside(p.x, p.y, nz)) {
          p.vz *= -BOUNCE;
          p.jz *= -BOUNCE;
        } else {
          p.z = nz;
        }
        // (stopped going up or down, it waits there for its drift to take
        // it clear - under a table, say)
        const ny = Math.max(floor + 0.03, Math.min(ceiling - 0.06, p.y + (p.vy + p.jy) * dt));
        if (free && inside(p.x, ny, p.z)) p.jy *= -BOUNCE;
        else p.y = ny;
        // robots push it aside: kept off their middle, given a shove away
        if (bodies) {
          for (const b of bodies) {
            if (p.y < b.bottom || p.y > b.top + 0.05) continue;
            const dx = p.x - b.x;
            const dz = p.z - b.z;
            const d = Math.hypot(dx, dz);
            if (d >= ACTOR_REACH) continue;
            const ux = d > 1e-4 ? dx / d : Math.cos(p.turn);
            const uz = d > 1e-4 ? dz / d : Math.sin(p.turn);
            const tx = b.x + ux * ACTOR_REACH;
            const tz = b.z + uz * ACTOR_REACH;
            if (!inside(tx, p.y, tz)) {
              p.x = tx;
              p.z = tz;
            }
            p.jx += ux * ACTOR_PUSH * dt * 10;
            p.jz += uz * ACTOR_PUSH * dt * 10;
          }
        }
        // what it was blown out with (or shoved by) dies away
        const left = Math.exp(-DRAG * dt);
        p.jx *= left;
        p.jy *= left;
        p.jz *= left;
        p.turn += p.spin * dt;
        if (!visible.has(e.cell) || (few && i % FEW_EVERY)) continue;
        order.push({ puff: p, depth: (p.x - view.x) ** 2 + (p.y - view.y) ** 2 + (p.z - view.z) ** 2 });
      }
      // the farthest first, so the nearer ones blend over them
      order.sort((a, b) => b.depth - a.depth);
      order.forEach(({ puff: p }, n) => {
        const e = emitters[p.emitter];
        const t = p.age / p.life;
        // it comes up quickly, and thins away over the end of its life
        // (one playing its frames: it ends on the last, gone just after)
        const fade = smooth(Math.min(1, t / (e.blow ? BLOWN_FADE_IN : FADE_IN))) * smooth(Math.min(1, (1 - t) / (played ? LAST_FRAME_FADE : FADE_OUT)));
        // its tile: one of the noise clouds, a painted puff, or a painted
        // one played through its rows as it lives
        let tile: number;
        let width = (WIDTH[0] + (WIDTH[1] - WIDTH[0]) * Math.sqrt(t)) * e.size;
        let turn = p.turn;
        if (squares) {
          tile = 0;
          width *= SQUARE_SCALE;
          if (style === "squares") turn = 0;
        } else if (style === "noise") {
          const k = Math.floor(p.shape * PUFF_SHAPES * PUFF_SHAPES);
          tile = (k % PUFF_SHAPES) + 16 * Math.floor(k / PUFF_SHAPES);
        } else {
          const k = Math.floor(p.shape * PAINTED_GRID * PAINTED_ROWS);
          const col = k % PAINTED_GRID;
          if (played) {
            // every frame of the sheet in reading order, each its share of
            // the puff's life (no blending: the art's own steps)
            const frame = Math.min(PAINTED_GRID * PAINTED_GRID - 1, Math.floor(t * PAINTED_GRID * PAINTED_GRID));
            tile = (frame % PAINTED_GRID) + 16 * Math.floor(frame / PAINTED_GRID);
            turn = 0;
            // (it thins away in the art: drawn a steadier size)
            width = (0.3 + 0.45 * Math.sqrt(t)) * e.size;
          } else if (style === "painted" || few) {
            tile = col + 16 * Math.floor(k / PAINTED_GRID);
            if (few) turn = 0;
          } else {
            // (it thins away in the art: drawn a steadier size)
            const frame = Math.min(t, 0.9999) * (ANIMATED_ROWS - 1);
            const row = Math.floor(frame);
            tile = col + 16 * row + Math.min(0.999, frame - row);
            width = (0.3 + 0.45 * Math.sqrt(t)) * e.size;
          }
          width *= PAINTED_SCALE;
        }
        centers.setXYZ(n, p.x, p.y, p.z);
        params.setXYZW(n, width, Math.min(1, OPACITY * (few ? FEW_OPACITY : 1)) * fade, turn, tile);
        colors.setXYZ(n, e.color.r * p.shade, e.color.g * p.shade, e.color.b * p.shade);
      });
      geometry.instanceCount = order.length;
      // dev: __voidcrewSmokeTest = { tile, size } in the console draws just
      // one puff of that tile (column + 16 x row), still, unlit, above the
      // first emitter
      const test = import.meta.env.DEV ? (window as { __voidcrewSmokeTest?: { tile?: number; size?: number; all?: boolean } }).__voidcrewSmokeTest : undefined;
      material.uniforms.uRaw.value = test && emitters.length ? 1 : 0;
      if (test && emitters.length && !test.all) {
        const e = emitters[0];
        centers.setXYZ(0, e.x, Math.min(e.ceiling - 0.3, e.y + 0.4), e.z);
        params.setXYZW(0, test.size ?? 0.8, 1, 0, test.tile ?? 0);
        geometry.instanceCount = 1;
      }
      centers.needsUpdate = params.needsUpdate = colors.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      quad.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
