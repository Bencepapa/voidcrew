import * as THREE from "three";
import type { EdgeSegment } from "./reliefMesh";

// Where two relief wall panels meet - at a corner of a wall or side by side
// on a straight one - each is built on its own, its relief running right up
// to its side edge (ReliefOptions.joinEdges), along one profile shared by
// every panel of a texture. At a corner both panels are built for it
// (ReliefOptions.edgeModes, picked here by edgeModes): each edge is pushed
// along its face by its own height, onto the mitre, so two faces of the same
// profile meet vertex on vertex - the stones' corners and the mortar's
// grooves turn round the corner, with nothing between them.
//
// What's left - two different textures, panels whose heights don't line up
// (a step in the floor, a header), a straight seam between them, an edge
// with nothing to meet - is filled here with a thin strip per meeting point,
// built from both edges' profiles. Seen from above, at any height, a
// meeting point P has panel A's edge at a = P + nA*zA (+ its push along the
// face) and B's at b, and the strip carries each face on to where the
// other face's surface is (see buildJoin's section). An edge with nothing
// to meet (or more than one candidate, as where two wall cells touch
// diagonally) gets a cap back to the base plane, like the stepped relief's
// closing faces: whatever meets it flush (a door frame, a window) ends on
// that line too. Edges with steps (stepped relief) or with pieces of
// different panels above one another also get level faces between heights.

export interface JoinPanel {
  // the face center and its world height, and its turn (as WallSlot)
  x: number;
  z: number;
  y: number;
  rotY: number;
  width: number;
  edge: EdgeSegment[];
  // the corner modes it was built with, [left, right] (see edgeModes)
  modes: [number, number];
  // the panel's front material: its texture continues over the strip (the
  // level faces too - their texture coordinates run both ways, unlike the
  // stepped relief's step faces, so its normal map works on them; and one
  // material keeps the strips to one draw call)
  material: THREE.Material;
}

// one meeting point's strip, as triangle lists per material (world space)
export interface JoinPart {
  material: THREE.Material;
  position: number[];
  normal: number[];
  uv: number[];
}
export interface CornerJoin {
  point: THREE.Vector2;
  kind: Kind | "lone";
  parts: JoinPart[];
  triangles: number;
}

// Strips are tiny - a few dozen triangles - and there's one at almost every
// meeting point, so drawn one by one they'd cost a draw call each. They're
// merged instead, one mesh per material, and drawn through an index that
// holds only the points the caller picks (see JoinedStrips.show) - those in
// sight and in view, as the panels are culled.
export interface JoinPoint {
  point: THREE.Vector2;
  // its run of vertices, and their bounds
  start: number;
  count: number;
  box: THREE.Box3;
  // the caller's: whether it's in sight (see GameViewport applySight)
  inSight: boolean;
}
export interface JoinedStrips {
  mesh: THREE.Mesh;
  points: JoinPoint[];
  triangles: number;
  // draws the points `keep` picks (rewriting the index only when that
  // changed); false: none of them
  show(keep: (p: JoinPoint) => boolean): boolean;
}

export function mergeCornerJoins(joins: CornerJoin[]): JoinedStrips[] {
  const merged = new Map<THREE.Material, { part: JoinPart; points: JoinPoint[] }>();
  for (const join of joins) {
    for (const part of join.parts) {
      let entry = merged.get(part.material);
      if (!entry) {
        entry = { part: { material: part.material, position: [], normal: [], uv: [] }, points: [] };
        merged.set(part.material, entry);
      }
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < part.position.length; i += 3) box.expandByPoint(v.fromArray(part.position, i));
      entry.points.push({ point: join.point, start: entry.part.position.length / 3, count: part.position.length / 3, box, inSight: true });
      entry.part.position.push(...part.position);
      entry.part.normal.push(...part.normal);
      entry.part.uv.push(...part.uv);
    }
  }
  return [...merged.values()].map(({ part, points }) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(part.position, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(part.normal, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(part.uv, 2));
    // the AO map reads the second set: past a panel's edge it clamps to the
    // edge's own texels
    geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(part.uv, 2));
    const vertices = part.position.length / 3;
    const index = new THREE.BufferAttribute(new Uint32Array(vertices), 1);
    index.setUsage(THREE.DynamicDrawUsage);
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, part.material);
    // (its bounds cover every strip; the ones drawn are picked per point)
    mesh.frustumCulled = false;
    const shown = new Uint8Array(points.length).fill(2);
    let drawn = 0;
    const show = (keep: (p: JoinPoint) => boolean) => {
      let changed = false;
      points.forEach((p, i) => {
        const k = keep(p) ? 1 : 0;
        if (shown[i] !== k) {
          shown[i] = k;
          changed = true;
        }
      });
      if (changed) {
        const out = index.array as Uint32Array;
        drawn = 0;
        points.forEach((p, i) => {
          if (shown[i]) for (let j = 0; j < p.count; j++) out[drawn++] = p.start + j;
        });
        geometry.setDrawRange(0, drawn);
        index.needsUpdate = true;
      }
      return drawn > 0;
    };
    return { mesh, points, triangles: vertices / 3, show };
  });
}

interface Piece {
  top: number;
  bottom: number;
  // which panel edge it is (an index into the caller's list), and its
  // corner mode (see ReliefOptions.edgeModes)
  panel: number;
  mode: number;
  seg?: EdgeSegment;
}

interface Side {
  P: THREE.Vector2;
  n: THREE.Vector2;
  e: THREE.Vector2;
  // the panel's u at this edge, and which way u runs past it
  uEdge: number;
  uSign: number;
  pieces: Piece[];
}

export type Kind = "straight" | "convex" | "concave";

const near = (a: THREE.Vector2, b: THREE.Vector2) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
const neg = (a: THREE.Vector2) => new THREE.Vector2(-a.x, -a.y);

function kindOf(s: Side, t: Side): Kind | null {
  if (near(s.n, t.n) && near(s.e, neg(t.e))) return "straight";
  if (near(s.e, t.n) && near(t.e, s.n)) return "convex";
  if (near(s.e, neg(t.n)) && near(t.e, neg(s.n))) return "concave";
  return null;
}

// the panels' side edges, gathered per meeting point and facing (a wall's
// panels stacked one above another share one side)
interface PanelPlace {
  x: number;
  z: number;
  y: number;
  rotY: number;
  width: number;
}
function gatherSides(panels: PanelPlace[], pieces: (panel: number, dir: number) => Omit<Piece, "panel">[]): Side[][] {
  const sides = new Map<string, Side>();
  const atPoint = new Map<string, Side[]>();
  panels.forEach((panel, index) => {
    const t = new THREE.Vector2(Math.cos(panel.rotY), -Math.sin(panel.rotY));
    const n = new THREE.Vector2(Math.sin(panel.rotY), Math.cos(panel.rotY));
    for (const dir of [-1, 1]) {
      const P = new THREE.Vector2(panel.x + (t.x * dir * panel.width) / 2, panel.z + (t.y * dir * panel.width) / 2);
      const e = t.clone().multiplyScalar(dir);
      const pointKey = `${Math.round(P.x * 2)},${Math.round(P.y * 2)}`;
      const key = `${pointKey}|${Math.round(n.x)},${Math.round(n.y)}|${Math.round(e.x)},${Math.round(e.y)}`;
      let side = sides.get(key);
      if (!side) {
        side = { P, n, e, uEdge: dir > 0 ? 1 : 0, uSign: dir, pieces: [] };
        sides.set(key, side);
        const list = atPoint.get(pointKey);
        if (list) list.push(side);
        else atPoint.set(pointKey, [side]);
      }
      for (const piece of pieces(index, dir)) side.pieces.push({ ...piece, panel: index });
    }
  });
  return [...atPoint.values()];
}

// Who meets whom at a point can change with height: a wall running on past
// a step in the floor meets the wall beyond it below the step and the
// riser's face above it. So per stretch between any of the sides' piece
// ends (`ys`, top down): which piece of each side is there (-1: none), and
// each side's partner - the one candidate there that has it as its own one
// candidate; -1 (a cap) otherwise. (In one sweep down each side's pieces: a
// stepped profile has a piece every few cells.)
function meetings(list: Side[]) {
  const ys = [...new Set(list.flatMap((s) => s.pieces.flatMap((p) => [p.top, p.bottom])).map((y) => Math.round(y * 1e5) / 1e5))].sort(
    (a, b) => b - a,
  );
  const cover = list.map((side) => {
    side.pieces.sort((a, b) => b.top - a.top);
    const out: number[] = [];
    let j = 0;
    for (let k = 0; k < ys.length - 1; k++) {
      // (pieces above this stretch are done with)
      while (j < side.pieces.length && side.pieces[j].bottom > ys[k] - 1e-5) j++;
      const p = side.pieces[j];
      out.push(p && p.top >= ys[k] - 1e-5 && p.bottom <= ys[k + 1] + 1e-5 ? j : -1);
    }
    return out;
  });
  const kinds = list.map((s) => list.map((t) => (s === t ? null : kindOf(s, t))));
  const partner = ys.slice(1).map((_, k) => {
    const of = (i: number) => list.map((_, j) => j).filter((j) => kinds[i][j] && cover[i][k] >= 0 && cover[j][k] >= 0);
    return list.map((_, i) => {
      const mine = of(i);
      return mine.length === 1 && of(mine[0]).length === 1 ? mine[0] : -1;
    });
  });
  return { ys, cover, kinds, partner };
}

// Each wall panel's corner modes (see ReliefOptions.edgeModes), [left,
// right]: 1 or -1 where that edge meets an outer or inner corner all the
// way up (one partner, the same kind of corner over its whole height), so
// both faces can be built to land on their shared mitre; 0 anywhere else
// (no partner, a straight continuation, a partner that changes on the way
// up) - those get join strips.
export function edgeModes(panels: (PanelPlace & { height: number })[]): [number, number][] {
  const modes = panels.map((): [number, number] => [0, 0]);
  for (const list of gatherSides(panels, (i) => [{ top: panels[i].y + panels[i].height / 2, bottom: panels[i].y - panels[i].height / 2, mode: 0 }])) {
    const { ys, cover, kinds, partner } = meetings(list);
    list.forEach((side, i) => {
      for (const [p, piece] of side.pieces.entries()) {
        let kind: Kind | null | undefined;
        for (let k = 0; k < ys.length - 1; k++) {
          if (cover[i][k] !== p) continue;
          const j = partner[k][i];
          const here = j < 0 ? null : kinds[i][j];
          kind = kind === undefined || kind === here ? here : null;
        }
        if (kind !== "convex" && kind !== "concave") continue;
        modes[piece.panel][side.uSign > 0 ? 1 : 0] = kind === "convex" ? 1 : -1;
      }
    });
  }
  return modes;
}

export function buildCornerJoins(panels: JoinPanel[]): CornerJoin[] {
  const joins: CornerJoin[] = [];
  for (const list of gatherSides(panels, (i, dir) =>
    panels[i].edge.map((seg) => ({ top: panels[i].y + seg.y0, bottom: panels[i].y + seg.y1, seg, mode: panels[i].modes[dir > 0 ? 1 : 0] })),
  )) {
    const { ys, cover, kinds, partner } = meetings(list);
    const at = list.map((side, i) => cover[i].map((p, k) => (p < 0 ? null : edgeAt(side.pieces[p], ys[k], ys[k + 1]))));
    list.forEach((s, i) => {
      // its stretches with no partner, then with each later side
      const lone = buildJoin(s, null, null, ys, at[i], null, (k) => partner[k][i] < 0, panels);
      if (lone) joins.push(lone);
      for (let j = i + 1; j < list.length; j++) {
        const kind = kinds[i][j];
        if (!kind) continue;
        const pair = buildJoin(s, list[j], kind, ys, at[i], at[j], (k) => partner[k][i] === j, panels);
        if (pair) joins.push(pair);
      }
    });
  }
  return joins;
}

interface At {
  zTop: number;
  zBottom: number;
  vTop: number;
  vBottom: number;
  mode: number;
  panel: number;
}

// a piece's edge over the stretch [bottom, top]
function edgeAt(p: Piece, top: number, bottom: number): At {
  const seg = p.seg!;
  const z = (y: number) => {
    const f = p.top === p.bottom ? 0 : (p.top - y) / (p.top - p.bottom);
    return [seg.z0 + (seg.z1 - seg.z0) * f, seg.v0 + (seg.v1 - seg.v0) * f];
  };
  const [zTop, vTop] = z(top);
  const [zBottom, vBottom] = z(bottom);
  return { zTop, zBottom, vTop, vBottom, mode: p.mode, panel: p.panel };
}

// a point of a strip's cross-section, with which panel's texture it shows
interface Pt {
  p: THREE.Vector2;
  // 0: A's, 1: B's
  owner: 0 | 1;
}
// A cross-section, [a, a*, Q, b*, b]: each edge, where it would meet the
// other face at a corner (a*, b*: its own mitre), and where the two
// surfaces meet (Q). `need`: which of its four pieces are there - see
// section. paired: both panels there.
type Sec = Pt[] & { paired?: boolean; need?: boolean[] };

// The strip of side A alone (B null: its caps) or of A meeting B, over the
// stretches between the heights `ys` where `active` says so (`atA`, `atB`:
// the sides' edges over each stretch - see meetings).
function buildJoin(
  A: Side,
  B: Side | null,
  kind: Kind | null,
  ys: number[],
  atA: (At | null)[],
  atB: (At | null)[] | null,
  active: (k: number) => boolean,
  panels: JoinPanel[],
): CornerJoin | null {
  // (a single side is drawn as A)
  const P = A.P;
  // Which way a piece of the strip faces. Round a corner: toward the room
  // (R, off the corner along both facings) - every piece of it lies within
  // a few relief depths of P, so that's unambiguous. A step face between
  // panels side by side, or a lone edge's cap, runs along the facing
  // instead: it faces the lower side - past A's edge where A stands out
  // (a -> P running back into the wall), back over A where it's recessed.
  const R = B ? P.clone().addScaledVector(A.n, 0.25).addScaledVector(B.n, 0.25) : P;
  const k = -A.e.y * A.n.x + A.e.x * A.n.y > 0 ? 1 : -1;
  const outward = (d: THREE.Vector2, mid: THREE.Vector2, paired: boolean) => {
    const o = new THREE.Vector2(-d.y * k, d.x * k);
    if (paired && kind !== "straight" && o.dot(R.clone().sub(mid)) < 0) o.negate();
    return o;
  };

  // The cross-section for edge heights zA, zB (modes mA, mB: where each
  // panel's edge was built to land). Its pieces, seen from above with u
  // along A's facing and v along B's (an outer corner; an inner one is the
  // same mirrored):
  //  a -> a*: A's face carried on past its own edge to its mitre - only for
  //    a panel not built to land there itself, and only where its edge
  //    stands out (a recessed edge's face already runs past that point);
  //  a* -> Q: A's face on to where B's surface is - where B stands out
  //    further than A (the other way the piece would lie on A's own face);
  //  Q -> b*, b* -> b: the same for B.
  // Two panels of one profile built for the corner meet at a* = Q = b*:
  // nothing to fill.
  const section = (zA: number, mA: number, zB: number | null, mB: number): Sec => {
    const a = P.clone().addScaledVector(A.n, zA).addScaledVector(A.e, mA * zA);
    let sec: Sec;
    if (!B || zB === null) {
      // a lone edge: its cap back to the base plane
      sec = [a, P, P, P, P].map((p) => ({ p, owner: 0 as const }));
      sec.need = [true, false, false, false];
      return sec;
    }
    const b = P.clone().addScaledVector(B.n, zB).addScaledVector(B.e, mB * zB);
    if (kind === "straight") {
      // side by side: the step face between the two edges
      sec = [a, a, a, b, b].map((p, i) => ({ p, owner: i < 3 ? (0 as const) : (1 as const) }));
      sec.need = [false, false, true, false];
    } else {
      const s = kind === "convex" ? 1 : -1;
      const aStar = P.clone().addScaledVector(A.n, zA).addScaledVector(A.e, s * zA);
      const bStar = P.clone().addScaledVector(B.n, zB).addScaledVector(B.e, s * zB);
      const q = P.clone().addScaledVector(A.n, zA).addScaledVector(B.n, zB);
      sec = [a, aStar, q, bStar, b].map((p, i) => ({ p, owner: i < 2 ? (0 as const) : (1 as const) }));
      sec.need = s > 0 ? [zA > 0, zB > zA, zA > zB, zB > 0] : [zA < 0, zB < zA, zA < zB, zB < 0];
      sec.paired = true;
    }
    return sec;
  };

  // texture coordinates: along the strip from the owning panel's edge (its
  // texture runs on round the corner), v at that height
  const sideOf = (owner: 0 | 1) => (owner === 0 || !B ? A : B);
  const uAt = (sec: Pt[], i: number, owner: 0 | 1) => {
    const side = sideOf(owner);
    // distance along the section from that side's own edge point
    let s = 0;
    if (owner === 0) for (let j = 0; j < i; j++) s += sec[j].p.distanceTo(sec[j + 1].p);
    else for (let j = sec.length - 1; j > i; j--) s += sec[j].p.distanceTo(sec[j - 1].p);
    return side.uEdge + side.uSign * s;
  };

  // triangles per panel material: A's (with the level faces), B's
  const buckets: { pos: number[]; nrm: number[]; uv: number[] }[] = [0, 1].map(() => ({ pos: [], nrm: [], uv: [] }));
  const tri = (bucket: number, v: [number, number, number, number, number][], n: THREE.Vector3) => {
    // wind counter-clockwise as seen from n
    const p0 = new THREE.Vector3(v[0][0], v[0][1], v[0][2]);
    const e1 = new THREE.Vector3(v[1][0], v[1][1], v[1][2]).sub(p0);
    const e2 = new THREE.Vector3(v[2][0], v[2][1], v[2][2]).sub(p0);
    const g = e1.cross(e2);
    if (g.lengthSq() < 1e-14) return;
    if (g.dot(n) < 0) v = [v[0], v[2], v[1]];
    const b = buckets[bucket];
    for (const [x, y, z, u, vv] of v) {
      b.pos.push(x, y, z);
      b.nrm.push(n.x, n.y, n.z);
      b.uv.push(u, vv);
    }
  };

  // the strip between two heights' sections (same pieces, so same owners)
  const wall = (yT: number, sT: Sec, vT: [number, number], yB: number, sB: Sec, vB: [number, number]) => {
    for (let i = 0; i < sT.length - 1; i++) {
      if (!sT.need![i] && !sB.need![i]) continue;
      const dT = sT[i + 1].p.clone().sub(sT[i].p);
      const dB = sB[i + 1].p.clone().sub(sB[i].p);
      if (dT.lengthSq() < 1e-12 && dB.lengthSq() < 1e-12) continue;
      // the owner: the panel the piece continues
      const owner = sT[i].owner === sT[i + 1].owner ? sT[i].owner : sT[i + 1].owner;
      const vOf = (pair: [number, number]) => pair[owner];
      const d = dT.clone().add(dB);
      const mid = sT[i].p.clone().add(sT[i + 1].p).add(sB[i].p).add(sB[i + 1].p).multiplyScalar(0.25);
      const out = outward(d.lengthSq() > 1e-12 ? d : dT.lengthSq() > dB.lengthSq() ? dT : dB, mid, !!sT.paired);
      const corner = (s: Pt[], j: number, y: number, v: [number, number]): [number, number, number, number, number] => [
        s[j].p.x,
        y,
        s[j].p.y,
        uAt(s, j, owner),
        vOf(v),
      ];
      const q = [corner(sT, i, yT, vT), corner(sT, i + 1, yT, vT), corner(sB, i + 1, yB, vB), corner(sB, i, yB, vB)];
      // each triangle's own facing (the quad's corners needn't be in one
      // plane - it twists where the section turns between heights), turned
      // outward
      for (const t of [
        [q[0], q[1], q[2]],
        [q[0], q[2], q[3]],
      ]) {
        const p = t.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
        if (n.lengthSq() < 1e-14) continue;
        const o = sT.paired ? R.clone().sub(new THREE.Vector2(p[0].x, p[0].z)) : out;
        if (n.x * o.x + n.z * o.y < 0) n.negate();
        tri(owner, t, n.normalize());
      }
    }
  };

  // level faces where the section jumps at height y, from `upper` (the
  // section just above) to `lower`; null = nothing there, the base point
  const level = (y: number, upper: Sec | null, lower: Sec | null, v: number) => {
    const base: Sec = [P, P, P, P, P].map((p) => ({ p, owner: 0 as const }));
    const U = upper ?? base;
    const L = lower ?? base;
    if (U.every((u, i) => u.p.distanceToSquared(L[i].p) < 1e-12)) return;
    for (let i = 0; i < U.length - 1; i++) {
      const tris = [
        [U[i].p, U[i + 1].p, L[i + 1].p],
        [U[i].p, L[i + 1].p, L[i].p],
      ];
      for (const t of tris) {
        const area = (t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y);
        if (Math.abs(area) < 1e-10) continue;
        let up: boolean;
        if (!upper) up = true;
        else if (!lower) up = false;
        else {
          // solid below (face up) where the lower section reaches further
          // out than the upper one
          const c = t[0].clone().add(t[1]).add(t[2]).multiplyScalar(1 / 3);
          const dU = U[i + 1].p.clone().sub(U[i].p);
          const dL = L[i + 1].p.clone().sub(L[i].p);
          const midU = U[i].p.clone().add(U[i + 1].p).multiplyScalar(0.5);
          const midL = L[i].p.clone().add(L[i + 1].p).multiplyScalar(0.5);
          if (dU.lengthSq() > 1e-12) up = outward(dU, midU, !!U.paired).dot(c.clone().sub(U[i].p)) > 0;
          else if (dL.lengthSq() > 1e-12) up = outward(dL, midL, !!L.paired).dot(c.clone().sub(L[i].p)) < 0;
          else continue;
        }
        const n = new THREE.Vector3(0, up ? 1 : -1, 0);
        const vert = (p: THREE.Vector2): [number, number, number, number, number] => [
          p.x,
          y,
          p.y,
          (p.x - P.x) * A.n.y - (p.y - P.y) * A.n.x,
          v + p.distanceTo(P),
        ];
        tri(0, [vert(t[0]), vert(t[1]), vert(t[2])], n);
      }
    }
  };

  let prev: { y: number; sec: Sec; v: number } | null = null;
  let material: THREE.Material | null = null;
  let materialB: THREE.Material | null = null;
  for (let i = 0; i < ys.length - 1; i++) {
    const top = ys[i];
    const bottom = ys[i + 1];
    const on = active(i);
    const a = on ? atA[i] : null;
    const b = on && atB ? atB[i] : null;
    // (a pair is only active where both sides are there)
    if (!a || (B && !b)) {
      if (prev) level(prev.y, prev.sec, null, prev.v);
      prev = null;
      continue;
    }
    material ??= panels[a.panel].material;
    if (b) materialB ??= panels[b.panel].material;
    const sT = section(a.zTop, a.mode, b ? b.zTop : null, b ? b.mode : 0);
    const sB = section(a.zBottom, a.mode, b ? b.zBottom : null, b ? b.mode : 0);
    const vT: [number, number] = [a.vTop, b ? b.vTop : a.vTop];
    const vB: [number, number] = [a.vBottom, b ? b.vBottom : a.vBottom];
    if (prev && Math.abs(prev.y - top) < 1e-5) level(top, prev.sec, sT, a.vTop);
    else {
      if (prev) level(prev.y, prev.sec, null, prev.v);
      level(top, null, sT, a.vTop);
    }
    wall(top, sT, vT, bottom, sB, vB);
    prev = { y: bottom, sec: sB, v: a.vBottom };
  }
  if (prev) level(prev.y, prev.sec, null, prev.v);

  const count = buckets.reduce((n, b) => n + b.pos.length / 3, 0);
  if (!count || !material) return null;
  const parts: JoinPart[] = [];
  ([
    [0, material],
    [1, materialB ?? material],
  ] as const).forEach(([bucket, mat]) => {
    const b = buckets[bucket];
    if (!b.pos.length) return;
    const part = parts.find((q) => q.material === mat);
    if (part) {
      part.position.push(...b.pos);
      part.normal.push(...b.nrm);
      part.uv.push(...b.uv);
    } else parts.push({ material: mat, position: b.pos, normal: b.nrm, uv: b.uv });
  });
  return { point: P.clone(), kind: kind ?? "lone", parts, triangles: count / 3 };
}
