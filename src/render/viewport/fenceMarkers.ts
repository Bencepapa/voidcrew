import * as THREE from "three";
import { foliageFloorMark } from "../../game/fenceLayers";
import { fenceFloorMark, isFoliageSpec, type FenceModelSpec } from "../../game/fences";

// the kinds of floor mark: the three forms, and the foliage pieces (layered, an X)
type MarkKind = "block" | "edge" | "mid" | "layered" | "cross";
const MARK_COLORS: Record<MarkKind, number> = { block: 0xffb347, edge: 0x4fd1ff, mid: 0x7dff9a, layered: 0xd4ff3f, cross: 0xff7de0 };

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
    (Object.keys(MARK_COLORS) as MarkKind[]).map((form) => [
      form,
      new THREE.MeshBasicMaterial({
        color: MARK_COLORS[form],
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
  ) as Record<MarkKind, THREE.MeshBasicMaterial>;
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
    const foliage = isFoliageSpec(spec);
    const kind: MarkKind = spec.cross ? "cross" : foliage ? "layered" : spec.form;
    for (const r of foliage ? foliageFloorMark(spec) : fenceFloorMark(spec).map((m) => ({ ...m, yaw: 0 }))) {
      const geo = new THREE.PlaneGeometry(r.sx, r.sz);
      geometries.push(geo);
      const mark = new THREE.Mesh(geo, fenceMarkMats[kind]);
      // (lying flat, then turned about the vertical - for a diagonal; a direct child of the marker, which the picking looks for)
      mark.rotation.set(-Math.PI / 2, r.yaw, 0, "YXZ");
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
