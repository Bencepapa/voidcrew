import * as THREE from "three";
import { propReliefAmount, type PropType } from "../../game/props";
import { isTextureSetId, type TextureSetFiles, type TextureSetId } from "../textureSets";
import { type WallKit, CORNER_JOINS } from "./walls";
import { PROP_COARSE } from "./constants";
import type { createReliefGeometry } from "./reliefGeometry";
import type { createStructuralWalls } from "./structuralWalls";

interface StructuralPropsContext {
  wallHeight: number;
  wallKitFor: (setId: TextureSetId) => WallKit;
  propReliefDepth: number;
  sharedPropKitFor: (setId: string, paths?: TextureSetFiles) => WallKit;
  ownMaterials: THREE.MeshStandardMaterial[];
  backingMat: THREE.MeshBasicMaterial;
  backingColor: () => THREE.Color;
  geometries: THREE.BufferGeometry[];
  buildRelief: ReturnType<typeof createReliefGeometry>["buildRelief"];
  joinEdgeCells: number;
  wallGeometry: ReturnType<typeof createStructuralWalls>["wallGeometry"];
  hybrid: boolean;
}

export function createStructuralProps({
  wallHeight, wallKitFor, propReliefDepth, sharedPropKitFor, ownMaterials, backingMat, backingColor,
  geometries, buildRelief, joinEdgeCells, wallGeometry, hybrid,
}: StructuralPropsContext) {
  // Props are relief, whatever the wall type. A box prop: four side faces
  // and a top, each a relief panel facing out. A views prop: box parts
  // whose faces are cut out of its orthographic views' reliefs (see
  // props.ts) - a face shows the part of the view it covers. Reliefs
  // aren't flushed at the edges, so a raised rim leaves a small notch
  // along an edge - it reads as a worn edge. One template per prop type,
  // cloned per instance (sharing geometry and materials).
  // a cabin prop's glass: faintly tinted, see-through, catching the lights
  const cabinGlass = new THREE.MeshStandardMaterial({
    color: 0xd8ecff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.08,
    metalness: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ownMaterials.push(cabinGlass);

  // A pillar `h` tall (world units): its foot, shaft and head as relief
  // blocks cut from its texture (as a wall of the same height would show
  // it), the 45 degree slopes between them flat.
  async function buildPillar(type: Extract<PropType, { kind: "pillar" }>, h: number, cellSet: string): Promise<THREE.Group | null> {
    // (in a deck texture - its own, the wall's around it - it's the deck's: it
    // takes the ship's livery like the walls)
    const setId = type.texture ?? cellSet;
    const kit = isTextureSetId(setId) ? wallKitFor(setId) : sharedPropKitFor(setId);
    const relief = propReliefAmount(propReliefDepth, type, hybrid);
    const foot = type.size[0];
    const shaft = type.shaft;
    const slope = (foot - shaft) / 2;
    const flare = Math.min(type.flare, Math.max(0, h / 2 - slope - 0.05));
    const group = new THREE.Group();
    // The texture covers one wall height, as on a wall, and repeats up a taller
    // pillar instead of stretching over it: a block is cut into pieces at
    // every wall height.
    const tile = wallHeight;
    // the whole panel first: it gives the kit its AO map
    if (!(await buildRelief(kit, { width: 1, height: tile, flushEdges: false, depth: relief, coarse: PROP_COARSE }))) return null;
    const block = async (w: number, y0: number, y1: number) => {
      for (let s0 = y0; s0 < y1 - 1e-6; ) {
        const k = Math.floor(s0 / tile + 1e-6);
        const s1 = Math.min(y1, (k + 1) * tile);
        // (its four faces meet at outer corners: built to land on the
        // mitre - see ReliefOptions.edgeModes - the copies of one face meet
        // vertex on vertex all the way round, no core showing between them)
        const cut = await buildRelief(kit, {
          width: w,
          height: s1 - s0,
          flushRows: true,
          flushEdges: false,
          depth: relief,
          coarse: PROP_COARSE,
          cols: [0.5 - w / 2, 0.5 + w / 2],
          rows: [1 - (s1 - k * tile) / tile, 1 - (s0 - k * tile) / tile],
          ...(CORNER_JOINS ? { joinEdges: joinEdgeCells, edgeModes: [1, 1] as [number, number] } : {}),
        });
        if (!cut) return false;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          const mesh = new THREE.Mesh(cut.geometry, [kit.wallMat, kit.sideMat]);
          mesh.position.set((Math.sin(a) * w) / 2, (s0 + s1) / 2, (Math.cos(a) * w) / 2);
          mesh.rotation.y = a;
          group.add(mesh);
        }
        s0 = s1;
      }
      return true;
    };
    const ok =
      (await block(foot, 0, flare)) &&
      (await block(shaft, flare + slope, h - flare - slope)) &&
      (await block(foot, h - flare, h));
    if (!ok) return null;
    // the slopes: a band of four quads each, from `w0` wide at `y0` to
    // `w1` at `y1`, mapped as the wall texture would be there
    const positions: number[] = [];
    const uvs: number[] = [];
    const band = (w0: number, y0: number, w1: number, y1: number) => {
      // (v continues from the tile the band's middle is in)
      const mid = (y0 + y1) / 2;
      const vOf = (y: number) => (mid / tile) % 1 + (y - mid) / tile;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const s = Math.sin(a);
        const c = Math.cos(a);
        // (u across the face, its half width, y) to the pillar's space
        const at = (u: number, half: number, y: number) => [c * u + s * half, y, -s * u + c * half];
        const corners = [
          [...at(-w0 / 2, w0 / 2, y0), 0.5 - w0 / 2, vOf(y0)],
          [...at(w0 / 2, w0 / 2, y0), 0.5 + w0 / 2, vOf(y0)],
          [...at(w1 / 2, w1 / 2, y1), 0.5 + w1 / 2, vOf(y1)],
          [...at(-w1 / 2, w1 / 2, y1), 0.5 - w1 / 2, vOf(y1)],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          positions.push(corners[k][0], corners[k][1], corners[k][2]);
          uvs.push(corners[k][3], corners[k][4]);
        }
      }
    };
    band(foot, flare, shaft, flare + slope);
    band(shaft, h - flare - slope, foot, h - flare);
    const slopes = new THREE.BufferGeometry();
    slopes.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    slopes.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    slopes.setAttribute("uv1", new THREE.Float32BufferAttribute(uvs, 2));
    slopes.computeVertexNormals();
    geometries.push(slopes);
    group.add(new THREE.Mesh(slopes, kit.wallMat));
    // A solid black core inside, a little under the relief: the pillar is made
    // of separate faces and slopes, and without a core the joins between them
    // show what's behind it (the sky, the next room).
    const inset = 2 * (relief + 0.012);
    const coreMat = backingMat;
    const core = (w: number, y0: number, y1: number) => {
      const geo = new THREE.BoxGeometry(Math.max(0.02, w - inset), y1 - y0, Math.max(0.02, w - inset));
      const colors: number[] = [];
      for (let face = 0; face < 6; face++) {
        const color = backingColor();
        for (let v = 0; v < 4; v++) colors.push(color.r, color.g, color.b);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, coreMat);
      mesh.position.set(0, (y0 + y1) / 2, 0);
      group.add(mesh);
    };
    // (the foot's width only where the foot is: over the slopes the pillar
    // narrows, and a wider core would stick out of them)
    core(foot, 0, flare);
    core(shaft, flare, h - flare);
    core(foot, h - flare, h);
    // a fixed-height pillar (a pedestal) gets a stone top to stand things on
    if (type.height) {
      const top = new THREE.PlaneGeometry(foot, foot);
      const uv = top.getAttribute("uv") as THREE.BufferAttribute;
      // (the middle of the texture, stretched over it)
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.3 + uv.getX(i) * 0.4, 0.3 + uv.getY(i) * 0.4);
      top.setAttribute("uv1", uv.clone());
      geometries.push(top);
      const cap = new THREE.Mesh(top, kit.wallMat);
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = h + 0.001;
      group.add(cap);
    }
    return group;
  }

  // A chamfer `h` tall (world units) in `kit`'s texture: one relief panel,
  // cut from the middle of a wall panel as wide.
  async function buildChamfer(type: Extract<PropType, { kind: "chamfer" }>, kit: WallKit, h: number): Promise<THREE.Group | null> {
    const w = type.size[0];
    // after the walls' whole panel, whose AO map it borrows
    if (!(await wallGeometry(kit, "full"))) return null;
    const panel = await buildRelief(kit, { width: w, height: h, flushEdges: true, cols: [0.5 - w / 2, 0.5 + w / 2], rows: [0, 1] });
    if (!panel) return null;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(panel.geometry, [kit.wallMat, kit.sideMat]);
    mesh.position.y = h / 2;
    group.add(mesh);
    return group;
  }

  return { cabinGlass, buildPillar, buildChamfer };
}
