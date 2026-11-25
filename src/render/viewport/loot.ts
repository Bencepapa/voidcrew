import * as THREE from "three";

// loot items' sprites: how tall (world units), how far above the floor, and
// a spill's timing (ms): out of the container, lying there until, drawn in
export const ITEM_HEIGHT = 0.2;
export const ITEM_LIFT = 0.005;
// how much bigger a loose item is drawn lying flat in the top-down view
export const ITEM_TOPDOWN_GROW = 1.4;
// how much they glow (see itemTemplate)
export const ITEM_GLOW = 0.1;
// how their normals are bent (see itemTemplate): how much of the relief's
// own normal is kept, and what's added - up, and a little back
export const ITEM_NORMAL_KEEP = 0.6;
export const ITEM_NORMAL_BEND = new THREE.Vector3(0, 1, -0.35);
export const SPILL_OUT_MS = 380;
export const SPILL_REST_MS = 1000;
export const SPILL_IN_MS = 380;
