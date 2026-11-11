import * as THREE from "three";

// Falling petals (a smoke emitter with `petals`): small coloured squares that
// drift down from the emitter's height to the floor, swaying, carried by the
// emitter's wind, and start again at the top. Drawn as points (square, like
// the game's pixels), a few dozen per emitter, moved on the CPU.

export interface PetalEmitter {
  // the middle of the drifting cloud (world units), and the floor it falls to
  x: number;
  y: number;
  z: number;
  floor: number;
  // how wide the cloud is (world units), how many petals, how big they are
  spread: number;
  density: number;
  size: number;
  color: THREE.Color;
  // the wind that carries them (world units per second)
  wind: [number, number];
}

const PER_EMITTER = 40;

export interface Petals {
  mesh: THREE.Points;
  update(dt: number, time: number): void;
  dispose(): void;
}

export function createPetals(emitters: PetalEmitter[], quality = 1): Petals {
  const items: { e: PetalEmitter; i0: number; n: number }[] = [];
  let total = 0;
  for (const e of emitters) {
    const n = Math.max(1, Math.round(PER_EMITTER * e.density * quality));
    items.push({ e, i0: total, n });
    total += n;
  }
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const phase = new Float32Array(total);
  const fall = new Float32Array(total);
  let seed = 4242;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tmp = new THREE.Color();
  for (const { e, i0, n } of items) {
    for (let k = 0; k < n; k++) {
      const i = i0 + k;
      positions[i * 3] = e.x + (random() - 0.5) * e.spread;
      positions[i * 3 + 1] = e.floor + random() * Math.max(0.1, e.y - e.floor);
      positions[i * 3 + 2] = e.z + (random() - 0.5) * e.spread;
      // each petal a little lighter or darker than the emitter's colour
      tmp.copy(e.color).multiplyScalar(0.75 + random() * 0.5);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
      phase[i] = random() * Math.PI * 2;
      fall[i] = 0.1 + random() * 0.12;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const size = emitters.length ? emitters.reduce((s, e) => s + e.size, 0) / emitters.length : 1;
  const material = new THREE.PointsMaterial({ size: 0.035 * size, sizeAttenuation: true, vertexColors: true, fog: true });
  const mesh = new THREE.Points(geometry, material);
  // (spread over the whole deck: always drawn, the points are few)
  mesh.frustumCulled = false;

  return {
    mesh,
    update(dt, time) {
      for (const { e, i0, n } of items) {
        for (let k = 0; k < n; k++) {
          const i = i0 + k;
          const p = phase[i];
          positions[i * 3] += (e.wind[0] + Math.sin(time * 1.3 + p) * 0.12) * dt;
          positions[i * 3 + 2] += (e.wind[1] + Math.cos(time * 1.1 + p * 1.7) * 0.12) * dt;
          positions[i * 3 + 1] -= fall[i] * dt;
          if (positions[i * 3 + 1] < e.floor + 0.005) {
            // landed: back to the top of the cloud
            positions[i * 3] = e.x + (random() - 0.5) * e.spread;
            positions[i * 3 + 1] = e.y;
            positions[i * 3 + 2] = e.z + (random() - 0.5) * e.spread;
          }
        }
      }
      (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
