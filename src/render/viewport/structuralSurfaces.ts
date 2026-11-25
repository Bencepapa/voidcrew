import type { DoorType } from "../../game/doorTypes";
import type { ViewportSettings } from "./settings";
import * as THREE from "three";
import { wallFaceSpans } from "../../game/mapGeometry";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import { cellAt, ceilingHeight, doorAt, floorHeight } from "../../game/map";
import { DIR_VECTOR } from "../../game/movement";
import type { Direction, DoorSpec, GameMap } from "../../game/types";
import { cellKey } from "../../game/visibility";
import { doorCellKey } from "../../game/useGameState";
import { WALL_ROTATION, surfaceKey } from "../surfaces";
import type { DecalLibrary } from "../decals";
import { isTextureSetId, type TextureSetId } from "../textureSets";
import { doorType } from "../../editor/sharedDoorTypes";
import { variantRows, variantHeight, wallPanels, type WallSlot, type WallKit, wallVariantRoll, type FarLevel } from "./walls";
import { DOOR_FRAME_SET } from "./constants";
import type { createSkySurface } from "./skySurface";
import type { DoorCell } from "./structuralDoors";
import type { BackingPanel } from "./wallBacking";

interface StructuralSurfacesContext {
  settings: ViewportSettings;
  doorPreview: DoorType | undefined;
  map: GameMap;
  group: THREE.Group;
  lightGrid: LightGridUniforms;
  wallHeight: number;
  primarySet: TextureSetId;
  accentSet: string;
  accentKit: WallKit | null;
  wallKits: Map<TextureSetId, WallKit>;
  wallKitFor: (setId: TextureSetId) => WallKit;
  floorKitAt: (x: number, y: number, m?: GameMap) => WallKit | null;
  ceilingKitAt: (x: number, y: number, m?: GameMap) => WallKit | null;
  floorDepth: number;
  litCells: Set<string>;
  litColors: Map<string, number>;
  effectCells: Map<string, number>;
  effectPanels: Map<string, { mat: THREE.MeshStandardMaterial; base: number; light: number; }>;
  deckLampColor: number;
  windowFaces: ReadonlyMap<string, TextureSetId>;
  windowKitFor: (setId: TextureSetId) => WallKit;
  panelSetFor: (kind: DoorSpec["kind"]) => TextureSetId;
  frameKits: Map<TextureSetId, WallKit>;
  panelKits: Map<TextureSetId, WallKit>;
  doorKitFor: (kits: Map<TextureSetId, WallKit>, set: TextureSetId) => WallKit;
  doorCells: DoorCell[];
  ownMaterials: THREE.MeshStandardMaterial[];
  floorMat: THREE.MeshStandardMaterial;
  ceilMat: THREE.MeshStandardMaterial;
  backingPanels: BackingPanel[];
  sky: Pick<ReturnType<typeof createSkySurface>, "skySurface" | "getTexture">;
  decals: DecalLibrary;
  geometries: THREE.BufferGeometry[];
  floorGeo: THREE.PlaneGeometry;
}

export function createStructuralSurfaces(context: StructuralSurfacesContext) {
  const {
    settings, doorPreview, map,
    group, lightGrid, wallHeight, primarySet, accentSet, accentKit, wallKits, wallKitFor, floorKitAt,
    ceilingKitAt, floorDepth, effectPanels, deckLampColor, windowFaces, windowKitFor, panelSetFor,
    frameKits, panelKits, doorKitFor, doorCells, ownMaterials, floorMat, ceilMat, backingPanels, sky,
    decals, geometries, floorGeo,
  } = context;

  // A wall panel, floor or ceiling tile faces one open cell - the one in
  // front of it (a floor's or ceiling's own). Every sight line to its face
  // ends in that cell, so it's culled with that cell (see applySight) -
  // not with the wall cell behind it, whose other faces can be in view
  // while this one is around a corner. And it's one-sided, backed by
  // solid stuff: while the eye is behind its plane, none of it can show
  // (see cullFacing).
  const facingSurfaces: THREE.Object3D[] = [];
  function markSurface(obj: THREE.Object3D) {
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
    obj.userData.cullCell = cellKey(Math.round(obj.position.x + n.x * 0.5), Math.round(obj.position.z + n.z * 0.5));
    // (and the cell behind its plane - see applyStructure)
    obj.userData.backCell = cellKey(Math.round(obj.position.x - n.x * 0.5), Math.round(obj.position.z - n.z * 0.5));
    obj.userData.facing = { n, d: n.dot(obj.position) };
    facingSurfaces.push(obj);
  }

  // A surface: its mesh - or, given distant low-detail geometries (see
  // LOD_FACTOR, SMOOTH_LODS), a level-of-detail set that switches to them
  // with distance - placed like the slot; decals go on the detailed one.
  function placeSurface(
    slot: WallSlot,
    geo: THREE.BufferGeometry,
    far: FarLevel[],
    mat: THREE.Material | THREE.Material[],
    orient: (obj: THREE.Object3D) => void,
  ) {
    const mesh = new THREE.Mesh(geo, mat);
    let obj: THREE.Object3D = mesh;
    if (far.length) {
      const lod = new THREE.LOD();
      lod.addLevel(mesh, 0);
      for (const level of far) lod.addLevel(new THREE.Mesh(level.geometry, mat), level.distance);
      obj = lod;
    }
    obj.position.set(slot.x, slot.y, slot.z);
    orient(obj);
    group.add(obj);
    obj.updateMatrixWorld(true);
    markSurface(obj);
    decals.registerSurface(slot.key, mesh);
    obj.userData.eventPart = slot.part;
    return obj;
  }

  function placeWalls(
    geo: THREE.BufferGeometry,
    far: FarLevel[],
    mat: THREE.Material | THREE.Material[],
    slots: WallSlot[],
  ) {
    for (const slot of slots) {
      placeSurface(slot, geo, far, mat, (o) => (o.rotation.y = slot.rotY));
      if (settings.wallProfile !== "relief") continue;
      const height = variantHeight(slot.variant ?? "full") * wallHeight;
      const bottom = -height / 2;
      const nx = Math.sin(slot.rotY), nz = Math.cos(slot.rotY);
      const cellX = Math.round(slot.x + nx * 0.5);
      const cellZ = Math.round(slot.z + nz * 0.5);
      // Only the panel touching the floor, never internal stacked seams.
      if (Math.abs(slot.y + bottom - floorHeight(map, cellX, cellZ) * wallHeight) > 1e-5) continue;
      const positions = geo.getAttribute("position"), uv = geo.getAttribute("uv");
      const index = geo.index;
      const out: number[] = [], tex: number[] = [];
      // Follow the actual detailed edge, including its recessed mortar.
      // The other edge overlaps the floor below its deepest relief. This
      // closes the opening with wall texture instead of a black blocker.
      const emit = (id: number, lower: boolean) => {
        out.push(positions.getX(id), lower ? bottom - floorDepth - 0.02 : bottom, lower ? floorDepth + 0.02 : positions.getZ(id));
        const rows = variantRows(slot.variant ?? "full");
        const vScale = rows ? rows[1] - rows[0] : 1;
        tex.push(uv.getX(id), uv.getY(id) - (lower ? ((floorDepth + 0.02) / height) * vScale : 0));
      };
      const frontGroups = geo.groups.length ? geo.groups.filter((g) => !g.materialIndex) : [{ start: 0, count: index?.count ?? positions.count }];
      const seen = new Set<string>();
      for (const g of frontGroups) for (let i = g.start; i < g.start + g.count; i += 3) {
        const ids = [0, 1, 2].map((k) => index ? index.getX(i + k) : i + k);
        for (let e = 0; e < 3; e++) {
          let a = ids[e], b = ids[(e + 1) % 3];
          if (Math.abs(positions.getY(a) - bottom) > 1e-5 || Math.abs(positions.getY(b) - bottom) > 1e-5) continue;
          if (positions.getX(a) > positions.getX(b)) [a, b] = [b, a];
          if (positions.getX(b) - positions.getX(a) < 1e-8) continue;
          const key = `${positions.getX(a)},${positions.getZ(a)}|${positions.getX(b)},${positions.getZ(b)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          emit(a, false); emit(a, true); emit(b, true);
          emit(a, false); emit(b, true); emit(b, false);
        }
      }
      if (!out.length) continue;
      const apron = new THREE.BufferGeometry();
      apron.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
      apron.setAttribute("uv", new THREE.Float32BufferAttribute(tex, 2));
      apron.setAttribute("uv1", new THREE.Float32BufferAttribute(tex, 2));
      apron.computeVertexNormals();
      geometries.push(apron);
      const skirt = new THREE.Mesh(apron, Array.isArray(mat) ? mat[0] : mat);
      skirt.position.set(slot.x, slot.y, slot.z);
      skirt.rotation.y = slot.rotY;
      group.add(skirt);
      skirt.updateMatrixWorld(true);
      markSurface(skirt);
      skirt.userData.eventSurface = slot.key;
      skirt.userData.eventPart = slot.part;
    }
  }

  // wall-style geometry (facing +Z) laid flat, facing up
  function placeFloors(
    geo: THREE.BufferGeometry,
    far: FarLevel[],
    mat: THREE.Material | THREE.Material[],
    slots: WallSlot[],
  ) {
    for (const slot of slots) placeSurface(slot, geo, far, mat, (o) => (o.rotation.x = -Math.PI / 2));
  }

  // ... and turned to face down from the ceiling; lit slots get the kit's
  // glowing front material (swapped when the lights change: ceilingTiles)
  const ceilingTiles: { cell: string; obj: THREE.Object3D; kit: WallKit; relief: boolean }[] = [];
  // a lamp of another color than the deck's glows in its own
  const coloredLitMats = new Map<WallKit, Map<number, THREE.MeshStandardMaterial>>();
  const litMatIn = (kit: WallKit, color: number | undefined) => {
    if (!kit.litMat || color === undefined || color === deckLampColor) return kit.litMat;
    let byColor = coloredLitMats.get(kit);
    if (!byColor) coloredLitMats.set(kit, (byColor = new Map()));
    let mat = byColor.get(color);
    if (!mat) {
      mat = kit.litMat.clone();
      mat.emissive.setHex(color);
      useLightGrid(mat, lightGrid);
      byColor.set(color, mat);
      ownMaterials.push(mat);
    }
    return mat;
  };
  const ceilingMaterial = (kit: WallKit, relief: boolean, lit: boolean, color?: number, cell?: string) => {
    let front = (lit && litMatIn(kit, color)) || kit.wallMat;
    const effect = cell === undefined ? undefined : context.effectCells.get(cell);
    if (lit && effect !== undefined && front !== kit.wallMat) {
      // an unsteady lamp's panel: its own copy, dimmed with it each frame
      const key = `${cell}|${kitId(kit)}`;
      let panel = effectPanels.get(key);
      if (!panel || panel.light !== effect) {
        const mat = (front as THREE.MeshStandardMaterial).clone();
        useLightGrid(mat, lightGrid);
        ownMaterials.push(mat);
        panel = { mat, base: mat.emissiveIntensity, light: effect };
        effectPanels.set(key, panel);
      }
      front = panel.mat;
    }
    return relief ? [front, kit.sideMat] : front;
  };
  // (kits told apart for effectPanels)
  const kitIds = new Map<WallKit, number>();
  const kitId = (kit: WallKit) => {
    if (!kitIds.has(kit)) kitIds.set(kit, kitIds.size);
    return kitIds.get(kit)!;
  };
  function placeCeilings(geo: THREE.BufferGeometry, far: FarLevel[], kit: WallKit, relief: boolean) {
    for (const slot of kit.slots) {
      const color = context.litColors.get(`${slot.x},${slot.z}`);
      const cell = `${slot.x},${slot.z}`;
      const obj = placeSurface(slot, geo, far, ceilingMaterial(kit, relief, !!slot.lit, color, cell), (o) => (o.rotation.x = Math.PI / 2));
      ceilingTiles.push({ cell: `${slot.x},${slot.z}`, obj, kit, relief });
    }
  }

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (cellAt(map, x, y) === "wall") continue;
      const floor = floorHeight(map, x, y);
      const ceiling = ceilingHeight(map, x, y);

      const floorKit = floorKitAt(x, y);
      if (floorKit) {
        floorKit.slots.push({ x, z: y, y: floor * wallHeight, rotY: 0, key: surfaceKey({ x, y }, "floor") });
      } else {
        const mesh = new THREE.Mesh(floorGeo, floorMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, floor * wallHeight, y);
        group.add(mesh);
        markSurface(mesh);
        decals.registerSurface(surfaceKey({ x, y }, "floor"), mesh);
      }

      const ceilingId = map.ceilingTextureAt?.(x, y) ?? map.textures?.ceiling;
      const ceilingKit = ceilingId === "sky" ? null : ceilingKitAt(x, y);
      if (ceilingId === "sky") {
        const pane = new THREE.Mesh(floorGeo, sky.skySurface());
        pane.userData.skyCeiling = true;
        pane.rotation.x = Math.PI / 2;
        pane.position.set(x, ceiling * wallHeight, y);
        group.add(pane);
        markSurface(pane);
      } else if (ceilingKit) {
        ceilingKit.slots.push({
          x,
          z: y,
          y: ceiling * wallHeight,
          rotY: 0,
          lit: context.litCells.has(`${x},${y}`),
          key: surfaceKey({ x, y }, "ceiling"),
        });
      } else {
        const mesh = new THREE.Mesh(floorGeo, ceilMat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, ceiling * wallHeight, y);
        group.add(mesh);
        markSurface(mesh);
        decals.registerSurface(surfaceKey({ x, y }, "ceiling"), mesh);
      }

      // The walls around the cell: wherever the cell's open span (floor to
      // ceiling) isn't matched by its neighbor's. A solid neighbor walls
      // off all of it; an open one with a higher floor leaves a step face
      // (riser) below its floor, one with a lower ceiling a strip (header)
      // above it.
      const wallOverride = map.wallTextureAt?.(x, y);
      (Object.keys(DIR_VECTOR) as Direction[]).forEach((d) => {
        const v = DIR_VECTOR[d];
        const nx = x + v.x;
        const ny = y + v.y;
        const spans = wallFaceSpans(map, { x, y }, d);
        if (!spans.length) return;

        const face = { x: x + v.x * 0.5, z: y + v.y * 0.5, rotY: WALL_ROTATION[d], key: surfaceKey({ x, y }, d) };
        // (a step face or header can have a set of its own - see
        // GameMap.faceTextureAt; a face against a wall cell can't)
        const faceOverride = cellAt(map, nx, ny) !== "wall" ? map.faceTextureAt?.(x, y, d) : undefined;
        const faceSet: string = isTextureSetId(faceOverride)
          ? faceOverride
          : isTextureSetId(wallOverride)
          ? wallOverride
          : accentKit && wallVariantRoll(face.x, face.z) < settings.accentRatio
            ? accentSet
            : primarySet;
        if (faceSet === "sky") {
          // an opening onto the sky
          for (const span of spans) {
            const geo = new THREE.PlaneGeometry(1, (span.top - span.bottom) * wallHeight);
            geometries.push(geo);
            const pane = new THREE.Mesh(geo, sky.skySurface());
            pane.position.set(face.x, ((span.bottom + span.top) / 2) * wallHeight, face.z);
            pane.rotation.y = face.rotY;
            group.add(pane);
          }
          return;
        }
        const kit = wallKitFor(faceSet as TextureSetId);
        if (settings.wallProfile === "relief") {
          for (const span of spans) {
            // No backing behind the side face of a raised floor (a riser): behind it is
            // the raised block, and a black plane there only shows through the seams.
            if (span.part === "riser") continue;
            backingPanels.push({
              ...face, width: 1,
              y: ((span.bottom + span.top) / 2) * wallHeight,
              height: (span.top - span.bottom) * wallHeight,
              floorTop: cellAt(map, nx, ny) !== "wall" && span.top === floorHeight(map, nx, ny),
              deep: windowFaces.has(face.key),
              // (a texture with holes - a grate, a fence, an arch - never gets one: see buildBacking)
              kit,
            });
          }
        }
        for (const span of spans) {
          for (const panel of wallPanels(span.bottom, span.top, span.part === "header" ? "top" : "bottom")) {
            const y = (panel.bottom + variantHeight(panel.variant) / 2) * wallHeight;
            // a window takes the first whole panel above the floor
            const windowSet = panel.bottom === floor && panel.variant === "full" ? windowFaces.get(face.key) : undefined;
            (windowSet ? windowKitFor(windowSet) : kit).slots.push({ ...face, y, variant: panel.variant, part: span.part });
          }
        }
      });

      if (cellAt(map, x, y) === "door") {
        const spec = doorAt(map, x, y);
        const type = doorPreview ?? doorType(spec.type);
        // (the door's own textures first, then its type's, then the deck's / the default; an unknown
        // own one - a shared texture not loaded yet - falls through, and the scene is rebuilt once it is)
        const frameSet = isTextureSetId(spec.frameTexture) ? spec.frameTexture : type?.frame ?? map.textures?.doorFrame;
        const frameKit = doorKitFor(frameKits, isTextureSetId(frameSet) ? frameSet : DOOR_FRAME_SET);
        const leafOwn = isTextureSetId(spec.leafTexture) ? spec.leafTexture : type?.leaf;
        const leafKit = doorKitFor(panelKits, isTextureSetId(leafOwn) ? leafOwn : panelSetFor(spec.kind));
        const motion = type ?? { motion: spec.kind === "lift" ? "slide" : "rise", hinge: "left", swingTo: "front", angle: 90 };
        doorCells.push({ x, z: y, spec, key: doorCellKey({ x, y }), frameKit, leafKit, motion });
      }
    }
  }
  const kits = [...wallKits.values()];
  // standing water mirrors the open sky, when there is one
  decals.setWaterSky(sky.getTexture());

  return { facingSurfaces, markSurface, placeWalls, placeFloors, ceilingTiles, ceilingMaterial, placeCeilings, kits };
}
