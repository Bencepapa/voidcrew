import * as THREE from "three";
import { ACTOR_TYPES, BODY_PARTS, actorHeight, critAt, type ActorState, type BodyPart } from "../../game/actors";
import { gameClock } from "../../game/clock";

import { weaponAccuracy, type ShotResult, type Weapon } from "../../game/combat";
import { cellKey } from "../../game/visibility";
import { PARTY_COVER_REFRESH_MS, PARTY_BODY_HEIGHTS, PARTY_BODY_HALF_WIDTH, CHANCE_GRID,
  AIM_CHANCE_REFRESH_MS, AIM_CHANCE_PARTS_PER_FRAME, TRACER_MS, PARTY_FLASH_COLOR } from "./actors";
import type { ActorEntry } from "./actorRendering";
import { partAt } from "./aimHitPart";
import type { AimFrame, AimTarget } from "./contracts";
import { drawnChain, seeThrough, isProp } from "./raycastObjects";

export function createCombatAiming(deps: {
  container: HTMLElement;
  scene: THREE.Scene;
  group: THREE.Group;
  camera: THREE.Camera;
  wallHeight: number;
  doorPreview: boolean | undefined;
  aimFrameRef: { current: AimFrame | null };
  partyCoverRef: { readonly current: Map<number, number> } | undefined;
  cellOf: (obj: THREE.Object3D) => string | null;
  getSceneVersion: () => number;
  actorsRef: { readonly current: readonly ActorState[] };
  actorMeshes: ReadonlyMap<number, ActorEntry>;
  alphaAt: (typeName: string, u: number, v: number) => number;
  addFlash: (at: THREE.Vector3, color: number, intensity: number, range: number, duration: number) => void;
}) {
  const {
    container, scene, group, camera, wallHeight, doorPreview, aimFrameRef,
    partyCoverRef, cellOf, getSceneVersion, actorsRef, actorMeshes, alphaAt, addFlash,
  } = deps;

  // --- Aiming (see combat.ts): while a crewmate aims, each frame lists
  // the enemies in reach with their body parts' screen rectangles and hit
  // chances for the aiming overlay, which shoots through `shoot` ---------
  const aimRaycaster = new THREE.Raycaster();
  const aimNdc = new THREE.Vector2();
  const aimVec = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  // each part's hit chance (by "actor:part") and when it was worked out
  const chanceCache = new Map<string, number>();
  const chanceAt = new Map<string, number>();

  // What a ray between two points can meet: the objects culled with the
  // cells along it and around (see cellOf), plus the ones never culled
  // and the actors (they move). Testing only those - not the whole deck's
  // hundreds of meshes - is what keeps aiming smooth.
  let rayCells: Map<string, THREE.Object3D[]> | null = null;
  const rayAlways: THREE.Object3D[] = [];
  let rayCellsAt = "";
  function objectsAlong(from: THREE.Vector3, to: THREE.Vector3): THREE.Object3D[] {
    const version = `${group.children.length}|${getSceneVersion()}`;
    if (!rayCells || rayCellsAt !== version) {
      rayCells = new Map();
      rayAlways.length = 0;
      rayCellsAt = version;
      for (const obj of group.children) {
        const key = obj.userData.actor ? null : cellOf(obj);
        if (key === null) rayAlways.push(obj);
        else {
          const list = rayCells.get(key);
          if (list) list.push(obj);
          else rayCells.set(key, [obj]);
        }
      }
    }
    const out = [...rayAlways];
    const seen = new Set<string>();
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.25) + 1;
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(from.x + ((to.x - from.x) * i) / steps);
      const cz = Math.round(from.z + ((to.z - from.z) * i) / steps);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = cellKey(cx + dx, cz + dz);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = rayCells.get(key);
          if (list) out.push(...list);
        }
      }
    }
    return out;
  }
  // what a shot at a spot of an actor's sheet cell hits: a weak spot's
  // part, or the part there
  function hitPart(typeName: string, col: number, u: number, v: number): { part: BodyPart; crit?: string } {
    const type = ACTOR_TYPES[typeName];
    const crit = critAt(type, col, u, v);
    return crit ? { part: crit.part, crit: crit.label } : { part: partAt(type.parts, BODY_PARTS, u, v) };
  }

  // a point of an actor's quad, from a spot of its sheet cell
  function actorPoint(entry: ActorEntry, typeName: string, u: number, v: number, out: THREE.Vector3) {
    const type = ACTOR_TYPES[typeName];
    const h = actorHeight(typeName) * wallHeight;
    const w = h * type.cellAspect;
    return out.set((entry.mirror ? 0.5 - u : u - 0.5) * w, (0.5 - v) * h, 0).applyMatrix4(entry.mesh.matrixWorld);
  }
  // how much of a spot on an actor the camera sees past everything else
  function unoccluded(target: THREE.Vector3, self: THREE.Object3D): boolean {
    aimDir.copy(target).sub(camera.position);
    const dist = aimDir.length();
    aimRaycaster.set(camera.position, aimDir.normalize());
    aimRaycaster.far = dist - 0.03;
    for (const hit of aimRaycaster.intersectObjects(objectsAlong(camera.position, target), true)) {
      if (hit.object === self || !drawnChain(hit.object) || seeThrough(hit.object)) continue;
      if (hit.object.userData.actorId !== undefined) {
        const other = actorMeshes.get(hit.object.userData.actorId as number);
        const actor = actorsRef.current.find((a) => a.id === hit.object.userData.actorId);
        if (!other || !actor || !hit.uv || alphaAt(actor.type, hit.uv.x, hit.uv.y) < 128) continue;
      }
      return false;
    }
    return true;
  }
  function updateAimFrame(weapon: Weapon, camX: number, camZ: number, aimZoom: number) {
    const cw = container.clientWidth || 1;
    const ch = container.clientHeight || 1;
    const startedAt = performance.now();
    // chances go stale and are worked out again a few parts a frame, not
    // all at once (a new part's straight away)
    let budget = AIM_CHANCE_PARTS_PER_FRAME;
    const sway = (weapon.sway ?? 0.03) * ch * aimZoom;
    const targets: AimTarget[] = [];
    for (const actor of actorsRef.current) {
      const entry = actorMeshes.get(actor.id);
      if (actor.diedAt !== null || actor.friendly || !entry?.mesh.visible) continue;
      const distance = Math.hypot(entry.mesh.position.x - camX, entry.mesh.position.z - camZ);
      if (distance > (weapon.range ?? 1) + 0.5) continue;
      entry.mesh.updateMatrixWorld();
      const type = ACTOR_TYPES[actor.type];
      const parts: AimTarget["parts"] = [];
      for (const part of BODY_PARTS) {
        const [u0, v0, u1, v1] = type.parts[part].zone;
        let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
        let behind = false;
        for (const [u, v] of [
          [u0, v0],
          [u1, v0],
          [u0, v1],
          [u1, v1],
        ]) {
          actorPoint(entry, actor.type, u, v, aimVec).project(camera);
          if (aimVec.z > 1) behind = true;
          const sx = ((aimVec.x + 1) / 2) * cw;
          const sy = ((1 - aimVec.y) / 2) * ch;
          [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
        }
        if (behind) continue;
        const key = `${actor.id}:${part}`;
        const stale = !chanceCache.has(key) || (budget > 0 && startedAt - (chanceAt.get(key) ?? 0) > AIM_CHANCE_REFRESH_MS);
        if (stale) {
          if (chanceCache.has(key)) budget--;
          chanceAt.set(key, startedAt);
          // A grid of spots over the part's zone: those on the part itself
          // (the sprite's solid pixels there, not another part's) give its
          // real size; those of them in plain view, its cover.
          let solid = 0;
          let seen = 0;
          for (let i = 0; i < CHANCE_GRID; i++) {
            for (let j = 0; j < CHANCE_GRID; j++) {
              const u = u0 + ((u1 - u0) * (i + 0.5)) / CHANCE_GRID;
              const v = v0 + ((v1 - v0) * (j + 0.5)) / CHANCE_GRID;
              const su = (entry.col + u) / type.cols;
              const sv = 1 - (entry.row + v) / type.rows;
              if (alphaAt(actor.type, su, sv) < 128 || hitPart(actor.type, entry.col, u, v).part !== part) continue;
              solid++;
              if (unoccluded(actorPoint(entry, actor.type, u, v, aimVec), entry.mesh)) seen++;
            }
          }
          // a part smaller than the weapon's sway is harder to land on
          const area = (x1 - x0) * (y1 - y0) * (solid / (CHANCE_GRID * CHANCE_GRID));
          const size = Math.min(1, Math.sqrt(area / (Math.PI * sway * sway)));
          const cover = solid ? seen / solid : 0;
          chanceCache.set(key, Math.min(0.97, cover * weaponAccuracy(weapon, distance) * size));
        }
        parts.push({ part, label: type.parts[part].label, rect: [x0, y0, x1, y1], chance: chanceCache.get(key)! });
      }
      // the two arms: named by the side of the screen they're on
      actorPoint(entry, actor.type, 0.5, 0.5, aimVec).project(camera);
      const midX = ((aimVec.x + 1) / 2) * cw;
      for (const p of parts) {
        if (p.part === "armL" || p.part === "armR") {
          p.label = `${(p.rect[0] + p.rect[2]) / 2 < midX ? "LEFT" : "RIGHT"} ${p.label}`;
        }
      }
      if (parts.length) targets.push({ id: actor.id, name: type.name, distance, parts });
    }
    targets.sort((a, b) => a.distance - b.distance);
    aimFrameRef.current = { targets, width: cw, height: ch, zoom: aimZoom, shoot };
    // dev: how long this frame's aiming took (ms), for checking it stays smooth
    if (import.meta.env.DEV && !doorPreview) Object.assign(window, { __voidcrewAimCost: performance.now() - startedAt });
  }

  // The party's cover against each hostile actor near enough to shoot:
  // rays from its middle to points on the party's body (a column of
  // heights, a little to either side) - the share that gets through.
  let coverAt = 0;
  const coverFrom = new THREE.Vector3();
  const coverTo = new THREE.Vector3();
  function updatePartyCover(camX: number, floorY: number, camZ: number, eye: number) {
    if (!partyCoverRef || performance.now() - coverAt < PARTY_COVER_REFRESH_MS) return;
    coverAt = performance.now();
    const cover = partyCoverRef.current;
    cover.clear();
    for (const actor of actorsRef.current) {
      const entry = actorMeshes.get(actor.id);
      const type = ACTOR_TYPES[actor.type];
      if (!entry || actor.diedAt !== null || !actor.hostile) continue;
      coverFrom.copy(entry.mesh.position);
      const dx = camX - coverFrom.x;
      const dz = camZ - coverFrom.z;
      const len = Math.hypot(dx, dz);
      if (len > type.attackRange + 1.5 || len < 1e-3) continue;
      // sideways, across the line of fire
      const sx = -dz / len;
      const sz = dx / len;
      let open = 0;
      let total = 0;
      for (const h of PARTY_BODY_HEIGHTS) {
        for (const side of [-PARTY_BODY_HALF_WIDTH, PARTY_BODY_HALF_WIDTH]) {
          total++;
          coverTo.set(camX + sx * side, floorY + eye * h, camZ + sz * side);
          aimDir.copy(coverTo).sub(coverFrom);
          const dist = aimDir.length();
          aimRaycaster.set(coverFrom, aimDir.normalize());
          aimRaycaster.far = dist;
          const blocked = aimRaycaster
            .intersectObjects(objectsAlong(coverFrom, coverTo), true)
            .some((hit) => hit.object.userData.actorId === undefined && drawnChain(hit.object) && !seeThrough(hit.object));
          if (!blocked) open++;
        }
      }
      cover.set(actor.id, open / total);
    }
    if (import.meta.env.DEV && !doorPreview) Object.assign(window, { __voidcrewPartyCover: Object.fromEntries(cover) });
  }

  // a shot through a point of the view: the first thing it meets there
  // (an actor only where its sprite isn't transparent)
  function shoot(sx: number, sy: number): ShotResult {
    const cw = container.clientWidth || 1;
    const ch = container.clientHeight || 1;
    aimNdc.set((sx / cw) * 2 - 1, -((sy / ch) * 2 - 1));
    aimRaycaster.setFromCamera(aimNdc, camera);
    aimRaycaster.far = 40;
    for (const hit of aimRaycaster.intersectObjects(group.children, true)) {
      if (!drawnChain(hit.object) || seeThrough(hit.object)) continue;
      const id = hit.object.userData.actorId as number | undefined;
      if (id !== undefined) {
        const actor = actorsRef.current.find((a) => a.id === id);
        const entry = actorMeshes.get(id);
        // (a friendly one is no target: a shot goes through it)
        if (!actor || !entry || actor.diedAt !== null || actor.friendly || !hit.uv) continue;
        if (alphaAt(actor.type, hit.uv.x, hit.uv.y) < 128) continue;
        const type = ACTOR_TYPES[actor.type];
        const u = hit.uv.x * type.cols - entry.col;
        const v = (1 - hit.uv.y) * type.rows - entry.row;
        addTracer(hit.point);
        return { kind: "actor", actor: id, ...hitPart(actor.type, entry.col, u, v) };
      }
      addTracer(hit.point);
      return { kind: "miss", hit: isProp(hit.object) ? "prop" : "wall" };
    }
    addTracer(aimRaycaster.ray.at(8, aimVec).clone());
    return { kind: "miss", hit: "nothing" };
  }

  // a shot's trace: a bright line from below the camera to where it hit,
  // fading out
  const tracers: { line: THREE.Line; born: number }[] = [];
  function addTracer(to: THREE.Vector3) {
    const from = new THREE.Vector3(0.12, -0.16, -0.3).applyMatrix4(camera.matrixWorld);
    // the party's muzzle flash
    addFlash(from, PARTY_FLASH_COLOR, 2.5, 2.8, 90);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    tracers.push({ line, born: gameClock.now() });
  }
  function updateTracers() {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const { line, born } = tracers[i];
      const k = (gameClock.now() - born) / TRACER_MS;
      if (k < 1) {
        (line.material as THREE.LineBasicMaterial).opacity = 1 - k;
        continue;
      }
      scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      tracers.splice(i, 1);
    }
  }
  function dispose() {
    for (const { line } of tracers) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
  }

  return { updateAimFrame, updatePartyCover, updateTracers, dispose };
}
