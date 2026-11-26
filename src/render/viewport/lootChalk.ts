import * as THREE from "three";
import { PROP_TYPES } from "../../game/props";
import type { GameMap } from "../../game/types";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import { drawChalkCross } from "./markers";
import { addDirectLightOcclusion } from "./materials";
import type { WallKit } from "./walls";

export function createLootChalk(deps: {
  map: GameMap;
  markedProps: Set<number>;
  propObjects: Map<number, THREE.Object3D>;
  propKits: Map<string, WallKit>;
  ownMaterials: THREE.MeshStandardMaterial[];
  lightGrid: LightGridUniforms;
  cavity: { value: number };
}) {
  const { map, markedProps, propObjects, propKits, ownMaterials, lightGrid, cavity } = deps;

  // an emptied container: its lid lifted a little and askew, a chalk
  // cross on it (or, lidless, on its front)
  // (a copy of each face material with the cross chalked into its
  // diffuse: it follows the relief, and takes the light as the paint does)
  const chalked = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  function chalkedMaterial(mat: THREE.Material): THREE.MeshStandardMaterial | null {
    const known = chalked.get(mat);
    if (known) return known;
    const kit = [...propKits.values()].find((k) => k.wallMat === mat);
    const image = kit?.wallMat.map?.image as HTMLImageElement | undefined;
    if (!kit || !image?.width) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    drawChalkCross(ctx, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = kit.wallMat.map!.magFilter;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      normalMap: kit.wallMat.normalMap,
      aoMap: kit.wallMat.aoMap,
      aoMapIntensity: kit.wallMat.aoMapIntensity,
      roughness: kit.wallMat.roughness,
      metalness: kit.wallMat.metalness,
      roughnessMap: kit.wallMat.roughnessMap,
      metalnessMap: kit.wallMat.metalnessMap,
    });
    material.userData.surface = kit.wallMat.userData.surface;
    material.userData.accentUniforms = kit.wallMat.userData.accentUniforms;
    addDirectLightOcclusion(material, cavity);
    useLightGrid(material, lightGrid);
    ownMaterials.push(material);
    kit.textures.push(texture);
    chalked.set(mat, material);
    return material;
  }
  function markLooted(looted: ReadonlySet<number> | undefined) {
    for (const index of looted ?? []) {
      if (markedProps.has(index)) continue;
      const obj = propObjects.get(index);
      const spec = map.props?.[index];
      if (!obj || !spec) continue;
      // its faces' textures (not loaded yet: next frame)
      const faces: { mesh: THREE.Mesh; mats: THREE.Material[]; chalk: THREE.MeshStandardMaterial }[] = [];
      let ready = true;
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
        const chalk = chalkedMaterial(mesh.material[0]);
        if (chalk) faces.push({ mesh, mats: mesh.material, chalk });
        else ready = false;
      });
      if (!ready) continue;
      markedProps.add(index);
      for (const { mesh, mats, chalk } of faces) mesh.material = [chalk, ...mats.slice(1)];
      if (PROP_TYPES[spec.prop].kind === "box") {
        // the lid (the box's last face - see buildPropTemplate) lifted a
        // little and askew
        const lid = obj.children[obj.children.length - 1];
        lid.position.y += 0.03;
        lid.position.z -= 0.02;
        lid.rotation.x += 0.12;
      }
    }
  }

  // The viewport owns the registered materials and kit textures.
  return { markLooted, dispose: () => chalked.clear() };
}
