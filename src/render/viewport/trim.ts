import * as THREE from "three";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH } from "../../game/heights";
import { DIR_VECTOR } from "../../game/movement";
import type { GameMap } from "../../game/types";
import { WALL_ROTATION } from "../surfaces";
import {
  BRIDGE_KICK, BRIDGE_STRINGER, LADDER_HALF_WIDTH, LADDER_HANDHOLD, LADDER_NECK,
  LADDER_RAIL, LADDER_RUNG, LADDER_STANDOFF, TRIM_HAZARD_URL, TRIM_PAINT_URL, TRIM_TEXELS,
} from "./constants";
import { RUNG_SPACING } from "./poses";
import type { createReliefGeometry } from "./reliefGeometry";
import type { ViewportSettings } from "./settings";
import { createBandPlane, type WallKit } from "./walls";

export function createTrim(deps: {
  map: GameMap;
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  ownMaterials: THREE.MeshStandardMaterial[];
  kitTexture: (url: string, onLoad?: (tex: THREE.Texture) => void) => THREE.Texture;
  bust: string;
  floorY: (x: number, y: number) => number;
  wallHeight: number;
  primaryKit: WallKit;
  settings: ViewportSettings;
  floorKitAt: (x: number, y: number) => WallKit | null;
  isRelief: boolean;
  floorMat: THREE.Material;
  buildRelief: ReturnType<typeof createReliefGeometry>["buildRelief"];
  floorDepth: number;
  track: <T>(work: Promise<T>) => Promise<T>;
}) {
  const { map, group, geometries, ownMaterials, kitTexture, bust, floorY, wallHeight, primaryKit, settings, floorKitAt, isRelief, floorMat, buildRelief, floorDepth, track } = deps;

  // --- trim: worn yellow paint (ladders) and hazard stripes (bridge
  // edges), repeating at the walls' pixel density on boxes of any size ---
  function trimTexture(url: string, wrap: THREE.Wrapping): THREE.Texture {
    const tex = kitTexture(url + bust, (t) => {
      // the boxes' UVs count texels (trimBox): one repeat per image size
      const img = t.image as HTMLImageElement;
      t.repeat.set(1 / img.width, 1 / img.height);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = wrap;
    return tex;
  }
  const trimTextures = [
    // mirrored: a patch cut from a decal tiles without seams that way
    trimTexture(TRIM_PAINT_URL, THREE.MirroredRepeatWrapping),
    // already a whole number of stripe periods wide
    trimTexture(TRIM_HAZARD_URL, THREE.RepeatWrapping),
  ];
  const [paintMat, hazardMat] = trimTextures.map(
    (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.3 }),
  );
  // a box whose UVs run in texels (TRIM_TEXELS per world unit) on every
  // face; one per size
  const trimBoxes = new Map<string, THREE.BoxGeometry>();
  function trimBox(w: number, h: number, d: number, uvScale = TRIM_TEXELS): THREE.BoxGeometry {
    const key = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)},${uvScale}`;
    let geo = trimBoxes.get(key);
    if (!geo) {
      geo = new THREE.BoxGeometry(w, h, d);
      // BoxGeometry faces (+x, -x, +y, -y, +z, -z), 4 vertices each, and
      // the box dimensions their u and v run along
      const spans = [
        [d, h],
        [d, h],
        [w, d],
        [w, d],
        [w, h],
        [w, h],
      ];
      const uv = geo.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        const [su, sv] = spans[Math.floor(i / 4)];
        uv.setXY(i, uv.getX(i) * su * uvScale, uv.getY(i) * sv * uvScale);
      }
      trimBoxes.set(key, geo);
      geometries.push(geo);
    }
    return geo;
  }

  // --- ladders: rails and rungs standing against the step face, the rails
  // reaching above the ledge and bending over onto it as handholds ---
  const ladderBox = new THREE.BoxGeometry(1, 1, 1);
  geometries.push(ladderBox);
  for (const ladder of map.ladders ?? []) {
    const v = DIR_VECTOR[ladder.wall];
    const { x, y } = ladder.cell;
    const bottom = floorY(x, y);
    const h = floorY(x + v.x, y + v.y) - bottom;
    const reach = h + LADDER_HANDHOLD * wallHeight;
    const z = LADDER_STANDOFF;
    const ladderGroup = new THREE.Group();
    // like the wall panel it stands against: local +Z faces the foot's cell
    ladderGroup.position.set(x + v.x * 0.5, bottom, y + v.y * 0.5);
    ladderGroup.rotation.y = WALL_ROTATION[ladder.wall];
    const bar = (w: number, bh: number, d: number, px: number, py: number, pz: number) => {
      const mesh = new THREE.Mesh(trimBox(w, bh, d), paintMat);
      mesh.position.set(px, py, pz);
      ladderGroup.add(mesh);
    };
    for (const side of [-1, 1]) {
      const rx = side * LADDER_HALF_WIDTH;
      bar(LADDER_RAIL, reach, LADDER_RAIL, rx, reach / 2, z);
      // over the edge and down onto the floor above
      bar(LADDER_RAIL, LADDER_RAIL, z + LADDER_NECK, rx, reach, (z - LADDER_NECK) / 2);
      bar(LADDER_RAIL, reach - h, LADDER_RAIL, rx, h + (reach - h) / 2, -LADDER_NECK);
      // brackets holding it off the wall
      for (const by of [0.12 * wallHeight, h - 0.08 * wallHeight]) bar(LADDER_RAIL, LADDER_RAIL, z, rx, by, z / 2);
    }
    const spacing = RUNG_SPACING * wallHeight;
    for (let ry = spacing; ry <= h + 1e-6; ry += spacing) {
      bar(LADDER_HALF_WIDTH * 2, LADDER_RUNG, LADDER_RUNG, 0, ry, z);
    }
    group.add(ladderGroup);
  }

  // --- bridges: a strip of the cell's floor texture as the deck, with a
  // low hazard-striped kick plate along each edge. A grate deck has its
  // slots cut open, seen from both sides, resting on two slim stringers;
  // any other deck sits on a solid steel body. ---
  const stoneBridge = map.world === "fantasy";
  const bridgeMat = new THREE.MeshStandardMaterial(stoneBridge ? { map: primaryKit.wallMat.map, roughness: 1, metalness: 0 } : { color: 0x2a2d31, roughness: 0.5, metalness: 0.6 });
  // a see-through deck is seen from below as well
  const doubleSided = (src: THREE.MeshStandardMaterial) => {
    const mat = new THREE.MeshStandardMaterial({
      map: src.map,
      normalMap: src.normalMap,
      roughness: settings.roughness,
      metalness: settings.metalness,
      side: THREE.DoubleSide,
    });
    ownMaterials.push(mat);
    return mat;
  };
  const grateMats = new Map<WallKit, THREE.MeshStandardMaterial[]>();
  for (const bridge of map.bridges ?? []) {
    const { x, y } = bridge.cell;
    const deckY = bridge.height * wallHeight;
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(x, deckY, y);
    // built running east-west (local X)
    if (bridge.axis === "NS") bridgeGroup.rotation.y = Math.PI / 2;
    const box = (w: number, h: number, d: number, px: number, py: number, pz: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(ladderBox, mat);
      mesh.scale.set(w, h, d);
      mesh.position.set(px, py, pz);
      bridgeGroup.add(mesh);
    };
    for (const side of [-1, 1]) {
      const kick = new THREE.Mesh(trimBox(1, BRIDGE_KICK, LADDER_RAIL, stoneBridge ? 1 : TRIM_TEXELS), stoneBridge ? bridgeMat : hazardMat);
      kick.position.set(0, BRIDGE_KICK / 2 - 0.01, side * (BRIDGE_WIDTH / 2));
      bridgeGroup.add(kick);
    }
    group.add(bridgeGroup);
    if (stoneBridge) {
      box(1, BRIDGE_THICKNESS, BRIDGE_WIDTH, 0, -BRIDGE_THICKNESS / 2, 0, bridgeMat);
      continue;
    }

    // the walking surface: the middle band of the floor tile, as wide as
    // the deck, so its texels stay square
    const kit = floorKitAt(x, y);
    const grate = isRelief && kit?.grateLevels ? kit.grateLevels : 0;
    if (grate) {
      for (const side of [-1, 1]) {
        const z = side * (BRIDGE_WIDTH / 2 - BRIDGE_STRINGER / 2);
        box(1, BRIDGE_THICKNESS, BRIDGE_STRINGER, 0, -BRIDGE_THICKNESS / 2 - 0.02, z, bridgeMat);
      }
    } else {
      box(1, BRIDGE_THICKNESS, BRIDGE_WIDTH, 0, -BRIDGE_THICKNESS / 2 - 0.002, 0, bridgeMat);
    }
    if (!kit) {
      box(1, 0.004, BRIDGE_WIDTH, 0, 0, 0, floorMat);
      continue;
    }
    const rows: [number, number] = [(1 - BRIDGE_WIDTH) / 2, (1 + BRIDGE_WIDTH) / 2];
    const deckGeometry = isRelief
      ? buildRelief(kit, { height: BRIDGE_WIDTH, flushEdges: false, depth: floorDepth, rows, holeLevels: grate }).then(
          (relief) => relief?.geometry ?? null,
        )
      : Promise.resolve(createBandPlane(BRIDGE_WIDTH, rows));
    track(deckGeometry)
      .then((geo) => {
        if (!geo) return;
        if (!isRelief) geometries.push(geo);
        let mats: THREE.Material | THREE.Material[] = isRelief ? [kit.wallMat, kit.sideMat] : kit.wallMat;
        if (grate) {
          let own = grateMats.get(kit);
          if (!own) {
            own = [doubleSided(kit.wallMat), doubleSided(kit.sideMat)];
            grateMats.set(kit, own);
          }
          mats = own;
        }
        const deck = new THREE.Mesh(geo, mats);
        // laid flat facing up; local X (the band's length) along the bridge
        deck.rotation.x = -Math.PI / 2;
        bridgeGroup.add(deck);
      })
      .catch((err) => console.error("Bridge build failed:", err));
  }

  function dispose() {
    bridgeMat.dispose();
    hazardMat.dispose();
    paintMat.dispose();
  }

  return { dispose };
}
