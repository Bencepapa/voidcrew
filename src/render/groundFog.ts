import * as THREE from "three";
import { useLightGrid, type LightGridUniforms } from "./lightGrid";
import { softTexture, type SpriteEmitter } from "./spriteCloud";

// The fog lies at the height of the floor its emitter stands on (e.floor) over its whole area, whatever
// the floor does under it (steps, pits): it is a layer, not a skin.
export function createGroundFog(emitters: SpriteEmitter[], quality: number, light: LightGridUniforms,
  openAt:(x:number,z:number)=>boolean) {
  const mesh = new THREE.Group();
  const texture = softTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const batches = emitters.map(e => {
    const count = Math.min(48, Math.max(0, Math.round(24 * e.density * quality)));
    const material = new THREE.MeshStandardMaterial({
      map:texture, color:e.color, transparent:true, opacity:.35, roughness:1,
      depthWrite:false, side:THREE.DoubleSide,
    });
    useLightGrid(material, light);
    const cloud = new THREE.InstancedMesh(geometry, material, count);
    cloud.frustumCulled = false;
    mesh.add(cloud);
    const seeds = Array.from({length:count}, () => ({phase:Math.random()*Math.PI*2, radius:Math.sqrt(Math.random())}));
    return {e,cloud,material,seeds};
  });
  const dummy = new THREE.Object3D();
  return {
    mesh,
    update(_dt:number,time:number,camera:THREE.Camera) {
      for (const {e,cloud,seeds} of batches) {
        cloud.visible = Math.hypot(camera.position.x-e.x,camera.position.z-e.z) < e.spread + 10;
        if (!cloud.visible) continue;
        let drawn = 0;
        for (const seed of seeds) {
          const angle = seed.phase + time * .025;
          const radius = seed.radius * e.spread;
          const x = e.x + Math.cos(angle) * radius, z = e.z + Math.sin(angle) * radius;
          const cellX = Math.round(x), cellZ = Math.round(z);
          if (!openAt(cellX,cellZ)) continue;
          const wallFade = Math.min(...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz]) =>
            openAt(cellX+dx,cellZ+dz) ? 1 : Math.max(0,.5 - (x-cellX)*dx - (z-cellZ)*dz)));
          const fade = Math.max(0, 1 - seed.radius * seed.radius) * wallFade;
          const h = e.height ?? .6;
          dummy.position.set(x, e.floor + h*(.3+.12*Math.sin(time*.2+seed.phase)), z);
          dummy.quaternion.copy(camera.quaternion);
          const width = Math.min(2.4,e.spread) * e.size * Math.sqrt(fade);
          dummy.scale.set(width, h * (1+.2*Math.sin(time*.13+seed.phase)), 1);
          dummy.updateMatrix();
          cloud.setMatrixAt(drawn++,dummy.matrix);
        }
        cloud.count = drawn;
        cloud.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { for(const b of batches)b.material.dispose();geometry.dispose();texture.dispose(); },
  };
}
