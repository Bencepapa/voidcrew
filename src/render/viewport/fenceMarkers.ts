import * as THREE from "three";
import { fenceFloorMark, type FenceModelSpec } from "../../game/fences";

interface FenceMarkersContext {
  geometries: THREE.BufferGeometry[];
  reliefDepth: number;
  editModeRef: { readonly current: boolean };
}

export function createFenceMarkers({ geometries, reliefDepth, editModeRef }: FenceMarkersContext) {

  // Their floor marks while editing: a hatched square for a block, strips for the fences (amber, cyan, green)
  const fenceMarkTexture = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const g = canvas.getContext("2d")!;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(3, 3, 58, 58);
    g.lineWidth = 5;
    for (let i = -64; i < 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 64, 0);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const fenceMarkMats = Object.fromEntries(
    (["block", "edge", "mid"] as const).map((form) => [
      form,
      new THREE.MeshBasicMaterial({
        color: form === "block" ? 0xffb347 : form === "edge" ? 0x4fd1ff : 0x7dff9a,
        map: fenceMarkTexture,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    ]),
  ) as Record<"block" | "edge" | "mid", THREE.MeshBasicMaterial>;
  // The floor marks of the pieces built (by prop index), and the piece each belongs to: in the scene only
  // while editing (a hidden mesh would still be hit by the shots' rays)
  const fenceMarkers = new Map<number, { marker: THREE.Object3D; owner: THREE.Object3D }>();
  function syncFenceMarkers() {
    const want = editModeRef.current;
    for (const { marker, owner } of fenceMarkers.values()) {
      if (want && marker.parent !== owner) owner.add(marker);
      else if (!want && marker.parent) marker.parent.remove(marker);
    }
  }

  function buildFenceMarker(spec: FenceModelSpec) {
    const marker = new THREE.Group();
    marker.name = "fenceMarker";
    for (const r of fenceFloorMark(spec)) {
      const geo = new THREE.PlaneGeometry(r.sx, r.sz);
      geometries.push(geo);
      const mark = new THREE.Mesh(geo, fenceMarkMats[spec.form]);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(r.x, reliefDepth + 0.01, r.z);
      marker.add(mark);
    }
    return marker;
  }

  function syncFenceMarker(index: number, prop: THREE.Object3D) {
    const marker = prop.getObjectByName("fenceMarker");
    if (marker) fenceMarkers.set(index, { marker, owner: prop });
    else fenceMarkers.delete(index);
    syncFenceMarkers();
  }

  function dispose() {
    fenceMarkTexture.dispose();
    for (const mat of Object.values(fenceMarkMats)) mat.dispose();
  }

  return { buildFenceMarker, syncFenceMarker, syncFenceMarkers, clear: () => fenceMarkers.clear(), dispose };
}
