import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import type { DecalSpec } from "../game/types";
import { coplanarSurfaces, surfaceFrame, surfaceKey } from "./surfaces";

// Projected decals: each decal's texture is projected along the surface
// normal onto the actual (relief) geometry with three.js DecalGeometry, so
// paint and damage follow the voxel steps instead of floating in front of
// them. A decal overhanging its panel also lands on the coplanar
// neighboring panels, so e.g. a long stencil runs across several wall
// cells as one piece.

// pixels per cell across a surface texture - decals share the walls' pixel
// density, so a 32px decal covers an eighth of a panel
const SURFACE_PIXELS = 256;
// the projection box's depth: comfortably more than the relief's depth,
// either side of the panel plane
const DECAL_DEPTH = 0.2;

interface DecalManifestEntry {
  normal: boolean;
}

interface DecalAsset {
  material: THREE.MeshStandardMaterial;
  // image size in surface pixels
  width: number;
  height: number;
}

interface Projection {
  decal: string;
  key: string;
  position: THREE.Vector3;
  orientation: THREE.Euler;
  size: THREE.Vector3;
  material: THREE.MeshStandardMaterial;
}

export class DecalLibrary {
  private manifest: Promise<Record<string, DecalManifestEntry>>;
  private assets = new Map<string, Promise<DecalAsset>>();
  private surfaces = new Map<string, THREE.Mesh>();
  private pending: Projection[] = [];
  // surface keys each decal landed on (for debugging)
  readonly built: { decal: string; key: string; triangles: number }[] = [];
  private disposables: { dispose(): void }[] = [];
  private disposed = false;

  constructor(
    private opts: {
      baseUrl: string;
      // cache-busting query appended to file URLs ("" for none)
      bust: string;
      loader: THREE.TextureLoader;
      wallHeight: number;
      parent: THREE.Object3D;
    },
  ) {
    this.manifest = fetch(`${opts.baseUrl}decals/index.json${opts.bust}`).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(`decal manifest: ${r.status}`)),
    );
  }

  // queue decals; each is built as soon as its asset has loaded and the
  // surfaces it lands on exist
  add(specs: DecalSpec[]) {
    for (const spec of specs) {
      this.asset(spec.decal)
        .then((asset) => {
          if (this.disposed) return;
          this.pending.push(...this.projections(spec, asset));
          this.flush();
        })
        .catch((err) => console.warn(`Decal "${spec.decal}" skipped:`, err));
    }
  }

  // a surface panel has been placed in the scene
  registerSurface(key: string, mesh: THREE.Mesh) {
    this.surfaces.set(key, mesh);
    this.flush();
  }

  dispose() {
    this.disposed = true;
    for (const d of this.disposables) d.dispose();
  }

  private asset(name: string): Promise<DecalAsset> {
    let asset = this.assets.get(name);
    if (!asset) {
      asset = this.manifest.then(async (manifest) => {
        const entry = manifest[name];
        if (!entry) throw new Error("not in public/decals/index.json");
        const { baseUrl, bust, loader } = this.opts;
        const dir = `${baseUrl}decals/${name}/`;
        const map = await loader.loadAsync(`${dir}diffuse.png${bust}`);
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = THREE.NearestFilter;
        const normalMap = entry.normal ? await loader.loadAsync(`${dir}normal.png${bust}`) : null;
        if (normalMap) normalMap.magFilter = THREE.NearestFilter;
        const material = new THREE.MeshStandardMaterial({
          map,
          normalMap,
          // crisp pixel edges, no transparency sorting
          alphaTest: 0.5,
          // pull the decal in front of the surface it was cut from
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
          roughness: 0.75,
          metalness: 0.15,
        });
        this.disposables.push(material, map);
        if (normalMap) this.disposables.push(normalMap);
        return { material, width: map.image.width, height: map.image.height };
      });
      this.assets.set(name, asset);
    }
    return asset;
  }

  // the projector for a decal, and every surface it may land on
  private projections(spec: DecalSpec, asset: DecalAsset): Projection[] {
    const frame = surfaceFrame(spec.cell, spec.surface, this.opts.wallHeight);
    const texelW = frame.width / SURFACE_PIXELS;
    const texelH = frame.height / SURFACE_PIXELS;
    const w = asset.width * texelW;
    const h = asset.height * texelH;

    // decal center in panel coordinates: centered on the origin, +Y up,
    // pixel row 0 at the top
    const center = new THREE.Vector3(
      -frame.width / 2 + (spec.x + asset.width / 2) * texelW,
      frame.height / 2 - (spec.y + asset.height / 2) * texelH,
      0,
    );
    const position = center.applyQuaternion(frame.quaternion).add(frame.position);
    // spec rotation is clockwise as seen looking at the surface
    const spin = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      (-(spec.rotation ?? 0) * Math.PI) / 180,
    );
    const orientation = new THREE.Euler().setFromQuaternion(frame.quaternion.clone().multiply(spin));
    const size = new THREE.Vector3(w, h, DECAL_DEPTH);

    const reach = Math.ceil(Math.hypot(w, h));
    return coplanarSurfaces(spec.cell, spec.surface, reach).map((cell) => ({
      decal: spec.decal,
      key: surfaceKey(cell, spec.surface),
      position,
      orientation,
      size,
      material: asset.material,
    }));
  }

  private flush() {
    if (this.disposed) return;
    this.pending = this.pending.filter((p) => {
      const mesh = this.surfaces.get(p.key);
      if (!mesh) return true;
      mesh.updateWorldMatrix(true, false);
      const geometry = new DecalGeometry(mesh, p.position, p.orientation, p.size);
      if (geometry.getAttribute("position").count === 0) {
        // this neighbor is out of the decal's reach after all
        geometry.dispose();
      } else {
        this.disposables.push(geometry);
        this.opts.parent.add(new THREE.Mesh(geometry, p.material));
        this.built.push({ decal: p.decal, key: p.key, triangles: geometry.getAttribute("position").count / 3 });
      }
      return false;
    });
  }
}
