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
  // which of the puff shapes it is
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
// how much of that opacity is left in the dark, and the baked light (its
// brightness as the smoke shows it) from which it's all there
const DARK_OPACITY = 0.3;
const FULL_LIGHT = 0.5;
// how much of the scene's ambient light it shows (all of it would make it
// glow among dark walls)
const AMBIENT_SHARE = 0.35;
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

export interface Smoke {
  mesh: THREE.Mesh;
  // moves the puffs on by dt seconds and draws those whose emitter is in a
  // cell of `visible`, nearest last; `ambient` is the scene's ambient light
  update(dt: number, camera: THREE.Camera, visible: Set<string>, ambient: number): void;
  dispose(): void;
}

export function createSmoke(emitters: SmokeEmitter[], grid: LightGridUniforms): Smoke {
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
      shape: Math.floor(Math.random() * PUFF_SHAPES * PUFF_SHAPES),
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
// size, opacity, turn, shape (its tile in the puff texture)
attribute vec4 aParams;
attribute vec3 aColor;
varying vec2 vUv;
varying float vOpacity;
varying vec3 vWorld;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  vUv = (uv + vec2(mod(aParams.w, ${PUFF_SHAPES}.0), floor(aParams.w / ${PUFF_SHAPES}.0))) / ${PUFF_SHAPES}.0;
  vOpacity = aParams.y;
  vColor = aColor;
  float c = cos(aParams.z);
  float s = sin(aParams.z);
  vec2 corner = position.xy * aParams.x;
  corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  // where this corner is in the world (the view's right and up from the
  // puff's middle): the light is looked up at each point of the puff
  vWorld = aCenter + vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) * corner.x +
    vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) * corner.y;
  vec4 mvPosition = viewMatrix * vec4(aCenter, 1.0);
  mvPosition.xy += corner;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `
uniform sampler2D uPuff;
uniform float uAmbient;
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
varying float vOpacity;
varying vec3 vWorld;
varying vec3 vColor;
#include <common>
#include <fog_pars_fragment>
void main() {
  float alpha = texture2D(uPuff, vUv).a * vOpacity;
  if (alpha < 0.003) discard;
  // the light at this point of the puff: smoke takes it from all round
  vec3 light = vec3(0.0);
  if (uLgScale > 0.0) {
    // the grid's textures run x, z, y
    vec3 uvw = vec3((vWorld.x - uLgMin.x) / uLgSize.x, (vWorld.z - uLgMin.z) / uLgSize.z, (vWorld.y - uLgMin.y) / uLgSize.y);
    if (uLgMode < 0.5) {
      light += (texture(uLgFace0, uvw).rgb + texture(uLgFace1, uvw).rgb + texture(uLgFace2, uvw).rgb +
        texture(uLgFace3, uvw).rgb + texture(uLgFace4, uvw).rgb + texture(uLgFace5, uvw).rgb) / 6.0 * uLgScale;
    } else {
      vec3 ambient = texture(uLgFace0, uvw).rgb;
      if (uLgSplit > 0.5) {
        vec3 uvw2 = vec3((vWorld.x - uLgMin2.x) / uLgSize2.x, (vWorld.z - uLgMin2.z) / uLgSize2.z, (vWorld.y - uLgMin2.y) / uLgSize2.y);
        ambient = texture(uLgFace3, uvw2).rgb;
      }
      light += (ambient + texture(uLgFace1, uvw).rgb * 0.45) * uLgScale;
    }
  }
  // smoke shows by the light it scatters: thin in the dark, thick in light
  float lit = dot(light, vec3(0.2126, 0.7152, 0.0722)) * RECIPROCAL_PI;
  alpha *= mix(${DARK_OPACITY.toFixed(3)}, 1.0, smoothstep(0.0, ${FULL_LIGHT.toFixed(3)}, lit));
  // (as a matte surface would show it: the grid holds the light arriving)
  gl_FragColor = vec4(vColor * (light + vec3(uAmbient * ${AMBIENT_SHARE.toFixed(3)})) * RECIPROCAL_PI, alpha);
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
    update(dt, camera, visible, ambient) {
      material.uniforms.uAmbient.value = ambient;
      order.length = 0;
      camera.getWorldPosition(view);
      for (let i = 0; i < puffs.length; i++) {
        let p = puffs[i];
        p.age += dt;
        if (p.age >= p.life) p = puffs[i] = spawn(p.emitter, 0);
        const e = emitters[p.emitter];
        // under the ceiling it stops rising and spreads
        const room = e.ceiling - 0.06 - p.y;
        if (room < 0.12) {
          p.vy *= Math.max(0, 1 - 5 * dt);
          p.vx *= 1 + 0.6 * dt;
          p.vz *= 1 + 0.6 * dt;
        }
        p.x += (p.vx + p.jx) * dt;
        p.y = Math.max(e.floor + 0.03, Math.min(e.ceiling - 0.06, p.y + (p.vy + p.jy) * dt));
        p.z += (p.vz + p.jz) * dt;
        if (e.blow) {
          const left = Math.exp(-DRAG * dt);
          p.jx *= left;
          p.jy *= left;
          p.jz *= left;
        }
        p.turn += p.spin * dt;
        if (!visible.has(e.cell)) continue;
        order.push({ puff: p, depth: (p.x - view.x) ** 2 + (p.y - view.y) ** 2 + (p.z - view.z) ** 2 });
      }
      // the farthest first, so the nearer ones blend over them
      order.sort((a, b) => b.depth - a.depth);
      order.forEach(({ puff: p }, n) => {
        const e = emitters[p.emitter];
        const t = p.age / p.life;
        // it comes up quickly, and thins away over the end of its life
        const fade = smooth(Math.min(1, t / (e.blow ? BLOWN_FADE_IN : FADE_IN))) * smooth(Math.min(1, (1 - t) / FADE_OUT));
        centers.setXYZ(n, p.x, p.y, p.z);
        params.setXYZW(n, (WIDTH[0] + (WIDTH[1] - WIDTH[0]) * Math.sqrt(t)) * e.size, OPACITY * fade, p.turn, p.shape);
        colors.setXYZ(n, e.color.r * p.shade, e.color.g * p.shade, e.color.b * p.shade);
      });
      geometry.instanceCount = order.length;
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
