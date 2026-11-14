import * as THREE from "three";
import type { PetalEmitter } from "./motes";
export type SpriteEmitter = PetalEmitter & { sprite?: string; ground?: boolean; ceiling?: number; height?: number };
export function softTexture() {
  const data = new Uint8Array(32 * 32 * 4);
  for (let y=0;y<32;y++) for(let x=0;x<32;x++) {
    const i=(y*32+x)*4; data[i]=data[i+1]=data[i+2]=255;
    data[i+3]=255*Math.pow(Math.max(0,1-Math.hypot(x-15.5,y-15.5)/16),2);
  }
  const texture=new THREE.DataTexture(data,32,32); texture.needsUpdate=true; return texture;
}
// One instanced draw per sprite family, with no per-frame object allocation.
export function spriteCloud(emitters: SpriteEmitter[], quality: number, kind: "petals"|"fireflies"|"mist", texture?: THREE.Texture) {
  const mesh=new THREE.Group();
  const batches=emitters.map(e=>{
    const n=Math.min(120,Math.max(0,Math.round((kind==="mist"?(e.ground?3:12):kind==="fireflies"?10:32)*e.density*quality)));
    const geo=new THREE.PlaneGeometry(1,1);
    const map=texture ?? (kind==="petals" ? new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}particles/${e.sprite ?? "petal1.png"}`) : softTexture());
    const mat=new THREE.MeshBasicMaterial({map,color:e.color,transparent:true,opacity:kind==="mist"?0.15:0.9,depthWrite:false,side:THREE.DoubleSide,fog:true,blending:kind==="fireflies"?THREE.AdditiveBlending:THREE.NormalBlending});
    const inst=new THREE.InstancedMesh(geo,mat,n);inst.frustumCulled=false;mesh.add(inst);
    const phases=Array.from({length:n},()=>Math.random()*Math.PI*2);
    return {e,n,geo,mat,map,inst,phases};
  });
  const dummy=new THREE.Object3D(); const tint=new THREE.Color(); let elapsed=0;
  return {mesh, update(dt:number,time:number,camera?:THREE.Camera){
    elapsed+=dt;
    for(const {e,n,inst,phases} of batches) for(let i=0;i<n;i++) {
      const p=phases[i]; const t=elapsed; const height=Math.max(0.1,e.y-e.floor);
      const x=e.x+Math.sin(p*13+t*(kind==="fireflies"?0.6:0.08))*e.spread*0.5;
      const z=e.z+Math.cos(p*7+t*(kind==="fireflies"?0.47:0.06))*e.spread*0.5;
      let y=e.y;
      if(kind==="petals") y=e.floor+((p/7*height-t*0.16)%height+height)%height;
      if(kind==="fireflies") y=e.floor+height*(0.5+0.42*Math.sin(t*0.7+p*3));
      if(kind==="mist") y=e.ground?e.floor+0.05+i*0.035:e.y+Math.sin(p*9+t*0.05)*0.08;
      const wrap=(v:number)=>((v+e.spread/2)%e.spread+e.spread)%e.spread-e.spread/2;
      dummy.position.set(e.x+wrap(x-e.x+t*e.wind[0]),y,e.z+wrap(z-e.z+t*e.wind[1]));
      if(camera) dummy.quaternion.copy(camera.quaternion);
      if(kind==="petals") dummy.rotateZ(t*0.6+p);
      const size=e.size*(kind==="mist"?1.6:kind==="fireflies"?0.065:0.11);
      dummy.scale.set(size*(kind==="petals"?0.4+0.6*Math.abs(Math.sin(t+p)):1),size*(kind==="mist"?0.35:1),1);
      dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);
      if(kind==="fireflies") {tint.setScalar(Math.pow(Math.max(0,Math.sin(time*(0.8+p*0.12)+p)),3));inst.setColorAt(i,tint);}
    }
    for(const b of batches){b.inst.instanceMatrix.needsUpdate=true;if(b.inst.instanceColor)b.inst.instanceColor.needsUpdate=true;}
  },dispose(){for(const b of batches){b.geo.dispose();b.mat.dispose();if(!texture)b.map.dispose();}}};
}
