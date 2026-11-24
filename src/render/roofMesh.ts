import * as THREE from "three";
import { ROOF_THICKNESS, roofEaveDistance, roofProfileAt, type RoofSegment, type RoofSide } from "../game/roofPieces";

// The geometry of a roof piece (see props.ts, PropType "roof"): a heightfield
// over its one-cell footprint, its 45 degree slopes and flat stretches kept
// exactly planar by cutting the cell along every bend and ridge. In the
// piece's own space: x across (-0.5..0.5), z the front at +0.5 (where the
// eave is), y up from the underside's lowest point. (The profile arithmetic,
// roofProfileAt, is shared with the roof autotile: see roofPieces.ts.)
export { roofProfileAt };

export interface RoofGeometry {
  // the upper surface (wall texture with its normal map)
  top: THREE.BufferGeometry;
  // the underside and the cut edges around it (plain texture)
  under: THREE.BufferGeometry;
}

type V3 = [number, number, number];

// (`eaves`: a piece with eaves on several sides, instead of a `corner`: its surface is the lowest of the
// profiles run from each of those sides - a ridge, a hipped end, a pyramid)
export function buildRoofGeometry(profile: RoofSegment[], corner?: "outer" | "inner", eaves?: readonly RoofSide[]): RoofGeometry {
  const T = ROOF_THICKNESS;
  // the cell's cut lines: eighths, and each bend (from the front and from the
  // side - the corner pieces' two profiles run from two edges)
  const marks = [0, 1];
  for (let k = 1; k < 8; k++) marks.push(k / 8);
  let run = 0;
  for (const seg of profile) {
    run += seg.run;
    if (run < 1 - 1e-6) marks.push(run, 1 - run);
  }
  marks.sort((a, b) => a - b);
  const G = marks.filter((m, i) => i === 0 || m - marks[i - 1] > 1e-6);

  // the surface at (x, z) in 0..1 (the cell's corner at the back left): its
  // height, which of the two slopes it's on, and the texture coordinates
  const eaveA = (z: number) => 1 - z;
  const eaveB = (x: number) => (corner === "inner" ? 1 - x : x);
  const height = (x: number, z: number) => {
    if (eaves) return Math.min(...eaves.map((side) => roofProfileAt(profile, roofEaveDistance(side, x, z)).h));
    const a = roofProfileAt(profile, eaveA(z)).h;
    if (!corner) return a;
    const b = roofProfileAt(profile, eaveB(x)).h;
    return corner === "outer" ? Math.min(a, b) : Math.max(a, b);
  };

  const topPos: number[] = [];
  const topUv: number[] = [];
  const underPos: number[] = [];
  const underUv: number[] = [];
  const point = (x: number, z: number, lift: number): V3 => [x - 0.5, height(x, z) + lift, z - 0.5];
  // a triangle turned to face `want` (a direction)
  const tri = (a: V3, b: V3, c: V3, want: V3): [V3, V3, V3, boolean] => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const flip = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0;
    return flip ? [a, c, b, true] : [a, b, c, false];
  };
  // (with eaves on several sides each triangle takes the texture of the nearest eave: along it, and the
  // arc length from it up the slope)
  const nearestEave = (x: number, z: number): RoofSide =>
    eaves!.reduce((best, side) => (roofEaveDistance(side, x, z) < roofEaveDistance(best, x, z) ? side : best));
  const uvOfEave = (x: number, z: number, side: RoofSide): [number, number] => {
    const along = side === "front" ? x : side === "back" ? 1 - x : side === "left" ? z : 1 - z;
    return [along, roofProfileAt(profile, roofEaveDistance(side, x, z)).s];
  };
  const uvOf = (x: number, z: number, onA: boolean, side?: RoofSide): [number, number] => {
    if (side) return uvOfEave(x, z, side);
    if (onA) return [x, roofProfileAt(profile, eaveA(z)).s];
    return [corner === "inner" ? 1 - z : z, roofProfileAt(profile, eaveB(x)).s];
  };
  const emitTop = (p: [number, number][]) => {
    const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
    const cz = (p[0][1] + p[1][1] + p[2][1]) / 3;
    // (the slope whose eave is nearer, for an outer corner: the lower; for an inner one, the higher)
    const a = eaveA(cz);
    const b = eaveB(cx);
    const onA = !corner || (corner === "outer" ? a <= b : a >= b);
    const side = eaves ? nearestEave(cx, cz) : undefined;
    const pts = p.map(([x, z]) => ({ at: point(x, z, T), uv: uvOf(x, z, onA, side), under: point(x, z, 0), xz: [x, z] as [number, number] }));
    const [a0, b0, c0] = pts;
    const order = tri(a0.at, b0.at, c0.at, [0, 1, 0]);
    const index = (pt: V3) => pts.find((q) => q.at === pt)!;
    for (const pt of order.slice(0, 3) as V3[]) {
      topPos.push(...pt);
      topUv.push(...index(pt).uv);
    }
    // the underside: the same triangle the other way round, its texture planar
    const under = tri(a0.under, b0.under, c0.under, [0, -1, 0]);
    for (const pt of under.slice(0, 3) as V3[]) {
      const q = pts.find((o) => o.under === pt)!;
      underPos.push(...pt);
      underUv.push(q.xz[0], q.xz[1]);
    }
  };
  for (let i = 0; i < G.length - 1; i++) {
    for (let j = 0; j < G.length - 1; j++) {
      const [x0, x1, z0, z1] = [G[i], G[i + 1], G[j], G[j + 1]];
      // cut along the ridge (an outer corner's runs from the front left to the back right...); a piece with
      // eaves on several sides has creases along the cell's diagonals: the squares on a diagonal are cut along it
      if (corner === "outer" || (eaves && i + j === G.length - 2)) {
        emitTop([[x0, z0], [x1, z0], [x0, z1]]);
        emitTop([[x1, z0], [x1, z1], [x0, z1]]);
      } else {
        emitTop([[x0, z0], [x1, z0], [x1, z1]]);
        emitTop([[x0, z0], [x1, z1], [x0, z1]]);
      }
    }
  }
  // the cut edges all round: from the surface down to the underside
  const skirt = (x0: number, z0: number, x1: number, z1: number, want: V3) => {
    const a = point(x0, z0, T);
    const b = point(x1, z1, T);
    const c = point(x1, z1, 0);
    const d = point(x0, z0, 0);
    const along = (x: number, z: number) => (x0 === x1 ? z : x);
    const uvs = new Map<V3, [number, number]>([
      [a, [along(x0, z0), 0.5]],
      [b, [along(x1, z1), 0.5]],
      [c, [along(x1, z1), 0.5 + T]],
      [d, [along(x0, z0), 0.5 + T]],
    ]);
    for (const [p, q, r] of [[a, b, c], [a, c, d]] as V3[][]) {
      const [p2, q2, r2] = tri(p, q, r, want);
      for (const pt of [p2, q2, r2]) {
        underPos.push(...pt);
        underUv.push(...uvs.get(pt)!);
      }
    }
  };
  for (let k = 0; k < G.length - 1; k++) {
    skirt(G[k], 0, G[k + 1], 0, [0, 0, -1]);
    skirt(G[k], 1, G[k + 1], 1, [0, 0, 1]);
    skirt(0, G[k], 0, G[k + 1], [-1, 0, 0]);
    skirt(1, G[k], 1, G[k + 1], [1, 0, 0]);
  }

  const make = (pos: number[], uv: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("uv1", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };
  return { top: make(topPos, topUv), under: make(underPos, underUv) };
}
