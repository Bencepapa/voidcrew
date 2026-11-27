import * as THREE from "three";
import { fenceFaces, isFoliageSpec, type FenceModelSpec } from "../../game/fences";
import { isSharedTextureId } from "../../game/mapSharedRefs";
import { prismFacePlacement } from "../../game/prismFacePlacement";
import { prismFaces, prismInset, prismSides } from "../../game/propPrism";
import { PROP_TYPES, propReliefAmount, propReliefCells, type PropFace, type PropPart, type PropType, type PropView } from "../../game/props";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import { buildOperableModel } from "../operableModel";
import type { ReliefUvWindow } from "../reliefUvWindow";
import { buildRoofGeometry } from "../roofMesh";
import { isTextureSetId, TEXTURE_SETS, textureFolder, type TextureSetId } from "../textureSets";
import { textureTuning } from "../textureTuning";
import { PROP_COARSE } from "./constants";
import type { createFenceMarkers } from "./fenceMarkers";
import { buildFoliage } from "./foliageMesh";
import { addDirectLightOcclusion } from "./materials";
import { propSets } from "./propModelInputs";
import { createPropShadows } from "./propShadows";
import type { createReliefGeometry } from "./reliefGeometry";
import type { ViewportSettings } from "./settings";
import type { createStructuralDoors } from "./structuralDoors";
import type { WallKit } from "./walls";

export function createPropModels(deps: {
  primarySet: TextureSetId;
  sharedPropKitFor: (id: string) => WallKit;
  roofKitFor: (id: string) => WallKit;
  settingsRef: { current: ViewportSettings };
  wallHeight: number;
  propReliefDepth: number;
  hybrid: boolean;
  buildPropRelief: ReturnType<typeof createStructuralDoors>["buildPropRelief"];
  farReliefLevels: ReturnType<typeof createReliefGeometry>["farReliefLevels"];
  geometries: THREE.BufferGeometry[];
  fences: Pick<ReturnType<typeof createFenceMarkers>, "buildFenceMarker">;
  lightGrid: LightGridUniforms;
  ownMaterials: THREE.MeshStandardMaterial[];
  kitTexture: (url: string) => THREE.Texture;
  busted: (url: string) => string;
  markSprite: (mat: THREE.MeshStandardMaterial, normal: number, normalMap: THREE.Texture) => void;
  propKits: Map<string, WallKit>;
  createWallKit: (id: string, displace: boolean, accent: boolean) => WallKit;
  cabinGlass: THREE.Material;
  cavity: { value: number };
}) {
  const { primarySet, sharedPropKitFor, roofKitFor, settingsRef, wallHeight, propReliefDepth, hybrid, buildPropRelief, farReliefLevels, geometries, fences, lightGrid, ownMaterials, kitTexture, busted, markSprite, propKits, createWallKit, cabinGlass, cavity } = deps;

  // A fence or block piece's model: its faces - upright relief cutouts, as the panels' (front and mirrored
  // back, so it looks the same from both sides; a block's outer sides only), and flat caps - laid out round
  // the middle of its cell, in its texture sets (unset or not known: the deck's walls), and the floor mark
  async function buildFence(spec: FenceModelSpec): Promise<THREE.Group | null> {
    const template = new THREE.Group();
    const setOf = (id: string | undefined) => (isTextureSetId(id) ? id : primarySet);
    const sets = { main: setOf(spec.texture), top: setOf(spec.top ?? spec.texture), deco: setOf(spec.post?.texture ?? spec.texture) };
    const kitOf = (id: string) => {
      const kit = sharedPropKitFor(id);
      kit.normal = undefined;
      const normal = settingsRef.current.normalStrength;
      kit.wallMat.normalScale.set(normal, normal);
      return kit;
    };
    const relief = propReliefAmount(propReliefDepth, PROP_TYPES.fence_edge, hybrid);
    // foliage (layers, an X): the planes' panels merged into one model (see render/viewport/foliageMesh.ts)
    if (isFoliageSpec(spec)) {
      const foliage = await buildFoliage(
        { wallHeight, relief, coarse: PROP_COARSE, panel: buildPropRelief, far: farReliefLevels, geometries },
        kitOf(sets.main),
        spec,
      );
      if (!foliage) return null;
      template.add(foliage);
      template.add(fences.buildFenceMarker(spec));
      return template;
    }
    for (const f of fenceFaces(spec)) {
      const kit = kitOf(sets[f.tex]);
      if (f.kind === "cap") {
        const geo = new THREE.PlaneGeometry(f.sx, f.sz);
        geometries.push(geo);
        const cap = new THREE.Mesh(geo, roundMaterial(kit));
        cap.rotation.x = -Math.PI / 2;
        cap.position.set(f.x, f.y * wallHeight + 0.002, f.z);
        template.add(cap);
        continue;
      }
      const whole = f.u0 <= 1e-6 && f.u1 >= 1 - 1e-6;
      const panel = await buildPropRelief(kit, {
        width: f.length,
        height: (f.y1 - f.y0) * wallHeight,
        flushEdges: false,
        depth: relief,
        coarse: PROP_COARSE,
        ...(whole ? {} : { cols: [f.u0, f.u1] as [number, number] }),
      });
      if (!panel) return null;
      const mesh = new THREE.Mesh(panel.geometry, [kit.wallMat, kit.sideMat]);
      mesh.position.set(f.x, ((f.y0 + f.y1) / 2) * wallHeight, f.z);
      mesh.rotation.y = f.yaw;
      if (f.mirror) mesh.scale.x = -1;
      template.add(mesh);
    }
    template.add(fences.buildFenceMarker(spec));
    return template;
  }

  const billboardMaterials: THREE.MeshStandardMaterial[] = [];
  const shadows = createPropShadows();
  async function buildPropTemplate(type: PropType): Promise<THREE.Group | null> {
    const [length, height, depth] = type.size;
    // (its texture sets take its own normal strength)
    const propKitFor = (setId: string, kit = sharedPropKitFor(setId)) => {
      kit.normal = type.normal;
      const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
      kit.wallMat.normalScale.set(normal, normal);
      return kit;
    };
    const relief = propReliefAmount(propReliefDepth, type, hybrid);
    const template = new THREE.Group();
    // a lever, button, plate or trap: plain boxes (see render/operableModel.ts)
    if (type.kind === "operable") {
      const built = buildOperableModel(type.model, type.size, type.elevation ?? 0, wallHeight, (mat) => {
        useLightGrid(mat, lightGrid);
        ownMaterials.push(mat);
      });
      geometries.push(...built.geometries);
      return built.group;
    }
    const face = (
      geo: THREE.BufferGeometry,
      kit: WallKit,
      pos: [number, number, number],
      rot: [number, number],
      mirror = false,
    ) => {
      const mesh = new THREE.Mesh(geo, [kit.wallMat, kit.sideMat]);
      mesh.position.set(...pos);
      mesh.rotation.set(rot[0], rot[1], 0);
      if (mirror) mesh.scale.x = -1;
      template.add(mesh);
    };

    if (type.kind === "box") {
      const sideKit = propKitFor(type.side);
      const topKit = propKitFor(type.top);
      const h = height * wallHeight;
      const side = await buildPropRelief(sideKit, { width: length, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE });
      const top = await buildPropRelief(topKit, { width: length, height: depth, flushEdges: false, depth: relief, coarse: PROP_COARSE });
      if (!side || !top) return null;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        face(side.geometry, sideKit, [(Math.sin(a) * length) / 2, h / 2, (Math.cos(a) * depth) / 2], [0, a]);
      }
      face(top.geometry, topKit, [0, h, 0], [-Math.PI / 2, 0]);
      return template;
    }

    if (type.kind === "billboard") {
      // one flat sprite, turned to the viewer every frame (see billboardProps)
      const paths = isTextureSetId(type.texture) ? TEXTURE_SETS[type.texture] : textureFolder(type.texture);
      const diffuse = kitTexture(busted(paths.diffuse));
      const normalMap = kitTexture(busted(paths.normal));
      diffuse.colorSpace = THREE.SRGBColorSpace;
      for (const tex of [diffuse, normalMap]) tex.magFilter = THREE.NearestFilter;
      const tune = textureTuning(type.texture);
      const mat = new THREE.MeshStandardMaterial({
        map: diffuse,
        normalMap,
        alphaTest: 0.5,
        roughness: Math.min(1, 0.85 * (tune?.rough ?? 1)),
        metalness: Math.min(1, 0.02 * (tune?.metal ?? 1)),
        side: THREE.DoubleSide,
      });
      const normal = settingsRef.current.normalStrength * (type.normal ?? 1) * (tune?.normal ?? 1);
      mat.normalScale.set(normal, normal);
      markSprite(mat, normal, normalMap);
      useLightGrid(mat, lightGrid);
      billboardMaterials.push(mat);
      const h = height * wallHeight;
      const geo = new THREE.PlaneGeometry(length, h);
      geometries.push(geo);
      const sprite = new THREE.Mesh(geo, mat);
      sprite.position.y = h / 2 + (type.elevation ?? 0) * wallHeight;
      const billboard = new THREE.Group();
      billboard.name = "propBillboard";
      billboard.add(sprite);
      template.add(billboard);
      shadows.add(template, type);
      return template;
    }

    if (type.kind === "prism") {
      const alternate = type.textureB && (!isSharedTextureId(type.textureB) || isTextureSetId(type.textureB)) ? type.textureB : undefined;
      const h = height * wallHeight;
      const elevation = (type.elevation ?? 0) * wallHeight;
      const cells = propReliefCells(type);
      for (const edge of prismFaces(length, depth, prismSides(type.sides), prismInset(type.inset), !!alternate, type.wrap)) {
        const { width, position, yaw } = prismFacePlacement(edge, h, elevation);
        const id = (edge.material === 1 && alternate) || type.texture;
        const uvWindow: ReliefUvWindow | undefined = edge.u0 === 0 && edge.u1 === 1 ? undefined : [edge.u0, edge.u1];
        const shape = { width, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE, uvWindow };
        // Each window owns its AO map. Surface textures still share the scene's texture cache.
        const key = `prism:${JSON.stringify([id, type.normal, cells, shape])}`;
        let kit = propKits.get(key);
        if (!kit) {
          kit = createWallKit(id, false, false);
          kit.wallMat.alphaTest = 0.5;
          useLightGrid(kit.wallMat, lightGrid);
          useLightGrid(kit.sideMat, lightGrid);
          propKits.set(key, kit);
        }
        propKitFor(id, kit);
        const panel = await buildPropRelief(kit, shape, cells);
        if (!panel) return null;
        face(panel.geometry, kit, position, [0, yaw]);
        face(panel.geometry, kit, position, [0, yaw + Math.PI], true);
      }
      shadows.add(template, type);
      return template;
    }

    if (type.kind === "panel" || type.kind === "cross") {
      // front and back (the back mirrored), crossed for a cross
      const kit = propKitFor(type.texture);
      const h = height * wallHeight;
      const panel = await buildPropRelief(kit, {
        width: length, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE,
        outwardRelief: type.kind === "cross",
      }, propReliefCells(type));
      if (!panel) return null;
      const y = (type.elevation ?? 0) * wallHeight + h / 2;
      for (const turn of type.kind === "cross" ? [0, Math.PI / 2] : [0]) {
        face(panel.geometry, kit, [0, y, 0], [0, turn]);
        face(panel.geometry, kit, [0, y, 0], [0, turn + Math.PI], true);
      }
      shadows.add(template, type);
      return template;
    }

    if (type.kind === "cabin") {
      const [door, inside, side, top] = propSets(type, primarySet).map((id) => propKitFor(id));
      const h = height * wallHeight;
      const panel = (kit: WallKit, w: number, ph: number) =>
        buildPropRelief(kit, { width: w, height: ph, flushEdges: false, depth: relief, coarse: PROP_COARSE });
      const d = await panel(door, length, h);
      const b = await panel(inside, length, h);
      const s = await panel(side, depth, h);
      const t = await panel(top, length, depth);
      if (!d || !b || !s || !t) return null;
      const inset = 0.006;
      // the door (and its inside), the back wall's inside
      face(d.geometry, door, [0, h / 2, depth / 2], [0, 0]);
      face(d.geometry, door, [0, h / 2, depth / 2], [0, Math.PI], true);
      face(b.geometry, inside, [0, h / 2, -depth / 2 + inset], [0, 0]);
      // the sides, outside and in; the roof, outside and in
      face(s.geometry, side, [length / 2, h / 2, 0], [0, Math.PI / 2]);
      face(s.geometry, side, [-length / 2, h / 2, 0], [0, -Math.PI / 2], true);
      face(s.geometry, side, [length / 2 - inset, h / 2, 0], [0, -Math.PI / 2], true);
      face(s.geometry, side, [-length / 2 + inset, h / 2, 0], [0, Math.PI / 2]);
      face(t.geometry, top, [0, h, 0], [-Math.PI / 2, 0]);
      face(t.geometry, top, [0, h - inset, 0], [Math.PI / 2, 0]);
      // a pane of glass just behind the door's frame
      const glassGeo = new THREE.PlaneGeometry(length, h);
      geometries.push(glassGeo);
      const glass = new THREE.Mesh(glassGeo, cabinGlass);
      glass.position.set(0, h / 2, depth / 2 - 0.012);
      template.add(glass);
      return template;
    }

    if (type.kind === "roof") {
      // Flat triangles at 45 degrees (and flat stretches) in the wall set's
      // diffuse and normal maps, repeating along the slope - no relief
      // geometry (see roofKitFor and roofMesh.ts); the thick edge and the
      // underside have the plain texture
      const kit = roofKitFor(type.texture ?? primarySet);
      kit.normal = type.normal;
      const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
      kit.wallMat.normalScale.set(normal, normal);
      const { top, under } = buildRoofGeometry(type.profile, type.corner, type.eaves);
      geometries.push(top, under);
      template.add(new THREE.Mesh(top, kit.wallMat), new THREE.Mesh(under, kit.sideMat));
      return template;
    }
    if (type.kind === "pillar" || type.kind === "chamfer" || type.kind === "fence") return null;
    const [front, side, top] = propSets(type, primarySet).map((id) => propKitFor(id));
    // What each view covers (see PropType's px): at one pixel scale -
    // the front view's across the prop's length - standing on the floor,
    // centered, or for a wall prop starting at the wall (-z); without px,
    // the prop's own extent
    const px = type.kind === "views" ? type.px : undefined;
    const scale = px ? length / px.front[0] : 0;
    const frontY = px ? px.front[1] * scale : height;
    const sideY = px ? px.side[1] * scale : height;
    const sideZ = px ? px.side[0] * scale : depth;
    const topX = px ? px.top[0] * scale : length;
    const topZ = px ? px.top[1] * scale : depth;
    const zFrom = (extent: number) => (type.wall ? -depth / 2 : -extent / 2);
    const clampRange = ([a, b]: [number, number]): [number, number] => {
      const lo = Math.min(1, Math.max(0, a));
      return [lo, Math.max(lo + 1e-3, Math.min(1, b))];
    };
    // the whole views first: their builds give the kits their AO maps
    for (const [kit, w, h] of [
      [front, length, frontY * wallHeight],
      [side, sideZ, sideY * wallHeight],
      [top, topX, topZ],
    ] as const) {
      if (!(await buildPropRelief(kit, { width: w, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE }))) return null;
    }
    const cut = (kit: WallKit, w: number, h: number, cols: [number, number], rows: [number, number]) =>
      buildPropRelief(kit, {
        width: w,
        height: h,
        flushEdges: false,
        depth: relief,
        coarse: PROP_COARSE,
        cols: clampRange(cols),
        rows: clampRange(rows),
      });
    const lift = (type.kind === "views" ? (type.elevation ?? 0) : 0) * wallHeight;
    const sideZ0 = zFrom(sideZ);
    const topZ0 = zFrom(topZ);
    // where a point shows in each view (image 0..1, rows down) - for a
    // part whose views show it elsewhere (PropPart.src), the part's box
    // stretched onto that place
    const views = {
      front: (x: number, y: number): [number, number] => [(x + length / 2) / length, (frontY - y) / frontY],
      // (the side view runs from the front (+z) on its left to the back)
      side: (z: number, y: number): [number, number] => [(sideZ0 + sideZ - z) / sideZ, (sideY - y) / sideY],
      top: (x: number, z: number): [number, number] => [(x + topX / 2) / topX, (z - topZ0) / topZ],
    };
    for (const part of type.parts) {
      const { min, max } = part;
      const [x0, y0, z0] = min;
      const [x1, y1, z1] = max;
      const off = new Set(part.off ?? []);
      // a coordinate of the part on `axis`, moved onto its place in a view
      const inView = (view: PropView, axis: 0 | 1 | 2, v: number) => {
        const src = part.src?.[view];
        if (!src || max[axis] === min[axis]) return v;
        return src.min[axis] + ((v - min[axis]) / (max[axis] - min[axis])) * (src.max[axis] - src.min[axis]);
      };
      if (part.shape === "cylinder") {
        addCylinder(part, off, inView);
        continue;
      }
      const cx = (x0 + x1) / 2;
      const cy = ((y0 + y1) / 2) * wallHeight + lift;
      const cz = (z0 + z1) / 2;
      const h = (y1 - y0) * wallHeight;
      const span = (a: [number, number], b: [number, number]): [[number, number], [number, number]] => [
        [Math.min(a[0], b[0]), Math.max(a[0], b[0])],
        [Math.min(a[1], b[1]), Math.max(a[1], b[1])],
      ];
      const [alongX, frontRows] = span(
        views.front(inView("front", 0, x0), inView("front", 1, y0)),
        views.front(inView("front", 0, x1), inView("front", 1, y1)),
      );
      const [alongZ, sideRows] = span(
        views.side(inView("side", 2, z0), inView("side", 1, y0)),
        views.side(inView("side", 2, z1), inView("side", 1, y1)),
      );
      const [topCols, topRows] = span(
        views.top(inView("top", 0, x0), inView("top", 2, z0)),
        views.top(inView("top", 0, x1), inView("top", 2, z1)),
      );
      const f = off.has("front") && off.has("back") ? null : await cut(front, x1 - x0, h, alongX, frontRows);
      const s = off.has("right") && off.has("left") ? null : await cut(side, z1 - z0, h, alongZ, sideRows);
      const t = off.has("top") ? null : await cut(top, x1 - x0, z1 - z0, topCols, topRows);
      // the back and the -x end show their views mirrored
      if (f && !off.has("front")) face(f.geometry, front, [cx, cy, z1], [0, 0]);
      if (f && !off.has("back")) face(f.geometry, front, [cx, cy, z0], [0, Math.PI], true);
      if (s && !off.has("right")) face(s.geometry, side, [x1, cy, cz], [0, Math.PI / 2]);
      if (s && !off.has("left")) face(s.geometry, side, [x0, cy, cz], [0, -Math.PI / 2], true);
      if (!t) continue;
      // a top hidden under a part above it would show that part's top
      // view (a table's foot wearing its top's wood): left out
      const covered = type.parts.some(
        (o) => o.min[1] >= y1 && o.min[0] <= x0 && o.max[0] >= x1 && o.min[2] <= z0 && o.max[2] >= z1,
      );
      if (!covered) face(t.geometry, top, [cx, y1 * wallHeight + lift, cz], [-Math.PI / 2, 0]);
    }
    return template;

    // A round part: an upright cylinder (elliptic, filling its box) with
    // no relief, its side's every strip textured from the view that looks
    // at it - the front view on its front and back quarters, the side view
    // on its ends - and its top from the top view, all projected straight
    // through as the views were drawn
    function addCylinder(part: PropPart, off: Set<PropFace>, inView: (view: PropView, axis: 0 | 1 | 2, v: number) => number) {
      const [x0, y0, z0] = part.min;
      const [x1, y1, z1] = part.max;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const rx = (x1 - x0) / 2;
      const rz = (z1 - z0) / 2;
      const ya = y0 * wallHeight + lift;
      const yb = y1 * wallHeight + lift;
      const uv = ([u, v]: [number, number]): [number, number] => [Math.min(1, Math.max(0, u)), 1 - Math.min(1, Math.max(0, v))];
      const frontUV = (x: number, y: number) => uv(views.front(inView("front", 0, x), inView("front", 1, y)));
      const sideUV = (z: number, y: number) => uv(views.side(inView("side", 2, z), inView("side", 1, y)));
      const topUV = (x: number, z: number) => uv(views.top(inView("top", 0, x), inView("top", 2, z)));
      const strips = { front: { pos: [] as number[], uv: [] as number[] }, side: { pos: [] as number[], uv: [] as number[] } };
      const at = (a: number): [number, number] => [cx + rx * Math.sin(a), cz + rz * Math.cos(a)];
      for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
        const a0 = (k / CYLINDER_SEGMENTS) * Math.PI * 2;
        const a1 = ((k + 1) / CYLINDER_SEGMENTS) * Math.PI * 2;
        const mid = (a0 + a1) / 2;
        // (which quarter it faces: +z front, -z back, +x right, -x left)
        const facing: PropFace = Math.abs(Math.cos(mid)) >= Math.abs(Math.sin(mid)) ? (Math.cos(mid) > 0 ? "front" : "back") : Math.sin(mid) > 0 ? "right" : "left";
        if (off.has(facing)) continue;
        const ends = facing === "right" || facing === "left";
        const strip = ends ? strips.side : strips.front;
        const [p0x, p0z] = at(a0);
        const [p1x, p1z] = at(a1);
        const tex = (x: number, z: number, y: number) => (ends ? sideUV(z, y / wallHeight) : frontUV(x, y / wallHeight));
        const corners: [number, number, number][] = [
          [p0x, ya - lift, p0z],
          [p1x, ya - lift, p1z],
          [p1x, yb - lift, p1z],
          [p0x, yb - lift, p0z],
        ];
        // (two triangles, counter-clockwise seen from outside)
        for (const i of [0, 1, 2, 0, 2, 3]) {
          const [x, y, z] = corners[i];
          strip.pos.push(x, y + lift, z);
          strip.uv.push(...tex(x, z, y));
        }
      }
      const mesh = (pos: number[], uvs: number[], kit: WallKit) => {
        if (!pos.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geo.computeVertexNormals();
        geometries.push(geo);
        template.add(new THREE.Mesh(geo, roundMaterial(kit)));
      };
      mesh(strips.front.pos, strips.front.uv, front);
      mesh(strips.side.pos, strips.side.uv, side);
      // the top: a fan round its middle (unless a part above covers it)
      const covered = type.kind === "views" && type.parts.some(
        (o) => o !== part && o.min[1] >= y1 && o.min[0] <= x0 && o.max[0] >= x1 && o.min[2] <= z0 && o.max[2] >= z1,
      );
      if (off.has("top") || covered) return;
      const pos: number[] = [];
      const uvs: number[] = [];
      for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
        const [p0x, p0z] = at((k / CYLINDER_SEGMENTS) * Math.PI * 2);
        const [p1x, p1z] = at(((k + 1) / CYLINDER_SEGMENTS) * Math.PI * 2);
        for (const [x, z] of [
          [cx, cz],
          [p0x, p0z],
          [p1x, p1z],
        ] as const) {
          pos.push(x, yb, z);
          uvs.push(...topUV(x, z));
        }
      }
      mesh(pos, uvs, top);
    }
  }
  // a round part's sides: no relief, so the view's see-through pixels cut
  // it out here, and it's seen from inside too (through those)
  const CYLINDER_SEGMENTS = 24;
  const roundMaterials = new Map<WallKit, THREE.MeshStandardMaterial>();
  function roundMaterial(kit: WallKit): THREE.MeshStandardMaterial {
    let mat = roundMaterials.get(kit);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: kit.wallMat.map,
        normalMap: kit.wallMat.normalMap,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: settingsRef.current.roughness,
        metalness: settingsRef.current.metalness,
      });
      mat.userData.normal = kit.normal;
      mat.userData.tuneId = kit.id;
      const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
      mat.normalScale.set(normal, normal);
      addDirectLightOcclusion(mat, cavity);
      useLightGrid(mat, lightGrid);
      ownMaterials.push(mat);
      roundMaterials.set(kit, mat);
    }
    return mat;
  }

  function dispose() {
    shadows.dispose();
    for (const mat of billboardMaterials) mat.dispose();
    roundMaterials.clear();
  }

  return { buildFence, buildPropTemplate, dispose };
}
