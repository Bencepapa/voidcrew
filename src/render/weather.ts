import * as THREE from "three";
import type { Weather } from "../game/types";
import { softTexture } from "./spriteCloud";

export interface WeatherColumn { floor: number; ceiling: number; open: boolean; valid: boolean }

// Positions stay in world space. Only particles leaving the camera's volume
// wrap to its opposite boundary, preserving parallax while walking.
export function createWeather(quality = 1) {
  const capacity = Math.min(360, Math.max(0, Math.round(180 * quality)));
  const geometry = new THREE.PlaneGeometry(1, 1);
  const texture = softTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture, color: 0xc7dcf0, transparent: true, opacity: .55,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const particles = Array.from({length: capacity}, () => ({
    x: Math.random() * 12, z: Math.random() * 12, y: Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
  }));
  const dummy = new THREE.Object3D();
  const wrap = (v: number, low: number, period: number) => low + ((v - low) % period + period) % period;
  let initialized = false;
  return {
    mesh,
    update(dt: number, time: number, camera: THREE.Camera, weather: Weather | undefined, column: (x:number,z:number)=>WeatherColumn) {
      if (!weather) { mesh.count = 0; initialized = false; return; }
      const rain = weather.type === "rain";
      const count = Math.min(capacity, Math.round(capacity * Math.max(0, Math.min(2, weather.intensity ?? 1)) / 2));
      const lowY = camera.position.y - 2;
      let drawn = 0;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        if (!initialized) { p.x += camera.position.x - 6; p.z += camera.position.z - 6; p.y += lowY; }
        p.x = wrap(p.x + ((weather.wind?.[0] ?? 0) + (rain ? 0 : Math.sin(time * .3 + p.phase) * .07)) * dt, camera.position.x - 6, 12);
        p.z = wrap(p.z + (weather.wind?.[1] ?? 0) * dt, camera.position.z - 6, 12);
        p.y = wrap(p.y - dt * (rain ? 5 : .32), lowY, 5);
        const c = column(Math.round(p.x), Math.round(p.z));
        if (!c.valid || (!c.open && !weather.indoors)) continue;
        if (p.y < c.floor + .03) { p.y = lowY + 5; continue; }
        if (p.y > c.ceiling) continue;
        dummy.position.set(p.x, p.y, p.z);
        dummy.quaternion.copy(camera.quaternion);
        dummy.rotateZ(rain ? .12 : time * .2 + p.phase);
        dummy.scale.set(rain ? .012 : .045, rain ? .28 : .045, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn++, dummy.matrix);
      }
      initialized = count > 0;
      mesh.count = drawn;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
