import * as THREE from "three";
import type { OperableModel } from "../game/props";

// The operable props' models (see game/operables.ts, props.ts kind "operable"): a lever, a button, a pressure plate, a
// hidden trap cell and two wall traps, built from plain boxes - no artwork files. Each has a pose that follows its state
// (setOperablePose): the lever's handle flips down, the button sinks in and lights, the plate is pressed.
//
// Local space as every prop's: x across, y up from where the prop is mounted, +z the front (the room side); a wall
// prop's back is at -depth/2. `size` is [width (cells), height (wall heights), depth (cells)].

export interface OperableBuild {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
}

const METAL = 0x4a4f57;
const DARK = 0x16181c;
const RED = 0xb23a2e;
const BRASS = 0xb08d3c;

// The "fenceMarker" children are what the viewport shows only while editing (see syncFenceMarkers).
const MARKER = "fenceMarker";

export function buildOperableModel(
  model: OperableModel,
  size: [number, number, number],
  elevation: number,
  wallHeight: number,
  prep: (material: THREE.MeshStandardMaterial) => void,
): OperableBuild {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const [w, hWall, d] = size;
  const h = hWall * wallHeight;
  const y0 = elevation * wallHeight;
  const solid = (color: number, roughness = 0.7, metalness = 0.4) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    prep(m);
    return m;
  };
  const box = (bw: number, bh: number, bd: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const geo = new THREE.BoxGeometry(bw, bh, bd);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const metal = solid(METAL);
  const dark = solid(DARK, 0.9, 0.1);

  if (model === "lever") {
    // a back plate on the wall, a slot, and a handle that pivots on it
    const plate = 0.03;
    box(w, h, plate, metal, 0, y0 + h / 2, -d / 2 + plate / 2);
    box(w * 0.2, h * 0.8, 0.012, dark, 0, y0 + h / 2, -d / 2 + plate + 0.004);
    const pivot = new THREE.Group();
    pivot.name = "lever_handle";
    pivot.position.set(0, y0 + h / 2, -d / 2 + plate + 0.014);
    const rod = h * 0.42;
    box(0.022, rod, 0.022, solid(0x8d9299, 0.5, 0.7), 0, rod / 2, 0, pivot);
    box(0.06, 0.06, 0.06, solid(RED, 0.5, 0.2), 0, rod, 0, pivot);
    box(0.05, 0.05, 0.03, metal, 0, 0, 0, pivot);
    group.add(pivot);
  } else if (model === "button") {
    const plate = 0.025;
    box(w, h, plate, metal, 0, y0 + h / 2, -d / 2 + plate / 2);
    // (the cap stands out; pressed, it sinks nearly flush)
    const capZ = -d / 2 + plate + 0.015;
    const cap = box(w * 0.62, h * 0.62, 0.03, solid(RED, 0.4, 0.2), 0, y0 + h / 2, capZ);
    cap.name = "button_cap";
    cap.userData.baseZ = capZ;
    const lamp = box(w * 0.2, h * 0.12, 0.012, new THREE.MeshBasicMaterial({ color: 0x66ff88 }), 0, y0 + h * 0.9, -d / 2 + plate + 0.004);
    lamp.name = "button_lamp";
    lamp.visible = false;
  } else if (model === "plate") {
    // a steel frame in the floor and a plate in it that gives under a weight
    const frameH = h * 0.4;
    box(w, frameH, size[2], metal, 0, frameH / 2, 0);
    const topH = h * 0.6;
    const top = box(w * 0.82, topH, size[2] * 0.82, solid(BRASS, 0.5, 0.6), 0, frameH + topH / 2, 0);
    top.name = "plate_top";
    top.userData.baseY = frameH + topH / 2;
    top.userData.drop = topH * 0.85;
    editMark(group, geometries, "plate", w, size[2], wallHeight);
  } else if (model === "trapcell") {
    // a tile that is only a shade off the floor around it (a hidden trap) - the editor marks it
    box(w, h, size[2], solid(0x2b2d31, 0.95, 0.05), 0, h / 2, 0);
    editMark(group, geometries, "trap", w, size[2], wallHeight);
  } else if (model === "slit") {
    // a stone slab with a narrow dark slit; the editor draws the line it fires along
    const plate = 0.03;
    box(w, h, plate, metal, 0, y0 + h / 2, -d / 2 + plate / 2);
    box(w * 0.7, h * 0.12, 0.02, dark, 0, y0 + h / 2, -d / 2 + plate + 0.002);
    editLine(group, geometries, 0xff5a3c, y0 + h / 2, d / 2, wallHeight);
  } else {
    // a glyph: a dark disc with a faintly glowing rune; the editor draws its line
    const disc = new THREE.CylinderGeometry(w / 2, w / 2, 0.03, 20);
    geometries.push(disc);
    const slab = new THREE.Mesh(disc, metal);
    slab.rotation.x = Math.PI / 2;
    slab.position.set(0, y0 + h / 2, -d / 2 + 0.015);
    group.add(slab);
    const glow = new THREE.MeshBasicMaterial({ color: 0x9a5cff });
    const ring = new THREE.TorusGeometry(w * 0.32, 0.012, 6, 24);
    geometries.push(ring);
    const rune = new THREE.Mesh(ring, glow);
    rune.position.set(0, y0 + h / 2, -d / 2 + 0.034);
    group.add(rune);
    box(w * 0.5, 0.014, 0.01, glow, 0, y0 + h / 2, -d / 2 + 0.034);
    box(0.014, w * 0.5, 0.01, glow, 0, y0 + h / 2, -d / 2 + 0.034);
    editLine(group, geometries, 0xb27aff, y0 + h / 2, d / 2, wallHeight);
  }
  setOperablePose(group, false, false);
  return { group, geometries };
}

// a floor mark seen only while editing: a plate's cyan frame, a trap cell's red cross
function editMark(group: THREE.Group, geometries: THREE.BufferGeometry[], kind: "plate" | "trap", w: number, depth: number, wallHeight: number) {
  const mark = new THREE.Group();
  mark.name = MARKER;
  const color = kind === "plate" ? 0x3fd0ff : 0xff4d4d;
  const plane = new THREE.PlaneGeometry(w * 1.05, depth * 1.05);
  geometries.push(plane);
  const fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.075 * wallHeight;
  mark.add(fill);
  const hw = (w * 1.05) / 2;
  const hd = (depth * 1.05) / 2;
  const pts = kind === "plate"
    ? [[-hw, -hd], [hw, -hd], [hw, -hd], [hw, hd], [hw, hd], [-hw, hd], [-hw, hd], [-hw, -hd]]
    : [[-hw, -hd], [hw, hd], [hw, -hd], [-hw, hd]];
  const line = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.08 * wallHeight, z)));
  geometries.push(line);
  mark.add(new THREE.LineSegments(line, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true })));
  group.add(mark);
}

// a wall trap's line of fire while editing: from its front one cell out
function editLine(group: THREE.Group, geometries: THREE.BufferGeometry[], color: number, y: number, frontZ: number, wallHeight: number) {
  void wallHeight;
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, frontZ), new THREE.Vector3(0, y, frontZ + 1)]);
  geometries.push(geo);
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
  line.name = MARKER;
  group.add(line);
}

// ---- the pose

const POSE_MS = 180;
const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16) as unknown as number;
const running = new WeakMap<object, { target: number; from: number; start: number }>();

// the lever's handle at pose t (0 up / off .. 1 down / on), the button's cap sunk, the plate pressed
function applyPose(root: THREE.Object3D, t: number) {
  const handle = root.getObjectByName("lever_handle");
  if (handle) handle.rotation.x = 0.5 + t * (Math.PI - 1);
  const cap = root.getObjectByName("button_cap");
  if (cap) cap.position.z = (cap.userData.baseZ as number) - 0.024 * t;
  const lamp = root.getObjectByName("button_lamp");
  if (lamp) lamp.visible = t > 0.5;
  const top = root.getObjectByName("plate_top");
  if (top) top.position.y = (top.userData.baseY as number) - (top.userData.drop as number) * t;
  root.userData.pose = t;
}

// Puts a model's pose to its state (a lever flipped, a button down, a plate pressed): over a moment, or at once.
export function setOperablePose(root: THREE.Object3D, on: boolean, animate: boolean) {
  const target = on ? 1 : 0;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const from = (root.userData.pose as number | undefined) ?? 0;
  if (!animate || from === target) {
    running.delete(root);
    applyPose(root, target);
    return;
  }
  const busy = running.has(root);
  running.set(root, { target, from, start: now });
  if (busy) return;
  const step = () => {
    const run = running.get(root);
    if (!run) return;
    const k = Math.min(1, ((typeof performance !== "undefined" ? performance.now() : Date.now()) - run.start) / POSE_MS);
    applyPose(root, run.from + (run.target - run.from) * (k * (2 - k)));
    if (k >= 1) running.delete(root);
    else raf(step);
  };
  raf(step);
}
