import * as THREE from "three";
import { seededRandom } from "./pixelFont";

// What's seen through the windows: a starfield cube map, looked up by view
// direction (see createSpaceMaterial), so the stars sit infinitely far away
// and shift behind a window frame exactly as real ones would - from any
// angle, with no parallax of their own. Pixel-art style: single-texel stars,
// a few bright ones with a cross, faint blocky nebulae.

const FACE = 512;
// the nebulae are computed at this resolution and scaled up (blocky pixels)
const NEBULA = 128;
const STARS_PER_FACE = 1100;

// Direction through a texel of a cube map face, in three.js/GL face order
// (+x, -x, +y, -y, +z, -z); u, v in -1..1 with v down the image.
function faceDirection(face: number, u: number, v: number): [number, number, number] {
  switch (face) {
    case 0:
      return [1, -v, -u];
    case 1:
      return [-1, -v, u];
    case 2:
      return [u, 1, v];
    case 3:
      return [u, -1, -v];
    case 4:
      return [u, -v, 1];
    default:
      return [-u, -v, -1];
  }
}

// 3D value noise: smooth, and seamless across the cube's faces since it's
// sampled by direction
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const fx = s(x - xi);
  const fy = s(y - yi);
  const fz = s(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

function fbm(x: number, y: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x * freq, y * freq, z * freq) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / 0.9375;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function drawFace(face: number, random: () => number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = FACE;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(FACE, FACE);
  const px = img.data;

  // deep space with faint nebulae, quantized to a few steps (pixel art)
  const scale = FACE / NEBULA;
  for (let ny = 0; ny < NEBULA; ny++) {
    for (let nx = 0; nx < NEBULA; nx++) {
      const [dx, dy, dz] = faceDirection(face, ((nx + 0.5) / NEBULA) * 2 - 1, ((ny + 0.5) / NEBULA) * 2 - 1);
      const len = Math.hypot(dx, dy, dz);
      const [x, y, z] = [dx / len, dy / len, dz / len];
      const cloud = Math.round(smoothstep(0.52, 0.85, fbm(x * 2.2 + 7, y * 2.2, z * 2.2)) * 4) / 4;
      const hue = fbm(x * 1.3, y * 1.3 + 11, z * 1.3);
      // purple to teal
      const r = 5 + cloud * (hue < 0.5 ? 38 : 12);
      const g = 6 + cloud * (hue < 0.5 ? 14 : 34);
      const b = 12 + cloud * (hue < 0.5 ? 52 : 48);
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const o = ((ny * scale + sy) * FACE + nx * scale + sx) * 4;
          px[o] = r;
          px[o + 1] = g;
          px[o + 2] = b;
          px[o + 3] = 255;
        }
      }
    }
  }

  const plot = (x: number, y: number, [r, g, b]: number[], k: number) => {
    if (x < 0 || y < 0 || x >= FACE || y >= FACE) return;
    const o = (y * FACE + x) * 4;
    px[o] = Math.max(px[o], r * k);
    px[o + 1] = Math.max(px[o + 1], g * k);
    px[o + 2] = Math.max(px[o + 2], b * k);
  };
  const TINTS = [
    [255, 255, 255],
    [200, 215, 255],
    [255, 236, 200],
    [255, 205, 190],
  ];
  for (let i = 0; i < STARS_PER_FACE; i++) {
    const x = Math.floor(random() * FACE);
    const y = Math.floor(random() * FACE);
    // mostly faint, a few bright
    const b = Math.pow(random(), 3.5);
    const tint = TINTS[Math.floor(random() * TINTS.length)];
    plot(x, y, tint, 0.25 + b * 0.75);
    if (b > 0.55) {
      const arm = b > 0.85 ? 2 : 1;
      for (let a = 1; a <= arm; a++) {
        const k = (0.25 + b * 0.5) / (a + 0.5);
        plot(x + a, y, tint, k);
        plot(x - a, y, tint, k);
        plot(x, y + a, tint, k);
        plot(x, y - a, tint, k);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let starfield: THREE.CubeTexture | null = null;

// the starfield cube map, built once and shared by every scene
export function getStarfield(): THREE.CubeTexture {
  if (!starfield) {
    const random = seededRandom("void crew starfield");
    starfield = new THREE.CubeTexture(Array.from({ length: 6 }, (_, face) => drawFace(face, random)));
    starfield.colorSpace = THREE.SRGBColorSpace;
    starfield.magFilter = THREE.NearestFilter;
    starfield.generateMipmaps = false;
    starfield.minFilter = THREE.LinearFilter;
    // looked up along the view direction: refraction with a ratio of 1
    // passes the view ray straight through
    starfield.mapping = THREE.CubeRefractionMapping;
    starfield.needsUpdate = true;
  }
  return starfield;
}

// Wired safety glass: a diamond lattice of wire and a few faint scratches,
// white where the glass is clear (it multiplies what's seen through it).
// One tile is WIRE_TILE texels.
export const WIRE_TILE = 32;

export function createWiredGlass(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = WIRE_TILE;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(WIRE_TILE, WIRE_TILE);
  const random = seededRandom("wired glass");
  for (let y = 0; y < WIRE_TILE; y++) {
    for (let x = 0; x < WIRE_TILE; x++) {
      // two diagonal wire families, crossing in diamonds
      const onWire = (x + y) % 16 === 0 || (x - y + WIRE_TILE) % 16 === 0;
      let v = onWire ? 120 : 236 + Math.floor(random() * 12);
      if (!onWire && random() < 0.012) v = 205;
      const o = (y * WIRE_TILE + x) * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = Math.min(255, v + 6);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
