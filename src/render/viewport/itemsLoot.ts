import * as THREE from "three";
import { gameClock } from "../../game/clock";
import { itemSpot, isSharedPickupId, type LootSpill } from "../../game/items";
import { PROP_RELIEF_SCALE } from "../../game/props";
import type { GameMap } from "../../game/types";
import { cellKey } from "../../game/visibility";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import type { loadHeightGrid } from "../reliefMesh";
import { pickupTexture, sharedImage } from "../sharedImages";
import type { TextureSetFiles } from "../textureSets";
import type { GameViewportProps } from "./contracts";
import { ITEM_HEIGHT, ITEM_LIFT, ITEM_GLOW, ITEM_NORMAL_KEEP, ITEM_NORMAL_BEND, SPILL_OUT_MS, SPILL_REST_MS, SPILL_IN_MS } from "./loot";
import type { SceneCache } from "./sceneCache";
import { kitMaterials, type WallKit } from "./walls";

interface ItemsLootContext {
  group: THREE.Group;
  map: GameMap;
  getLatestMap(): GameMap;
  lootRef: { readonly current: Pick<GameViewportProps, "lootedProps" | "takenItems" | "spills"> };
  getVisibleCells(): ReadonlySet<string>;
  draggedWorldItem(): number | null;
  markLooted(looted: ReadonlySet<number> | undefined): void;
  isDisposed(): boolean;
  track<T>(work: Promise<T> | (() => Promise<T>)): Promise<T>;
  geometries: THREE.BufferGeometry[];
  grids: SceneCache["grids"];
  sharedPropKitFor(setId: string, paths?: TextureSetFiles): WallKit;
  loadWithRetry(url: string, attempts: number): ReturnType<typeof loadHeightGrid>;
  buildPropRelief(kit: WallKit, shape: { width: number; height: number; flushEdges: boolean; depth: number }, cells: number):
    Promise<{ geometry: THREE.BufferGeometry } | null>;
  lightGrid: LightGridUniforms;
  propReliefDepth: number;
  wallHeight: number;
  floorY(x: number, z: number): number;
}

export function createItemsLoot(ctx: ItemsLootContext) {
  const {
    group, map, getLatestMap, lootRef, getVisibleCells, draggedWorldItem, markLooted, isDisposed, track,
    geometries, grids, sharedPropKitFor, loadWithRetry, buildPropRelief, lightGrid, propReliefDepth, wallHeight, floorY,
  } = ctx;

  // ---- loot ----
  // An item's sprite: an upright relief cutout of its art, standing on
  // its bottom edge, turned to the camera each frame (see updateLoot).
  const itemTemplates = new Map<string, Promise<THREE.Group | null>>();
  function itemTemplate(id: string): Promise<THREE.Group | null> {
    let made = itemTemplates.get(id);
    if (!made) {
      made = (async () => {
        const pickup = sharedImage(id)?.pickup;
        if (isSharedPickupId(id) && !pickup) return null;
        const kit = sharedPropKitFor(`item_${id}`, pickup ? pickupTexture(id) : undefined);
        let gridPromise = grids.get(kit.depthUrl);
        if (!gridPromise) {
          gridPromise = loadWithRetry(kit.depthUrl, 4);
          grids.set(kit.depthUrl, gridPromise);
        }
        const grid = await gridPromise;
        const h = pickup?.height ?? ITEM_HEIGHT;
        const w = (h * grid.width) / grid.height;
        const relief = await buildPropRelief(kit, { width: w, height: h, flushEdges: false, depth: propReliefDepth * PROP_RELIEF_SCALE * 0.6 }, 24);
        if (!relief) return null;
        for (const mat of kitMaterials(kit)) useLightGrid(mat, lightGrid);
        // a faint glow of their own: loot reads even in a dark room
        kit.wallMat.emissiveMap = kit.wallMat.map;
        kit.wallMat.emissive.setHex(0xffffff);
        kit.wallMat.emissiveIntensity = pickup?.glow ?? ITEM_GLOW;
        kit.wallMat.needsUpdate = true;
        // Its normals bent up (and a little back): turned to the camera
        // whichever way it's seen, it would take only the light from the
        // viewer's side - bent, the lamps above and beyond it light it too.
        const geometry = relief.geometry.clone();
        const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
        const n = new THREE.Vector3();
        for (let i = 0; i < normals.count; i++) {
          n.fromBufferAttribute(normals, i).multiplyScalar(ITEM_NORMAL_KEEP).add(ITEM_NORMAL_BEND).normalize();
          normals.setXYZ(i, n.x, n.y, n.z);
        }
        normals.needsUpdate = true;
        geometries.push(geometry);
        const template = new THREE.Group();
        const mesh = new THREE.Mesh(geometry, [kit.wallMat, kit.sideMat]);
        mesh.position.y = h / 2;
        template.add(mesh);
        return template;
      })();
      itemTemplates.set(id, made);
    }
    return made;
  }
  // the loose items, by index in map.items; and what's flying (spilled
  // out of a container, or drawn in to the party's feet)
  // (`toss`: an item the party has just dropped, flying from its hands to where it lies)
  const looseItems = new Map<number, { obj: THREE.Object3D; cell: string; taken: boolean; toss?: { start: number; from?: THREE.Vector3; rest: THREE.Vector3 } }>();
  interface Flyer {
    obj: THREE.Object3D;
    from: THREE.Vector3;
    rest: THREE.Vector3;
    start: number;
  }
  const flyers: Flyer[] = [];
  // (built again, in place, when the map's items change - see applyLightsRef)
  let itemsVersion = 0;
  // the newest item the party dropped that has been shown (a build later does not toss it again)
  let lastDrop = Math.max(-1, ...(getLatestMap().items ?? []).map((i) => i.dropped ?? -1));
  function buildItems(m: GameMap) {
    const version = ++itemsVersion;
    (m.items ?? []).forEach((spec, index) => {
      // (a dropped item that is new tosses from the party's hands; see updateLoot)
      const tossed = spec.dropped !== undefined && spec.dropped > lastDrop;
      if (tossed) lastDrop = spec.dropped!;
      track(async () => {
        const template = await itemTemplate(spec.item);
        if (!template || isDisposed() || version !== itemsVersion) return;
        const [dx, dz] = itemSpot(spec.offset, index);
        const obj = template.clone();
        obj.position.set(spec.cell.x + dx, floorY(spec.cell.x, spec.cell.y) + (spec.elevation ?? 0) * wallHeight + ITEM_LIFT, spec.cell.y + dz);
        obj.userData.item = true;
        // the editor picks it by this
        obj.userData.itemIndex = index;
        obj.visible = false;
        group.add(obj);
        // (one taken before this build - a deck entered again, items changed in place - is not drawn in again)
        looseItems.set(index, {
          obj,
          cell: cellKey(spec.cell.x, spec.cell.y),
          taken: !!lootRef.current.takenItems?.has(index),
          // (real time: the game's clock stands still while the inventory is open, which is where an item is dropped from)
          toss: tossed ? { start: performance.now(), rest: obj.position.clone() } : undefined,
        });
      }).catch((err) => console.error("Item build failed:", err));
    });
  }
  function clearItems() {
    itemsVersion++;
    for (const it of looseItems.values()) group.remove(it.obj);
    looseItems.clear();
  }
  buildItems(map);
  // spills already shown (before this build) aren't shown again
  let lastSpill = Math.max(0, ...(lootRef.current.spills ?? []).map((s) => s.id));
  async function spill(event: LootSpill) {
    const now = gameClock.now();
    const from = new THREE.Vector3(event.from.x, event.from.y * wallHeight, event.from.z);
    const cx = Math.round(event.from.x);
    const cz = Math.round(event.from.z);
    let n = 0;
    for (const stack of event.items) {
      const template = await itemTemplate(stack.item);
      if (!template || isDisposed()) continue;
      for (let k = 0; k < Math.min(stack.count, 3); k++, n++) {
        const obj = template.clone();
        obj.userData.item = true;
        const a = Math.random() * Math.PI * 2;
        const r = 0.15 + Math.random() * 0.2;
        const clamp = (v: number, c: number) => Math.min(c + 0.4, Math.max(c - 0.4, v));
        const rest = new THREE.Vector3(
          clamp(from.x + Math.cos(a) * r, cx),
          event.floorY * wallHeight + ITEM_LIFT,
          clamp(from.z + Math.sin(a) * r, cz),
        );
        obj.position.copy(from);
        group.add(obj);
        // one after another, a little apart
        flyers.push({ obj, from: from.clone(), rest, start: now + n * 60 });
      }
    }
  }

  // the loot's sprites: the loose ones turned to the camera (shown while
  // in sight and not taken), new spills let out, the flyers moved
  function updateLoot(camX: number, camZ: number, feetY: number) {
    const now = gameClock.now();
    const loot = lootRef.current;
    markLooted(loot.lootedProps);
    for (const event of loot.spills ?? []) {
      if (event.id <= lastSpill) continue;
      lastSpill = event.id;
      spill(event).catch((err) => console.error("Spill failed:", err));
    }
    for (const [index, item] of looseItems) {
      if (!item.taken && loot.takenItems?.has(index)) {
        // taken: drawn in from where it lies
        item.taken = true;
        flyers.push({ obj: item.obj, from: item.obj.position.clone(), rest: item.obj.position.clone(), start: now - SPILL_REST_MS });
      }
      if (item.taken) continue;
      if (item.toss) {
        // just dropped: out of the party's hands to where it lies, in a little arc (as a spill's items fly)
        const toss = item.toss;
        toss.from ??= new THREE.Vector3(camX, feetY + ITEM_LIFT + 0.35 * wallHeight, camZ);
        const p = (performance.now() - toss.start) / SPILL_OUT_MS;
        if (p >= 1) {
          item.obj.position.copy(toss.rest);
          item.toss = undefined;
        } else {
          const q = Math.max(0, p);
          item.obj.position.lerpVectors(toss.from, toss.rest, q);
          item.obj.position.y += Math.sin(q * Math.PI) * 0.18;
        }
      }
      // (not the one being dragged to the screen's hands and backpack - see slotDrag's beginWorldDrag)
      item.obj.visible = getVisibleCells().has(item.cell) && draggedWorldItem() !== index;
      item.obj.rotation.y = Math.atan2(camX - item.obj.position.x, camZ - item.obj.position.z);
    }
    const feet = new THREE.Vector3(camX, feetY + ITEM_LIFT, camZ);
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      const t = now - f.start;
      const obj = f.obj;
      if (t < 0) {
        obj.visible = false;
        continue;
      }
      obj.visible = true;
      obj.rotation.y = Math.atan2(camX - obj.position.x, camZ - obj.position.z);
      if (t < SPILL_OUT_MS) {
        // out of the container in a little arc
        const p = t / SPILL_OUT_MS;
        obj.position.lerpVectors(f.from, f.rest, p);
        obj.position.y += Math.sin(p * Math.PI) * 0.18;
      } else if (t < SPILL_REST_MS) {
        obj.position.copy(f.rest);
      } else if (t < SPILL_REST_MS + SPILL_IN_MS) {
        // drawn in to the party's feet, shrinking
        const q = (t - SPILL_REST_MS) / SPILL_IN_MS;
        obj.position.lerpVectors(f.rest, feet, q * q);
        obj.scale.setScalar(1 - 0.7 * q);
      } else {
        obj.visible = false;
        group.remove(obj);
        flyers.splice(i, 1);
      }
    }
  }

  function hideItems() {
    for (const item of looseItems.values()) item.obj.visible = false;
    for (const f of flyers) f.obj.visible = false;
  }

  return { buildItems, clearItems, updateLoot, hideItems, looseItems };
}
