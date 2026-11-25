import * as THREE from "three";
import { gameClock } from "../../game/clock";
import { ACTOR_TYPES, type ActorState } from "../../game/actors";
import { lightLevel } from "../../game/lightEffects";
import type { GameMap } from "../../game/types";
import { cellKey, visibleCells } from "../../game/visibility";
import { effectiveViewDistance } from "../graphics";
import { createLightReach, POOL_DECAY, POOL_DECAY_TAG, type LightGridUniforms } from "../lightGrid";
import type { ActorEntry } from "./actorRendering";
import { CAMERA_ALARM_LIGHT, CAMERA_WATCH_LIGHT } from "./constants";
import type { createMapLightState } from "./lightFixtures";
import { LIGHT_POOL_SIZE, LIGHT_FADE_SPAN, LIGHT_BEHIND_PENALTY, LIGHT_BEHIND_SLACK,
  LIGHT_KEEP_BIAS, LIGHT_SLOT_FADE, FIRE_LIGHT_INTENSITY, FIRE_LIGHT_RANGE, FIRE_LIGHT_LIFT, fireFlicker } from "./lighting";
import { smoothstep } from "./poses";
import type { ViewportSettings } from "./settings";
import type { createSmokeFire } from "./smokeFire";

export function createLightPool(deps: {
  map: GameMap;
  scene: THREE.Scene;
  settings: ViewportSettings;
  settingsRef: { readonly current: ViewportSettings };
  lightGrid: LightGridUniforms;
  wallHeight: number;
  lights: ReturnType<typeof createMapLightState>;
  getLiveMap: () => GameMap;
  openDoorsRef: { readonly current: ReadonlySet<string> };
  getActorMeshes: () => ReadonlyMap<number, ActorEntry>;
  smokeFire: Pick<ReturnType<typeof createSmokeFire>, "fireEmitters">;
  actorsRef: { readonly current: readonly ActorState[] };
  refreshSight: (party: { x: number; z: number }, range: number) => ReadonlySet<string>;
}) {
  const {
    map, scene, settings, settingsRef, lightGrid, wallHeight, lights,
    getLiveMap, openDoorsRef, getActorMeshes, smokeFire, actorsRef, refreshSight,
  } = deps;

  // (the graphics setting's size, at most LIGHT_POOL_SIZE - fixed for the
  // build: a new size is a new shader for every lit material, so it comes
  // with a rebuild rather than mid-game)
  const poolSize = Math.max(1, Math.min(LIGHT_POOL_SIZE, Math.round(settings.lightPool) || LIGHT_POOL_SIZE));
  const lightPool = Array.from({ length: poolSize }, (_, slot) => {
    // (its decay tags it as this slot's - see POOL_DECAY_TAG)
    const light = new THREE.PointLight(0xffffff, 0, 1, POOL_DECAY + (slot + 1) * POOL_DECAY_TAG);
    scene.add(light);
    // the source it serves (see poolSources), and how faded in; the reach
    // its bits in the reach texture were set for
    return { light, key: null as string | null, level: 0, reach: null as string | null };
  });
  // The pool's lights don't shine through walls: each lights only the
  // cells it can see (see lightGrid.ts, LightGridUniforms.reach) - worked
  // out once per light, place and set of open doors
  lightGrid.reach.value.dispose();
  lightGrid.reach.value = createLightReach(map.width, map.height);
  lightGrid.reachOn.value = 1;
  const reachCache = new Map<string, string[]>();
  const reachOf = (id: string, l: { x: number; z: number; range: number }, doors: ReadonlySet<string>) => {
    let cells = reachCache.get(id);
    if (!cells) {
      // (flashes come and go, each a source of its own: let it not grow)
      if (reachCache.size > 256) reachCache.clear();
      cells = [...visibleCells(getLiveMap(), l.x, l.z, Math.ceil(l.range), (k) => doors.has(k))];
      reachCache.set(id, cells);
    }
    return cells;
  };
  // the slots' bits redone whenever a slot's light (or its reach) changes
  function updateLightReach(sources: Map<string, { x: number; z: number; range: number }>) {
    // dev: __voidcrewNoReach = true in the console lets them through walls again, to compare
    lightGrid.reachOn.value = import.meta.env.DEV && (window as { __voidcrewNoReach?: boolean }).__voidcrewNoReach ? 0 : 1;
    const doors = openDoorsRef.current;
    const doorsKey = [...doors].sort().join(";");
    let changed = false;
    const ids = lightPool.map((slot) => {
      const l = slot.key ? sources.get(slot.key) : undefined;
      const id = l ? `${slot.key}|${Math.round(l.x * 100)},${Math.round(l.z * 100)},${l.range}|${doorsKey}` : null;
      if (id !== slot.reach) changed = true;
      return id;
    });
    if (!changed) return;
    const tex = lightGrid.reach.value;
    const bits = tex.image.data as Uint8Array;
    bits.fill(0);
    lightPool.forEach((slot, k) => {
      slot.reach = ids[k];
      const l = slot.key ? sources.get(slot.key) : undefined;
      if (!l || !ids[k]) return;
      for (const key of reachOf(ids[k]!, l, doors)) {
        const [x, y] = key.split(",").map(Number);
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) bits[y * map.width + x] |= 1 << k;
      }
    });
    tex.needsUpdate = true;
  }

  const litNear = (key: string, cells: ReadonlySet<string>) => {
    if (cells.has(key)) return true;
    const [x, y] = key.split(",").map(Number);
    return cells.has(cellKey(x + 1, y)) || cells.has(cellKey(x - 1, y)) || cells.has(cellKey(x, y + 1)) || cells.has(cellKey(x, y - 1));
  };

  // What the pool of real lights serves: in baked mode (see lightGrid.ts)
  // only the flashes - a shot, a spark; else the map's lights too. Each by
  // a key that stays the same while it does (a light edited elsewhere keeps
  // its slot).
  interface PoolSource {
    key: string;
    x: number;
    y: number;
    z: number;
    color: number;
    intensity: number;
    range: number;
    // the cell it lights (a map light counts only near the cells in sight)
    cell?: string;
    flash?: boolean;
  }
  const effectLevels = new Map<number, number>();
  function poolSources(baked: boolean, now: number): PoolSource[] {
    const list: PoolSource[] = [];
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const t = (now - f.start) / f.duration;
      if (t >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      list.push({ key: `flash ${f.id}`, x: f.x, y: f.y, z: f.z, color: f.color, intensity: f.intensity * (1 - t), range: f.range, flash: true });
    }
    // a camera's light on the crew: a steady yellow while it watches, a
    // pulsing red while it raises the alarm (just below its lens)
    for (const actor of actorsRef.current) {
      const type = ACTOR_TYPES[actor.type];
      const entry = getActorMeshes().get(actor.id);
      if (!type.watcher || actor.diedAt !== null || actor.dormant || !entry?.mesh.visible) continue;
      if (!actor.hostile && !actor.watching) continue;
      const alarm = actor.hostile;
      const p = entry.mesh.position;
      list.push({
        key: `camera ${actor.id}`,
        x: p.x,
        y: p.y - 0.08,
        z: p.z,
        color: alarm ? CAMERA_ALARM_LIGHT : CAMERA_WATCH_LIGHT,
        intensity: alarm ? 1.6 + 1.3 * Math.sin(now / 160) : 1.5,
        range: alarm ? 3 : 2.2,
        cell: cellKey(actor.cell.x, actor.cell.y),
      });
    }
    // the fires' flickering glow
    let fireIndex = 0;
    smokeFire.fireEmitters.forEach((e, i) => {
      const flickerIndex = fireIndex++;
      if (e.lightIntensity === 0) return;
      list.push({
        key: `fire ${i}`,
        x: e.x,
        y: e.y + FIRE_LIGHT_LIFT * wallHeight,
        z: e.z,
        color: e.lightColor,
        intensity: FIRE_LIGHT_INTENSITY * e.lightIntensity * Math.sqrt(e.size * e.density) * fireFlicker(now, flickerIndex),
        range: FIRE_LIGHT_RANGE * e.lightReach * Math.sqrt(e.size),
        cell: e.cell,
      });
    });
    // the map's lights (baked: only the unsteady ones), at their level now
    effectLevels.clear();
    lights.mapLights.forEach((l, i) => {
      if (baked && !l.effect) return;
      const level = l.effect ? lightLevel(l.effect, l.source * 7.13 + i, now / 1000) : 1;
      if (l.effect) effectLevels.set(i, level);
      list.push({
        key: `${l.kind} ${l.x} ${l.y} ${l.z}`,
        x: l.x,
        y: l.y * wallHeight,
        z: l.z,
        color: l.color,
        intensity: l.intensity * level,
        range: l.range,
        cell: lights.lightCells[i],
      });
    });
    // their panels with them
    for (const panel of lights.effectPanels.values()) panel.mat.emissiveIntensity = panel.base * Math.min(1.3, effectLevels.get(panel.light) ?? 1);
    return list;
  }
  // a short burst of light (world position; ms), e.g. a muzzle flash
  const flashes: { id: number; x: number; y: number; z: number; color: number; intensity: number; range: number; start: number; duration: number }[] = [];
  let flashIds = 0;
  function addFlash(at: THREE.Vector3, color: number, intensity: number, range: number, duration: number) {
    flashes.push({ id: flashIds++, x: at.x, y: at.y, z: at.z, color, intensity, range, start: gameClock.now(), duration });
  }

  function updateLightPool(
    party: { x: number; z: number },
    cam: { x: number; y: number; z: number; fwdX: number; fwdZ: number },
    intensityScale: number,
    dt: number,
  ) {
    const range = effectiveViewDistance(settingsRef.current);
    const fadeEnd = range;
    const fadeStart = range - LIGHT_FADE_SPAN;
    const sightCells = refreshSight(party, range);

    const sources = poolSources(lightGrid.scale.value > 0, gameClock.now());
    const score = (l: PoolSource) => {
      const dx = l.x - cam.x;
      const dz = l.z - cam.z;
      const dist = Math.hypot(dx, l.y - cam.y, dz);
      const along = dx * cam.fwdX + dz * cam.fwdZ;
      const ahead = along / (Math.hypot(dx, dz) || 1);
      // a flash first, whatever the rest
      const rank = l.flash ? -1 : dist + LIGHT_BEHIND_PENALTY * Math.max(0, -ahead) * dist;
      // (a light whose whole reach lies behind the eye lights nothing in
      // view: its slot goes to one ahead instead - a lit hall down the
      // corridor - with a little slack for the view tilting up or down)
      const behind = along < -(l.range + LIGHT_BEHIND_SLACK);
      return { dist, rank, behind };
    };
    const current = new Set(lightPool.map((slot) => slot.key));
    const ranked = sources
      .map((l) => ({ l, ...score(l) }))
      .filter((c) => c.dist < fadeEnd && !c.behind && (!c.l.cell || litNear(c.l.cell, sightCells)))
      .map((c) => ({ ...c, rank: current.has(c.l.key) && !c.l.flash ? c.rank * LIGHT_KEEP_BIAS : c.rank }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, poolSize);
    const wanted = new Map(ranked.map((c) => [c.l.key, c]));

    // slots keep their source while it's wanted; freed slots fade out
    // before taking a new one (a flash takes one at once)
    const unassigned = ranked.filter((c) => !lightPool.some((slot) => slot.key === c.l.key));
    for (const slot of lightPool) {
      const keep = wanted.get(slot.key ?? "");
      if (!keep && unassigned.length && (slot.level <= 0 || unassigned[0].l.flash)) {
        slot.key = unassigned.shift()!.l.key;
        if (wanted.get(slot.key)?.l.flash) slot.level = 1;
      }
      const target = wanted.get(slot.key ?? "");
      slot.level = Math.min(1, Math.max(0, slot.level + (target ? 1 : -1) * LIGHT_SLOT_FADE * dt));
      if (!target) {
        if (slot.level <= 0) slot.key = null;
        slot.light.intensity = slot.level > 0 ? slot.light.intensity * 0.9 : 0;
        continue;
      }
      const l = target.l;
      slot.light.color.setHex(l.color);
      slot.light.position.set(l.x, l.y, l.z);
      slot.light.distance = l.range;
      const scale = l.flash ? 1 : intensityScale;
      slot.light.intensity = l.intensity * scale * slot.level * (1 - smoothstep(fadeStart, fadeEnd, target.dist));
    }
    // (a slot fading out keeps the reach of the light it last had)
    const placed = new Map<string, PoolSource>(sources.map((l) => [l.key, l]));
    for (const slot of lightPool) {
      if (slot.key && !placed.has(slot.key)) {
        const p = slot.light.position;
        placed.set(slot.key, { key: slot.key, x: p.x, y: p.y, z: p.z, color: 0, intensity: 0, range: slot.light.distance });
      }
    }
    updateLightReach(placed);
  }

  return { addFlash, updateLightPool };
}
