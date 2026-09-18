import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cellAt } from "../game/map";
import { DIR_VECTOR } from "../game/movement";
import type { Direction, GameMap, Vec2 } from "../game/types";

export type TextureSetId = "wall1" | "wall2" | "wall3";
export type WallProfileId = "flat" | "convex" | "concave";

export interface ViewportSettings {
  textureSet: TextureSetId;
  wallProfile: WallProfileId;
  eyeHeight: number;
  wallHeight: number;
  cameraPullback: number;
  moveDurationMs: number;
  fov: number;
  pointLightIntensity: number;
  ambientIntensity: number;
  bobEnabled: boolean;
  bevelFraction: number;
  bevelAngleDeg: number;
}

export const DEFAULT_SETTINGS: ViewportSettings = {
  textureSet: "wall3",
  wallProfile: "convex",
  eyeHeight: 0.5,
  wallHeight: 1.0,
  cameraPullback: 0.3,
  moveDurationMs: 220,
  fov: 72,
  pointLightIntensity: 3.5,
  ambientIntensity: 0.7,
  bobEnabled: true,
  bevelFraction: 0.2,
  bevelAngleDeg: 30,
};

// A flat wall panel with the top/bottom edges beveled, like the classic
// sci-fi corridor look: floor and ceiling stay flush with the grid boundary,
// but the middle band bulges toward the room (convex, sign=+1) or recedes
// away from it (concave, sign=-1) via two angled bevels.
//
// Each wall face is built independently, so a naive width-uniform bevel
// doesn't meet correctly where two perpendicular walls share a corner: convex
// leaves a gap (both edges pull away from the true corner line in different
// directions) and concave overlaps (both edges push past it). The fix is to
// taper the bevel amount back to zero within a small margin of each side
// edge, so every panel is flush (z=0) exactly at the corner regardless of
// direction, and only bulges/recedes in its own middle stretch.
function createBeveledWallGeometry(
  width: number,
  height: number,
  bevelFraction: number,
  bevelAngleDeg: number,
  sign: 1 | -1,
): THREE.BufferGeometry {
  const bevelH = height * bevelFraction;
  // bevelAngleDeg is measured from horizontal (the floor/ceiling plane), not
  // from vertical - so recess = adjacent/opposite = bevelH / tan(angle).
  // Lower angle -> closer to flat/horizontal -> more dramatic recess.
  const recess = (bevelH / Math.tan((bevelAngleDeg * Math.PI) / 180)) * sign;
  const halfH = height / 2;
  const halfW = width / 2;
  const margin = Math.min(0.15, width * 0.2);

  // profile points (y, zBase) centered on the origin to match
  // THREE.PlaneGeometry's local coordinate convention (both are positioned
  // by the same `mesh.position.y = wallHeight / 2` call)
  const yProfile: [number, number][] = [
    [-halfH, 0],
    [-halfH + bevelH, recess],
    [halfH - bevelH, recess],
    [halfH, 0],
  ];

  // width columns: flush at the true edges, full effect inside the margin
  const xCols = [-halfW, -halfW + margin, halfW - margin, halfW];
  const taper = [0, 1, 1, 0];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let yi = 0; yi < yProfile.length - 1; yi++) {
    const [y0, z0base] = yProfile[yi];
    const [y1, z1base] = yProfile[yi + 1];

    // flat per-row normal from the height-direction slope only (the small
    // extra slope introduced by the width taper near corners is ignored -
    // an acceptable approximation given how narrow that margin is)
    const dy = y1 - y0;
    const dz = z1base - z0base;
    let ny = -dz;
    let nz = dy;
    const len = Math.hypot(ny, nz) || 1;
    ny /= len;
    nz /= len;
    if (nz < 0) {
      ny = -ny;
      nz = -nz;
    }

    for (let xi = 0; xi < xCols.length - 1; xi++) {
      const x0 = xCols[xi];
      const x1 = xCols[xi + 1];
      const t0 = taper[xi];
      const t1 = taper[xi + 1];

      const v00 = [x0, y0, z0base * t0];
      const v10 = [x1, y0, z0base * t1];
      const v11 = [x1, y1, z1base * t1];
      const v01 = [x0, y1, z1base * t0];

      positions.push(...v00, ...v10, ...v11, ...v00, ...v11, ...v01);
      for (let k = 0; k < 6; k++) normals.push(0, ny, nz);

      const uv0 = yi / (yProfile.length - 1);
      const uv1 = (yi + 1) / (yProfile.length - 1);
      const u0 = (x0 + halfW) / width;
      const u1 = (x1 + halfW) / width;
      uvs.push(u0, uv0, u1, uv0, u1, uv1, u0, uv0, u1, uv1, u0, uv1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

const TEXTURE_SETS: Record<TextureSetId, { diffuse: string; normal: string }> = {
  // import.meta.env.BASE_URL matches Vite's `base` config (e.g. "/voidcrew/"
  // on GitHub Pages) - a hardcoded "/textures/..." would 404 there since the
  // app isn't served from the domain root.
  wall1: { diffuse: `${import.meta.env.BASE_URL}textures/wall1/diffuse.jpeg`, normal: `${import.meta.env.BASE_URL}textures/wall1/normal.png` },
  wall2: { diffuse: `${import.meta.env.BASE_URL}textures/wall2/diffuse.png`, normal: `${import.meta.env.BASE_URL}textures/wall2/normal.png` },
  wall3: { diffuse: `${import.meta.env.BASE_URL}textures/wall3/diffuse.png`, normal: `${import.meta.env.BASE_URL}textures/wall3/normal.png` },
};

const DOOR_COLOR = 0xd92626;
const DOOR_SLIDE_HEIGHT = 1.1;

interface GameViewportProps {
  map: GameMap;
  pos: Vec2;
  dir: Direction;
  openingDoor: Vec2 | null;
  settings: ViewportSettings;
}

// direction -> the Y rotation a boundary plane needs so its front face is
// visible from the walkable cell it belongs to (see derivation in-repo history)
const WALL_ROTATION: Record<Direction, number> = {
  N: 0,
  S: Math.PI,
  E: -Math.PI / 2,
  W: Math.PI / 2,
};

interface CamTarget {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

function computeTarget(pos: Vec2, dir: Direction): CamTarget {
  const fwd = DIR_VECTOR[dir];
  return { x: pos.x, z: pos.y, tx: pos.x + fwd.x, tz: pos.y + fwd.y };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function doorKey(a: Vec2, b: Vec2): string {
  return `${(a.x + b.x) / 2},${(a.y + b.y) / 2}`;
}

export function GameViewport({ map, pos, dir, openingDoor, settings }: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // continuously-updated "where the camera actually is right now", read and
  // written every animation frame, whether mid-transition or settled
  const liveRef = useRef<CamTarget>(computeTarget(pos, dir));
  const animRef = useRef<{ from: CamTarget; to: CamTarget; start: number } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    animRef.current = { from: { ...liveRef.current }, to: computeTarget(pos, dir), start: performance.now() };
  }, [pos, dir]);

  const doorMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const doorAnimRef = useRef<{ mesh: THREE.Mesh; start: number; from: number; to: number; duration: number } | null>(null);
  const prevPosRef = useRef(pos);

  useEffect(() => {
    if (openingDoor) {
      const key = doorKey(prevPosRef.current, openingDoor);
      const mesh = doorMeshesRef.current.get(key);
      if (mesh) {
        doorAnimRef.current = {
          mesh,
          start: performance.now(),
          from: mesh.position.y,
          to: settingsRef.current.wallHeight * DOOR_SLIDE_HEIGHT,
          duration: settingsRef.current.moveDurationMs,
        };
      }
    }
    prevPosRef.current = pos;
  }, [openingDoor, pos]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 1.6, 5.5);

    const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x445566, settings.ambientIntensity);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(0xfff2d9, settings.pointLightIntensity, 8, 2);
    scene.add(pointLight);

    const texturePaths = TEXTURE_SETS[settings.textureSet];
    const loader = new THREE.TextureLoader();
    const diffuse = loader.load(texturePaths.diffuse);
    const normalMap = loader.load(texturePaths.normal);
    diffuse.colorSpace = THREE.SRGBColorSpace;

    const wallHeight = settings.wallHeight;
    const wallMat = new THREE.MeshStandardMaterial({ map: diffuse, normalMap, roughness: 0.85, metalness: 0.25 });
    const doorMat = new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 0.6 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 1 });

    const wallGeo =
      settings.wallProfile === "flat"
        ? new THREE.PlaneGeometry(1, wallHeight)
        : createBeveledWallGeometry(1, wallHeight, settings.bevelFraction, settings.bevelAngleDeg, settings.wallProfile === "convex" ? 1 : -1);
    const floorGeo = new THREE.PlaneGeometry(1, 1);

    const group = new THREE.Group();
    scene.add(group);
    doorMeshesRef.current.clear();

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (cellAt(map, x, y) === "wall") continue;

        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(x, 0, y);
        group.add(floor);

        const ceiling = new THREE.Mesh(floorGeo, ceilMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(x, wallHeight, y);
        group.add(ceiling);

        (Object.keys(DIR_VECTOR) as Direction[]).forEach((d) => {
          const v = DIR_VECTOR[d];
          const neighborType = cellAt(map, x + v.x, y + v.y);
          if (neighborType !== "wall" && neighborType !== "door") return;

          const plane = new THREE.Mesh(wallGeo, neighborType === "door" ? doorMat : wallMat);
          plane.position.set(x + v.x * 0.5, wallHeight / 2, y + v.y * 0.5);
          plane.rotation.y = WALL_ROTATION[d];
          group.add(plane);

          if (neighborType === "door") {
            doorMeshesRef.current.set(doorKey({ x, y }, { x: x + v.x, y: y + v.y }), plane);
          }
        });
      }
    }

    function resize() {
      const w = container!.clientWidth || 1;
      const h = container!.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const clock = new THREE.Clock();

    function animate() {
      if (disposed) return;
      const s = settingsRef.current;
      const t = clock.getElapsedTime();
      const now = performance.now();

      const anim = animRef.current;
      let cam: CamTarget;
      if (anim) {
        const p = Math.min(1, (now - anim.start) / s.moveDurationMs);
        const e = easeOutQuad(p);
        cam = {
          x: lerp(anim.from.x, anim.to.x, e),
          z: lerp(anim.from.z, anim.to.z, e),
          tx: lerp(anim.from.tx, anim.to.tx, e),
          tz: lerp(anim.from.tz, anim.to.tz, e),
        };
        if (p >= 1) animRef.current = null;
      } else {
        cam = liveRef.current;
      }
      liveRef.current = cam;

      const doorAnim = doorAnimRef.current;
      if (doorAnim) {
        const p = Math.min(1, (now - doorAnim.start) / doorAnim.duration);
        doorAnim.mesh.position.y = lerp(doorAnim.from, doorAnim.to, easeOutQuad(p));
        if (p >= 1) doorAnimRef.current = null;
      }

      const bobY = s.bobEnabled ? Math.sin((t * 2 * Math.PI) / 3.2) * 0.035 : 0;
      const bobRoll = s.bobEnabled ? Math.cos((t * 2 * Math.PI) / 1.6) * 0.015 : 0;

      const fwdX = cam.tx - cam.x;
      const fwdZ = cam.tz - cam.z;
      const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
      const camX = cam.x - (fwdX / fwdLen) * s.cameraPullback;
      const camZ = cam.z - (fwdZ / fwdLen) * s.cameraPullback;

      if (camera.fov !== s.fov) {
        camera.fov = s.fov;
        camera.updateProjectionMatrix();
      }

      camera.position.set(camX, s.eyeHeight + bobY, camZ);
      camera.lookAt(cam.tx, s.eyeHeight + bobY, cam.tz);
      camera.rotateZ(bobRoll);

      ambient.intensity = s.ambientIntensity;
      pointLight.intensity = s.pointLightIntensity;
      pointLight.position.set(
        camera.position.x + Math.cos(t * 0.5) * 0.4,
        s.eyeHeight + 0.3,
        camera.position.z + Math.sin(t * 0.5) * 0.4 - 0.3,
      );

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      container.removeChild(renderer.domElement);
      wallGeo.dispose();
      floorGeo.dispose();
      wallMat.dispose();
      doorMat.dispose();
      floorMat.dispose();
      ceilMat.dispose();
      diffuse.dispose();
      normalMap.dispose();
      renderer.dispose();
    };
  }, [map, settings.textureSet, settings.wallProfile, settings.wallHeight, settings.bevelFraction, settings.bevelAngleDeg]);

  return <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black" />;
}
