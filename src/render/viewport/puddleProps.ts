import { Group, Mesh, PlaneGeometry, Vector3, type Material, type MeshPhysicalMaterial, type PerspectiveCamera, type PointLight, type Scene, type Texture, type WebGLRenderer, type WebGLRenderTarget, type Object3D } from "three";
import { PUDDLE_PROP } from "../../game/puddle";
import type { GameMap } from "../../game/types";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import { createPuddleMaterial } from "./puddleMaterial";
import { captureReflection } from "./reflectionCapture";
import { reflectionRooms, type ReflectionRoom } from "./reflectionRooms";
import { hasRoomMetal, roomMetalMeshes, syncRoomMetal, type RoomMetalMaterial } from "./roomMetal";

const PUDDLE_MESH = "reflectivePuddle";
const MAX_ROOMS = 4;

type RoomCapture = { target: WebGLRenderTarget; material?: MeshPhysicalMaterial; metal: Map<Material, RoomMetalMaterial>; revision: number };

export function createPuddleProps(scene: Scene, lightGrid: LightGridUniforms, wallHeight: number, loadMask: () => Texture) {
  const time = { value: 0 };
  const captures = new Map<ReflectionRoom, RoomCapture>();
  let mask: Texture | undefined;
  let base: MeshPhysicalMaterial | undefined;
  let geometry: PlaneGeometry | undefined;
  let rooms: ReturnType<typeof reflectionRooms> | undefined;
  let previousMap: GameMap | undefined;
  let grid = lightGrid.faces[0].value;
  let revision = 0;
  let nextCaptureAt = 0;
  let failed = false;

  function build(width: number, depth: number) {
    if (!geometry) {
      geometry = new PlaneGeometry(width, depth);
      geometry.rotateX(-Math.PI / 2);
    }
    mask ??= loadMask();
    base ??= createPuddleMaterial(mask, time);
    useLightGrid(base, lightGrid);
    const group = new Group();
    const mesh = new Mesh(geometry, base);
    mesh.name = PUDDLE_MESH;
    mesh.userData.excludeFromReflectionCapture = true;
    group.add(mesh);
    return group;
  }

  function release(capture: RoomCapture) {
    capture.material?.dispose();
    for (const { material } of capture.metal.values()) material.dispose();
    capture.target.dispose();
  }

  function update(
    map: GameMap, renderer: WebGLRenderer, headlamp: PointLight, camera: PerspectiveCamera, now: number, elapsed: number,
    canCapture: boolean, surfaces: Iterable<Object3D>, objects: ReadonlyMap<number, Object3D>, metalEnabled: boolean,
  ) {
    if (!base && !metalEnabled) return;
    time.value = elapsed;
    if (!rooms || previousMap?.structureKey !== map.structureKey) {
      for (const capture of captures.values()) release(capture);
      captures.clear();
      rooms = reflectionRooms(map, wallHeight);
    }
    if (previousMap !== map || grid !== lightGrid.faces[0].value) {
      previousMap = map;
      grid = lightGrid.faces[0].value;
      revision++;
      nextCaptureAt = now + 500;
    }
    const nearest = new Map<ReflectionRoom, number>();
    const puddles: { mesh: Mesh; room?: ReflectionRoom }[] = [];
    const metals = new Map<Mesh, ReflectionRoom>();
    const addCandidate = (room: ReflectionRoom, position: Vector3) => {
      nearest.set(room, Math.min(position.distanceToSquared(camera.position), nearest.get(room) ?? Infinity));
    };
    for (const [index, object] of objects) {
      const spec = map.props?.[index];
      if (!spec) continue;
      if (spec.prop !== PUDDLE_PROP) {
        if (!metalEnabled || !object.visible) continue;
        const room = rooms(spec.cell.x, spec.cell.y);
        if (!room) continue;
        for (const mesh of roomMetalMeshes(object)) { metals.set(mesh, room); addCandidate(room, object.position); }
        continue;
      }
      const mesh = object.getObjectByName(PUDDLE_MESH) as Mesh | undefined;
      if (!mesh) continue;
      const room = rooms(spec.cell.x, spec.cell.y);
      puddles.push({ mesh, room });
      if (room && object.visible) addCandidate(room, object.position);
    }
    if (metalEnabled) {
      for (const surface of surfaces) {
        const normal = surface.userData.facing?.n as Vector3 | undefined;
        if (!surface.visible || !normal || Math.abs(normal.y) > 0.75) continue;
        const room = rooms(Math.round(surface.position.x + normal.x * 0.5), Math.round(surface.position.z + normal.z * 0.5));
        if (!room) continue;
        for (const mesh of roomMetalMeshes(surface)) { metals.set(mesh, room); addCandidate(room, surface.position); }
      }
    }
    if (canCapture && !failed && now >= nextCaptureAt) {
      const activeRooms = [...nearest].sort((a, b) => a[1] - b[1]).slice(0, MAX_ROOMS).map(([room]) => room);
      const pending = activeRooms.find(room => captures.get(room)?.revision !== revision);
      if (pending) {
        nextCaptureAt = now + 250;
        try {
          const target = captureReflection(renderer, scene, new Vector3(...pending.origin), surfaces, headlamp, lightGrid);
          const previous = captures.get(pending);
          const material = previous?.material;
          if (material) { material.envMap = target.texture; material.needsUpdate = true; }
          previous?.target.dispose();
          captures.set(pending, { target, material, metal: previous?.metal ?? new Map(), revision });
          if (captures.size > MAX_ROOMS) {
            for (const [room, capture] of captures) {
              if (activeRooms.includes(room)) continue;
              captures.delete(room);
              release(capture);
              break;
            }
          }
        } catch (error) {
          failed = true;
          console.warn("Puddle room capture failed:", error);
        }
      }
    }
    if (base && mask) for (const { mesh, room } of puddles) {
      const capture = room && captures.get(room);
      if (capture && !capture.material) {
        capture.material = createPuddleMaterial(mask, time, room);
        useLightGrid(capture.material, lightGrid, { value: 0 });
        capture.material.envMap = capture.target.texture;
      }
      mesh.material = capture?.material ?? base;
    }
    const bindings: [Mesh, Material | Material[]][] = [];
    for (const [mesh, room] of metals) {
      const capture = captures.get(room);
      if (!capture) continue;
      const source = mesh.material;
      const bind = (material: Material) => hasRoomMetal(material) ? syncRoomMetal(material, capture.target.texture, room, capture.metal) : material;
      bindings.push([mesh, source]);
      mesh.material = Array.isArray(source) ? source.map(bind) : bind(source);
    }
    return () => { for (const [mesh, source] of bindings) mesh.material = source; };
  }

  return { build, update, dispose() {
    geometry?.dispose();
    base?.dispose();
    for (const capture of captures.values()) release(capture);
    captures.clear();
  } };
}
