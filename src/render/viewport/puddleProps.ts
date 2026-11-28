import { Group, Mesh, PlaneGeometry, Vector3, type Material, type MeshPhysicalMaterial, type PerspectiveCamera, type PointLight, type Scene, type Texture, type WebGLRenderer, type WebGLRenderTarget, type WebGLCubeRenderTarget, type Object3D } from "three";
import { PUDDLE_PROP, type PuddleRipple } from "../../game/puddle";
import type { GameMap } from "../../game/types";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import { createPuddleMaterial } from "./puddleMaterial";
import { captureReflection } from "./reflectionCapture";
import { reflectionRooms, type ReflectionRoom } from "./reflectionRooms";
import { hasRoomMetal, roomMetalMeshes, syncRoomMetal, type RoomMetalMaterial } from "./roomMetal";
import { createRoomReflectionDebug } from "./roomReflectionDebug";

const PUDDLE_MESH = "reflectivePuddle";
const MAX_ROOMS = 4;
const ROOM_FACE_SIZE = 64;

type RoomCapture = { target: WebGLRenderTarget; cube?: WebGLCubeRenderTarget; metal: Map<Material, RoomMetalMaterial>; revision: number; local: boolean };

export function createPuddleProps(scene: Scene, lightGrid: LightGridUniforms, wallHeight: number, loadMask: () => Texture) {
  const time = { value: 0 };
  const debug = createRoomReflectionDebug(scene);
  const captures = new Map<ReflectionRoom, RoomCapture>();
  const failedRooms = new Set<ReflectionRoom>();
  const puddleMaterials = new Map<Mesh, { room?: ReflectionRoom; ripple: Vector3; material: MeshPhysicalMaterial }>();
  let mask: Texture | undefined;
  let base: MeshPhysicalMaterial | undefined;
  let geometry: PlaneGeometry | undefined;
  let rooms: ReturnType<typeof reflectionRooms> | undefined;
  let previousMap: GameMap | undefined;
  let grid = lightGrid.faces[0].value;
  let revision = 0;
  let nextCaptureAt = 0;

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
    mesh.userData.pickTransparentProp = true;
    group.add(mesh);
    return group;
  }

  function release(capture: RoomCapture) {
    for (const { material } of capture.metal.values()) material.dispose();
    capture.target.dispose();
    capture.cube?.dispose();
  }

  function update(
    map: GameMap, renderer: WebGLRenderer, headlamp: PointLight, camera: PerspectiveCamera, now: number, elapsed: number,
    canCapture: boolean, surfaces: Iterable<Object3D>, objects: ReadonlyMap<number, Object3D>, metalEnabled: boolean,
    viewer: { x: number; z: number }, showDebug: boolean,
  ) {
    if (!base && !metalEnabled && !showDebug) return;
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
      failedRooms.clear();
      nextCaptureAt = now + 500;
    }
    const nearest = new Map<ReflectionRoom, number>();
    const puddles = new Map<Mesh, { room?: ReflectionRoom; ripple?: PuddleRipple }>();
    const metals = new Map<Mesh, ReflectionRoom>();
    const addCandidate = (room: ReflectionRoom, position: Vector3) => {
      nearest.set(room, Math.min(position.distanceToSquared(camera.position), nearest.get(room) ?? Infinity));
    };
    const currentRoom = rooms(Math.round(viewer.x), Math.round(viewer.z));
    if (currentRoom && (metalEnabled || showDebug)) nearest.set(currentRoom, -1);
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
      puddles.set(mesh, { room, ripple: spec.ripple });
      if (room && object.visible) addCandidate(room, object.position);
    }
    if (metalEnabled) {
      for (const surface of surfaces) {
        const normal = surface.userData.facing?.n as Vector3 | undefined;
        if (!surface.visible || !normal) continue;
        const room = rooms(Math.round(surface.position.x + normal.x * 0.5), Math.round(surface.position.z + normal.z * 0.5));
        if (!room) continue;
        for (const mesh of roomMetalMeshes(surface)) { metals.set(mesh, room); addCandidate(room, surface.position); }
      }
    }
    if (canCapture && now >= nextCaptureAt) {
      const activeRooms = [...nearest].sort((a, b) => a[1] - b[1]).slice(0, MAX_ROOMS).map(([room]) => room);
      const pending = activeRooms.find(room => {
        const capture = captures.get(room);
        return !failedRooms.has(room) && (capture?.revision !== revision || (room === currentRoom && !capture.local));
      });
      if (pending) {
        nextCaptureAt = now + 250;
        try {
          const { target, cube } = captureReflection(renderer, scene, new Vector3(...pending.origin), surfaces, headlamp, lightGrid, ROOM_FACE_SIZE, true);
          const previous = captures.get(pending);
          previous?.target.dispose();
          previous?.cube?.dispose();
          captures.set(pending, { target, cube, metal: previous?.metal ?? new Map(), revision, local: pending === currentRoom });
          if (captures.size > MAX_ROOMS) {
            for (const [room, capture] of captures) {
              if (activeRooms.includes(room)) continue;
              captures.delete(room);
              release(capture);
              break;
            }
          }
        } catch (error) {
          failedRooms.add(pending);
          console.warn("Puddle room capture failed:", error);
        }
      }
    }
    for (const [mesh, entry] of puddleMaterials) {
      if (puddles.has(mesh)) continue;
      entry.material.dispose();
      puddleMaterials.delete(mesh);
    }
    if (mask) for (const [mesh, { room, ripple }] of puddles) {
      const capture = room && captures.get(room);
      let entry = puddleMaterials.get(mesh);
      if (!entry || entry.room !== room) {
        entry?.material.dispose();
        const wave = new Vector3(1, 1, 1);
        const material = createPuddleMaterial(mask, time, room, wave);
        useLightGrid(material, lightGrid);
        entry = { room, ripple: wave, material };
        puddleMaterials.set(mesh, entry);
      }
      entry.ripple.set(ripple?.speed ?? 1, ripple?.amplitude ?? 1, ripple?.density ?? 1);
      const texture = capture?.target.texture ?? null;
      if (entry.material.envMap !== texture) {
        entry.material.envMap = texture;
        entry.material.needsUpdate = true;
      }
      mesh.material = entry.material;
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

  function showCubeAt(x?: number, z?: number) {
    const room = x !== undefined && z !== undefined ? rooms?.(Math.round(x), Math.round(z)) : undefined;
    debug.update(room && captures.get(room)?.cube?.texture, room?.origin);
  }

  function invalidateDoor(x: number, z: number) {
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const room = rooms?.(x + dx, z + dz);
      if (!room) continue;
      const capture = captures.get(room);
      if (capture) capture.revision = -1;
      failedRooms.delete(room);
    }
  }

  return { build, update, showCubeAt, invalidateDoor, dispose() {
    debug.dispose();
    geometry?.dispose();
    base?.dispose();
    for (const { material } of puddleMaterials.values()) material.dispose();
    puddleMaterials.clear();
    for (const capture of captures.values()) release(capture);
    captures.clear();
  } };
}
