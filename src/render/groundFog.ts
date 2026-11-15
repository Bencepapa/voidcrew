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
    const wanted = Math.min(48, Math.max(1, Math.round(24 * e.density * quality)));
    const material = new THREE.MeshStandardMaterial({
      map:texture, color:e.color, transparent:true, opacity:.35, roughness:1,
      depthWrite:false, side:THREE.DoubleSide,
    });
    useLightGrid(material, light);
    const cloud = new THREE.InstancedMesh(geometry, material, wanted);
    cloud.frustumCulled = false;
    mesh.add(cloud);
    // Where each puff lies is worked out once, among the open cells under the spread disc: random points in the
    // disc mostly fell into walls, so a narrow corridor got a few faint puffs - or none - and each emitter differed.
    const seeds: {phase:number; x:number; z:number; fade:number}[] = [];
    for (let i = 0; i < wanted; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const r = Math.sqrt(Math.random()) * e.spread, a = Math.random() * Math.PI * 2;
        const x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
        const cx = Math.round(x), cz = Math.round(z);
        if (!openAt(cx, cz)) continue;
        const wall = Math.min(...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz]) =>
          openAt(cx+dx,cz+dz) ? 1 : Math.max(0, .5 - (x-cx)*dx - (z-cz)*dz)));
        const edge = Math.max(.3, 1 - (r / Math.max(e.spread, .01)) ** 2);
        seeds.push({phase:Math.random()*Math.PI*2, x, z, fade:Math.max(.35, wall) * edge});
        break;
      }
    }
    return {e,cloud,material,seeds};
  });
  const dummy = new THREE.Object3D();
  return {
    mesh,
    update(_dt:number,time:number,camera:THREE.Camera) {
      for (const {e,cloud,seeds} of batches) {
        cloud.visible = Math.hypot(camera.position.x-e.x,camera.position.z-e.z) < e.spread + 10;
        if (!cloud.visible) continue;
        const h = e.height ?? .6;
        let drawn = 0;
        for (const seed of seeds) {
          dummy.position.set(seed.x + Math.sin(time*.1+seed.phase)*.1, e.floor + h*(.3+.12*Math.sin(time*.2+seed.phase)), seed.z + Math.cos(time*.1+seed.phase)*.1);
          dummy.quaternion.copy(camera.quaternion);
          const width = Math.min(2.4,e.spread) * e.size * Math.sqrt(seed.fade);
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
