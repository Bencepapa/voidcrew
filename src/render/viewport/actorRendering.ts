import * as THREE from "three";
import { ACTOR_TYPES, BODY_PARTS, actorHeight, type ActorState } from "../../game/actors";
import type { Weapon } from "../../game/combat";
import { gameClock } from "../../game/clock";
import { DIR_VECTOR } from "../../game/movement";

import { actorView } from "../../game/actorSheets";
import type { GameMap } from "../../game/types";
import { cellKey } from "../../game/visibility";
import { actorOffsets } from "../actorOffsets";
import { actorSheetFiles } from "../actorSheetFiles";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import type { SmokeBody } from "../smoke";
import { ACTOR_FLASH_MS, ACTOR_FADE_MS, ACTOR_SHOOT_POSE_MS, ACTOR_DIE_FRAME_MS,
  ACTOR_SHOOT_FRAME_MS, ACTOR_HIT_POSE_MS, ACTOR_FLASH, GLOW_COLORS, MAX_CRIT_ZONES,
  highlightMaterial, type PartHighlight } from "./actors";
import type { AimFocus } from "./contracts";
import { lerp } from "./poses";
import type { ViewportSettings } from "./settings";

// each actor's quad, its own copy of its type's material (for the hit
// flash and the death fade) and the sheet cell it shows
export interface ActorEntry {
  // the actor type it was made for (another one with its id: made anew)
  type: string;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  // its soft shadow under it (on the ceiling for one hung up there)
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  // the part highlight's uniforms (see highlightMaterial)
  highlight: PartHighlight;
  uvKey: string;
  col: number;
  row: number;
  mirror: boolean;
  // when it last fired (to flash each new shot)
  lastAttack: number;
  // the height its quad is made at (it's made anew when the type's size changes)
  h: number;
}

export function createActorRendering(deps: {
  map: GameMap;
  group: THREE.Group;
  wallHeight: number;
  reliefDepth: number;
  lightGrid: LightGridUniforms;
  smokeBodies: SmokeBody[];
  bust: string;
  busted: (url: string) => string;
  kitTexture: (url: string) => THREE.Texture;
  textures: Map<string, THREE.Texture>;
  markSprite: (mat: THREE.MeshStandardMaterial, normalStrength: number, normalMap?: THREE.Texture) => void;
  ceilingY: (x: number, y: number) => number;
  getSightCells: () => ReadonlySet<string>;
  isDisposed: () => boolean;
  isReady: () => boolean;
  afterReady: (() => void)[];
  liveRef: { readonly current: { x: number; z: number } };
  aimFocusRef: { readonly current: AimFocus | null };
  aimingRef: { readonly current: Weapon | null };
  settingsRef: { readonly current: ViewportSettings };
  actorsRef: { readonly current: readonly ActorState[] };
  addFlash: (at: THREE.Vector3, color: number, intensity: number, range: number, duration: number) => void;
}) {
  const {
    map, group, wallHeight, reliefDepth, lightGrid, smokeBodies, bust,
    busted, kitTexture, textures, markSprite, ceilingY, getSightCells, isDisposed,
    isReady, afterReady, liveRef, aimFocusRef, aimingRef, settingsRef, actorsRef,
    addFlash,
  } = deps;

  // Actors are Doom-style sprites: an upright quad turned to face the
  // camera, showing the sheet cell for its pose (standing, or the walk
  // cycle while stepping) and for the angle it's seen from - front, 45,
  // 90 and 135 degrees round to its left, or back; seen from its right,
  // the left views mirrored. The sheet's normal map lights it like the
  // walls, so a passing lamp shades it.
  const actorMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const actorMeshes = new Map<number, ActorEntry>();
  const flashAt = new THREE.Vector3();
  // Each actor type's glow map (see ActorType.glow): its sheet's bright
  // red pixels within the glowing weak spots of each cell, in their own
  // color, black elsewhere. Made once its sheet has loaded.
  // Its sheet's own emissive.png if there's one (npm run actors:emissive
  // writes it; it can be painted by hand) - else worked out here.
  const glowMaps = new Map<string, THREE.Texture | null>();
  const glowMissing = new Set<string>();
  const glowLoader = new THREE.TextureLoader();
  const glowMapOf = (typeName: string): THREE.Texture | null => {
    if (glowMaps.has(typeName)) return glowMaps.get(typeName)!;
    const type = ACTOR_TYPES[typeName];
    if (!type.glow) return null;
    if (!glowMissing.has(typeName)) {
      const baked = glowLoader.load(`${import.meta.env.BASE_URL}actors/${type.sheet}/emissive.png${bust}`, undefined, undefined, () => {
        // no such file: made from the sheet instead (below)
        baked.dispose();
        glowMissing.add(typeName);
        glowMaps.delete(typeName);
      });
      baked.colorSpace = THREE.SRGBColorSpace;
      baked.magFilter = THREE.NearestFilter;
      glowMaps.set(typeName, baked);
      return baked;
    }
    const image = actorMaterial(typeName).map?.image as HTMLImageElement | undefined;
    if (!image?.width) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const src = ctx.getImageData(0, 0, image.width, image.height);
    const out = ctx.createImageData(image.width, image.height);
    const cw = image.width / type.cols;
    const ch = image.height / type.rows;
    // where it glows, per sheet column: its glowing weak spots' zones and
    // its own - or, with neither, the whole cell
    const glow = type.glow;
    const glowing = type.crits.filter((c) => glow.crits?.includes(c.label));
    const zonesOf = (col: number): [number, number, number, number][] => {
      const zones = [...glowing.flatMap((c) => c.zones[col] ?? []), ...(glow.zones?.[col] ?? [])];
      return glow.crits || glow.zones ? zones : [[0, 0, 1, 1]];
    };
    const shines = GLOW_COLORS[glow.color ?? "red"];
    for (let row = 0; row < type.rows; row++) {
      for (let col = 0; col < type.cols; col++) {
        {
          for (const [x0, y0, x1, y1] of zonesOf(col)) {
            // a little past the zone: its glow's edge
            const px0 = Math.max(0, Math.floor((col + x0 - 0.02) * cw));
            const px1 = Math.min(image.width, Math.ceil((col + x1 + 0.02) * cw));
            const py0 = Math.max(0, Math.floor((row + y0 - 0.02) * ch));
            const py1 = Math.min(image.height, Math.ceil((row + y1 + 0.02) * ch));
            for (let y = py0; y < py1; y++) {
              for (let x = px0; x < px1; x++) {
                const i = (y * image.width + x) * 4;
                const [r, g, b, a] = [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
                if (a < 128 || !shines(r, g, b)) continue;
                out.data[i] = r;
                out.data[i + 1] = g;
                out.data[i + 2] = b;
                out.data[i + 3] = 255;
              }
            }
          }
        }
      }
    }
    ctx.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    glowMaps.set(typeName, tex);
    return tex;
  };
  // The actors' normal maps are the biggest files of a deck (1-3 MB each): the scene does not wait
  // for them. They load on their own (outside the loading manager) and are put on the actors'
  // materials - the one of the type and its clones, one for each actor in the scene - when they
  // arrive; till then the actors are lit flat.
  const actorNormals = new Map<string, { texture: THREE.Texture; materials: Set<THREE.MeshStandardMaterial> }>();
  const actorMaterial = (typeName: string) => {
    let mat = actorMaterials.get(typeName);
    if (!mat) {
      const type = ACTOR_TYPES[typeName];
      const files = actorSheetFiles(type);
      const diffuse = kitTexture(busted(files.diffuse));
      const normalUrl = files.normal && busted(files.normal);
      let normalMap = normalUrl ? textures.get(normalUrl) : undefined;
      const materials = new Set<THREE.MeshStandardMaterial>();
      if (normalUrl && !normalMap) {
        // (the texture is there at once, its image comes later; the request itself waits for the scene to be shown)
        const texture = new THREE.Texture();
        normalMap = texture;
        textures.set(normalUrl, texture);
        const start = () => {
          new THREE.ImageLoader().load(normalUrl, (image) => {
            if (isDisposed()) return;
            texture.image = image;
            texture.needsUpdate = true;
            for (const m of materials) {
              m.normalMap = texture;
              m.needsUpdate = true;
            }
          });
        };
        if (isReady()) start();
        else afterReady.push(start);
      }
      if (normalMap) {
        actorNormals.set(typeName, { texture: normalMap, materials });
        normalMap.magFilter = THREE.NearestFilter;
      }
      diffuse.colorSpace = THREE.SRGBColorSpace;
      diffuse.magFilter = THREE.NearestFilter;
      // (already in, from an earlier build of the scene: on at once)
      mat = new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normalMap?.image ? normalMap : null, alphaTest: 0.5, roughness: 0.6, metalness: 0.35 });
      materials.add(mat);
      // (its sheet's own normal strength - set in the actor editor)
      const normal = actorOffsets(type.sheet)?.normal ?? 1;
      mat.normalScale.set(normal, normal);
      markSprite(mat, normal, normalMap);
      actorMaterials.set(typeName, mat);
    }
    return mat;
  };
  for (const name of new Set((map.actors ?? []).map(a => a.actor))) if (ACTOR_TYPES[name]) actorMaterial(name);
  // the actors' soft shadows: a dark blot fading out to its rim
  const shadowTexture = (() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.55, "rgba(0,0,0,0.85)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ACTOR_SHADOW = 0.9;

  function removeActorMesh(id: number) {
    const entry = actorMeshes.get(id);
    if (!entry) return;
    group.remove(entry.mesh);
    group.remove(entry.shadow);
    entry.mesh.geometry.dispose();
    entry.material.dispose();
    entry.shadow.material.dispose();
    actorMeshes.delete(id);
  }


  function updateActors(camX: number, camZ: number) {
    const now = gameClock.now();
    const current = actorsRef.current;
    smokeBodies.length = 0;
    for (const id of [...actorMeshes.keys()]) {
      if (!current.some((a) => a.id === id)) removeActorMesh(id);
    }
    for (const actor of current) {
      const type = ACTOR_TYPES[actor.type];
      const h = actorHeight(actor.type) * wallHeight;
      let entry = actorMeshes.get(actor.id);
      if (entry && entry.type !== actor.type) {
        removeActorMesh(actor.id);
        entry = undefined;
      }
      if (!entry) {
        const material = actorMaterial(actor.type).clone();
        // (its type's normal map, if it is not in yet, is put on it too when it comes)
        const late = actorNormals.get(actor.type);
        if (late) late.materials.add(material);
        const highlight = highlightMaterial(material);
        useLightGrid(material, lightGrid);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * type.cellAspect, h), material);
        mesh.userData.actor = true;
        mesh.userData.actorId = actor.id;
        const shadow = new THREE.Mesh(
          shadowGeo,
          new THREE.MeshBasicMaterial({
            map: shadowTexture,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          }),
        );
        // (nothing to aim at or hide behind)
        shadow.raycast = () => {};
        entry = { type: actor.type, mesh, material, shadow, highlight, uvKey: "", col: 0, row: 0, mirror: false, lastAttack: actor.lastAttack, h };
        actorMeshes.set(actor.id, entry);
        group.add(mesh, shadow);
      } else if (Math.abs(entry.h - h) > 1e-6) {
        // (its type's size was changed in the Asset Manager: the quad follows, and the hit tests with it)
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = new THREE.PlaneGeometry(h * type.cellAspect, h);
        entry.h = h;
        entry.uvKey = "";
      }
      const t = Math.min(1, Math.max(0, (now - actor.moveStart) / actor.moveMs));
      const x = lerp(actor.from.x, actor.cell.x, t);
      const z = lerp(actor.from.y, actor.cell.y, t);
      const y = lerp(actor.fromY, actor.y, t) * wallHeight;
      const mesh = entry.mesh;
      // dead: it falls (its sheet's dying rows) and its wreck stays - or,
      // without them, it fades out
      const sinceDeath = actor.diedAt !== null ? now - actor.diedAt : -1;
      const falls = type.dieRows !== undefined && type.wreckRow !== undefined;
      const dead = sinceDeath >= 0 && !falls ? sinceDeath / ACTOR_FADE_MS : 0;
      if (dead < 1) smokeBodies.push({ x, z, bottom: y, top: y + h });
      mesh.visible =
        dead < 1 &&
        !actor.inVentUntil &&
        (getSightCells().has(cellKey(actor.cell.x, actor.cell.y)) || getSightCells().has(cellKey(actor.from.x, actor.from.y)));
      // a crawler keeps to the ceiling (upside down) - but on the crew in
      // its cell it drops to the floor; dead, it falls
      const partyCell = { x: Math.round(liveRef.current.x), y: Math.round(liveRef.current.z) };
      const onCeiling =
        !!type.crawler && actor.diedAt === null && !(actor.hostile && actor.cell.x === partyCell.x && actor.cell.y === partyCell.y);
      // hit: a red flash; dead: it fades out
      const flash = Math.max(0, 1 - (now - actor.hitAt) / ACTOR_FLASH_MS);
      entry.material.emissive.setRGB(flash * 0.9, flash * 0.12, flash * 0.05);
      // (a dormant NPC - one that appears when triggered - is shown faded while editing)
      entry.material.transparent = dead > 0 || !!actor.ghost;
      entry.material.opacity = (1 - Math.min(1, dead)) * (actor.ghost ? 0.4 : 1);
      const yaw = Math.atan2(camX - x, camZ - z);
      mesh.rotation.y = yaw;

      // the angle it's seen from: 0 in front, + round to its left
      // (a fixture with the crew in its eye looks right at it)
      const look = actor.lookAt && (actor.lookAt.x !== actor.cell.x || actor.lookAt.y !== actor.cell.y) ? actor.lookAt : null;
      const lookLen = look ? Math.hypot(look.x - actor.cell.x, look.y - actor.cell.y) : 1;
      const f = look ? { x: (look.x - actor.cell.x) / lookLen, y: (look.y - actor.cell.y) / lookLen } : DIR_VECTOR[actor.facing];
      const cx = camX - x;
      const cz = camZ - z;
      const angle = Math.atan2(cx * f.y - cz * f.x, cx * f.x + cz * f.y);
      const { col, mirror } = actorView(type, angle);
      // (one that leaps: pushing off, in the air, landing)
      const hopRow = (k: number) => (k < 0.2 ? type.hop!.takeoffRow : k < 0.85 ? type.hop!.airRow : type.idleRow);
      let row = t < 1 ? (type.hop ? hopRow(t) : type.walkRows[Math.floor(t * type.walkRows.length) % type.walkRows.length]) : type.idleRow;
      if (sinceDeath >= 0 && falls) {
        const frame = Math.floor(sinceDeath / ACTOR_DIE_FRAME_MS);
        row = frame < type.dieRows!.length ? type.dieRows![frame] : type.wreckRow!;
      } else if (actor.playingDead && type.wreckRow !== undefined) {
        // lying still as if dead
        row = type.wreckRow;
      } else if (type.hitRow !== undefined && now - actor.hitAt < ACTOR_HIT_POSE_MS) {
        row = type.hitRow;
      } else if (type.shootRows && now - actor.lastAttack < ACTOR_SHOOT_POSE_MS) {
        // (its firing rows in turn: the chaingun spinning)
        row = type.shootRows[Math.floor(now / ACTOR_SHOOT_FRAME_MS) % type.shootRows.length];
      } else if (type.watcher && actor.diedAt === null) {
        // a camera's light: red raising the alarm, amber watching the crew
        row = actor.hostile ? type.watcher.alarmRow : actor.watching ? type.watcher.watchRow : type.idleRow;
      } else if (type.shootRow !== undefined && now - actor.lastAttack < ACTOR_SHOOT_POSE_MS) {
        row = type.shootRow;
      }
      // a new shot: its muzzle flash, at its chest - or a hung turret's
      // barrels (a camera only calls it in: no flash)
      if (actor.lastAttack !== entry.lastAttack) {
        if (actor.lastAttack > entry.lastAttack && !type.watcher && !type.melee) {
          flashAt.set(x, type.ceiling ? ceilingY(actor.cell.x, actor.cell.y) - h * 0.75 : y + h * 0.55, z);
          addFlash(flashAt, ACTOR_FLASH.color, ACTOR_FLASH.intensity, ACTOR_FLASH.range, ACTOR_FLASH.duration);
        }
        entry.lastAttack = actor.lastAttack;
      }
      entry.col = col;
      entry.row = row;
      entry.mirror = mirror;
      // the picked part's pixels light up (see highlightMaterial)
      const focus = aimFocusRef.current;
      const lit = aimingRef.current && focus?.target === actor.id && focus.part ? focus.part : null;
      entry.highlight.part.value = lit ? BODY_PARTS.indexOf(lit) : -1;
      entry.highlight.outline.value = settingsRef.current.enemyScanner && actor.diedAt === null && !actor.friendly ? 1 : 0;
      // its optics and vents glow - flickering while stunned, out once dead
      const glowMap = type.glow ? glowMapOf(actor.type) : null;
      if (glowMap && entry.highlight.glowMap.value !== glowMap) entry.highlight.glowMap.value = glowMap;
      const stunned = now < actor.stunnedUntil;
      entry.highlight.glow.value =
        !glowMap || actor.diedAt !== null ? 0 : (type.glow?.intensity ?? 0) * (stunned ? (Math.random() < 0.5 ? 0.15 : 0.8) : 1);
      const sheetImage = entry.material.map?.image as HTMLImageElement | undefined;
      if (sheetImage?.width) entry.highlight.texel.value.set(1 / sheetImage.width, 1 / sheetImage.height);
      if (lit) {
        BODY_PARTS.forEach((part, i) => {
          const [x0, y0, x1, y1] = type.parts[part].zone;
          entry!.highlight.zones.value[i].set(
            (col + x0) / type.cols,
            1 - (row + y0) / type.rows,
            (col + x1) / type.cols,
            1 - (row + y1) / type.rows,
          );
        });
        let n = 0;
        for (const crit of type.crits) {
          for (const [x0, y0, x1, y1] of crit.zones[col] ?? []) {
            if (n >= MAX_CRIT_ZONES) break;
            entry.highlight.crits.value[n].set(
              (col + x0) / type.cols,
              1 - (row + y0) / type.rows,
              (col + x1) / type.cols,
              1 - (row + y1) / type.rows,
            );
            entry.highlight.critParts.value[n++] = BODY_PARTS.indexOf(crit.part);
          }
        }
        entry.highlight.critCount.value = n;
        const image = entry.material.map?.image as HTMLImageElement | undefined;
        if (image?.width) entry.highlight.texel.value.set(1 / image.width, 1 / image.height);
      }

      // the frame's placement fix (see actorOffsets), mirrored with it
      const fix = actorOffsets(type.sheet);
      const [dx, dy] = fix?.offsets[row * type.cols + col] ?? [0, 0];
      const px = fix ? h / fix.cell[1] : 0;
      const shift = (mirror ? -dx : dx) * px;
      // (hung from the ceiling: its top against it - a crawler there too;
      // one that leaps arcs up (on the ceiling: down) on its way)
      const arc = type.hop && t < 1 && actor.diedAt === null ? Math.sin(Math.PI * t) * type.hop.height * wallHeight : 0;
      const centerY =
        type.ceiling || onCeiling ? ceilingY(actor.cell.x, actor.cell.y) - h / 2 - arc : y + h / 2 + arc;
      mesh.position.set(x + Math.cos(yaw) * shift, centerY - dy * px, z - Math.sin(yaw) * shift);
      // its shadow: on the floor under it - or on the ceiling over one up
      // there; smaller and fainter the further it leaps off; a wreck's
      // wider, flatter
      const up = type.ceiling || onCeiling;
      const shadow = entry.shadow;
      shadow.visible = mesh.visible;
      const lift = 1 - Math.min(0.7, arc / wallHeight / 0.5);
      const spread = Math.min(0.9, h * type.cellAspect * (up ? 0.6 : 0.55)) * (actor.diedAt !== null || actor.playingDead ? 1.25 : 1);
      shadow.scale.set(spread * lift, 1, spread * lift);
      shadow.rotation.x = up ? Math.PI : 0;
      // (over the floor's relief, like the exit marker)
      shadow.position.set(x, up ? ceilingY(actor.cell.x, actor.cell.y) - reliefDepth - 0.006 : y + reliefDepth + 0.006, z);
      shadow.material.opacity = ACTOR_SHADOW * lift * (1 - Math.min(1, dead));

      const uvKey = `${col},${row},${mirror},${onCeiling}`;
      if (uvKey === entry.uvKey) continue;
      entry.uvKey = uvKey;
      let u0 = col / type.cols;
      let u1 = (col + 1) / type.cols;
      if (mirror) [u0, u1] = [u1, u0];
      let v0 = 1 - (row + 1) / type.rows;
      let v1 = 1 - row / type.rows;
      // (upside down on the ceiling)
      if (onCeiling) [v0, v1] = [v1, v0];
      const uv = mesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
      uv.setXY(0, u0, v1);
      uv.setXY(1, u1, v1);
      uv.setXY(2, u0, v0);
      uv.setXY(3, u1, v0);
      uv.needsUpdate = true;
    }
  }
  // each actor type's sheet alpha, to let shots through its transparent
  // pixels
  const sheetAlpha = new Map<string, { data: Uint8ClampedArray; width: number; height: number } | null>();
  function alphaAt(typeName: string, u: number, v: number): number {
    if (!sheetAlpha.has(typeName)) {
      const image = actorMaterial(typeName).map?.image as HTMLImageElement | undefined;
      if (!image?.width) return 255;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      sheetAlpha.set(typeName, { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height });
    }
    const sheet = sheetAlpha.get(typeName);
    if (!sheet) return 255;
    const x = Math.min(sheet.width - 1, Math.max(0, Math.floor(u * sheet.width)));
    const y = Math.min(sheet.height - 1, Math.max(0, Math.floor((1 - v) * sheet.height)));
    return sheet.data[(y * sheet.width + x) * 4 + 3];
  }
  function dispose() {
    for (const id of [...actorMeshes.keys()]) removeActorMesh(id);
    for (const mat of actorMaterials.values()) mat.dispose();
    for (const tex of glowMaps.values()) tex?.dispose();
  }

  return { actorMeshes, updateActors, alphaAt, dispose };
}
