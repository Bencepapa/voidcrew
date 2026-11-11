import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import type { DecalSpec, Vec2 } from "../game/types";
import { coplanarSurfaces, surfaceFrame, surfaceKey } from "./surfaces";
import type { CellLevels } from "./surfaces";

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
// Decals overlapping on one surface would fight over the same depth: each
// is pulled forward a little more than the one before it in the map's list
// (so the later one shows on top), up to this many steps.
const DECAL_LAYERS = 64;
const LAYER_UNITS = 3;

interface DecalManifestEntry {
  normal: boolean;
  // wet and glossy: lights glint on it like on standing water (a puddle)
  water?: boolean;
}

// how many lights standing water glints with
const WATER_LIGHTS = 8;

interface DecalAsset {
  material: THREE.Material;
  // image size in surface pixels
  width: number;
  height: number;
  // standing water: a flat sheet above the floor, not painted onto its bumps
  water: boolean;
}

interface Projection {
  decal: string;
  // its spec's place in the list given to add() (the map's decals)
  index: number;
  // DecalSpec.action
  action?: string;
  water: boolean;
  key: string;
  position: THREE.Vector3;
  orientation: THREE.Euler;
  size: THREE.Vector3;
  material: THREE.Material;
}

export function fetchDecalManifest(baseUrl: string, bust: string): Promise<Record<string, DecalManifestEntry>> {
  return fetch(`${baseUrl}decals/index.json${bust}`).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(`decal manifest: ${r.status}`)),
  );
}

export class DecalLibrary {
  private manifest: Promise<Record<string, DecalManifestEntry>>;
  private assets = new Map<string, Promise<DecalAsset>>();
  // each decal's material at its layer (see DECAL_LAYERS), by "name|layer"
  private layered = new Map<string, THREE.Material>();
  // a surface can be several meshes (a tall wall's stacked panels), and they
  // may arrive at different times (each relief variant builds on its own)
  private surfaces = new Map<string, THREE.Mesh[]>();
  private projections = new Map<string, Projection[]>();
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
      // textures shared with other libraries, loaded once (whoever owns the
      // map disposes them); without it each library loads and disposes its
      // own
      textureCache?: Map<string, Promise<THREE.Texture>>;
      // projected decal geometry shared with other libraries (by surface
      // geometry, its placement and the decal's), built once - whoever owns
      // the map disposes it; null: the decal missed that panel
      geometryCache?: Map<string, THREE.BufferGeometry | null>;
      // the manifest (public/decals/index.json), if already fetched
      manifest?: Promise<Record<string, DecalManifestEntry>>;
      wallHeight: number;
      // world heights of a cell's floor and ceiling
      levels: (cell: Vec2) => CellLevels;
      // how far above a floor standing water lies (above its relief's bumps)
      waterLift?: number;
      parent: THREE.Object3D;
    },
  ) {
    this.manifest = opts.manifest ?? fetchDecalManifest(opts.baseUrl, opts.bust);
  }

  // queue decals; each lands on its surfaces as soon as its asset has loaded
  // and they exist
  // (resolves once every decal's asset is in and it's on the surfaces there
  // are so far)
  add(specs: DecalSpec[]): Promise<void> {
    const loads = specs.map((spec, index) =>
      this.asset(spec.decal)
        .then((asset) => {
          if (this.disposed) return;
          for (const p of this.project(spec, asset, index)) {
            const list = this.projections.get(p.key) ?? [];
            list.push(p);
            this.projections.set(p.key, list);
            for (const mesh of this.surfaces.get(p.key) ?? []) this.build(p, mesh);
          }
        })
        .catch((err) => console.warn(`Decal "${spec.decal}" skipped:`, err)),
    );
    return Promise.all(loads).then(() => undefined);
  }

  // a surface panel has been placed in the scene
  registerSurface(key: string, mesh: THREE.Mesh) {
    if (this.disposed) return;
    const list = this.surfaces.get(key) ?? [];
    list.push(mesh);
    this.surfaces.set(key, list);
    for (const p of this.projections.get(key) ?? []) this.build(p, mesh);
  }

  dispose() {
    this.disposed = true;
    for (const d of this.disposables) d.dispose();
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    const cache = this.opts.textureCache;
    if (!cache) {
      return this.opts.loader.loadAsync(url).then((tex) => {
        this.disposables.push(tex);
        return tex;
      });
    }
    let tex = cache.get(url);
    if (!tex) {
      tex = this.opts.loader.loadAsync(url);
      cache.set(url, tex);
      tex.catch(() => cache.delete(url));
    }
    return tex;
  }

  private asset(name: string): Promise<DecalAsset> {
    let asset = this.assets.get(name);
    if (!asset) {
      asset = this.manifest.then(async (manifest) => {
        const entry = manifest[name];
        if (!entry) throw new Error("not in public/decals/index.json");
        const { baseUrl, bust } = this.opts;
        const dir = `${baseUrl}decals/${name}/`;
        const map = await this.loadTexture(`${dir}diffuse.png${bust}`);
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = THREE.NearestFilter;
        const normalMap = entry.normal ? await this.loadTexture(`${dir}normal.png${bust}`) : null;
        if (normalMap) normalMap.magFilter = THREE.NearestFilter;
        const material: THREE.Material = entry.water
          ? this.waterMaterial(map)
          : new THREE.MeshStandardMaterial({
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
        this.disposables.push(material);
        const image = map.image as { width: number; height: number };
        return { material, width: image.width, height: image.height, water: !!entry.water };
      });
      this.assets.set(name, asset);
    }
    return asset;
  }

  // the projector for a decal, and every surface it may land on
  private project(spec: DecalSpec, asset: DecalAsset, index: number): Projection[] {
    const frame = surfaceFrame(spec.cell, spec.surface, this.opts.wallHeight, this.opts.levels(spec.cell));
    const texelW = frame.width / SURFACE_PIXELS;
    const texelH = frame.height / SURFACE_PIXELS;
    // (its scale grows it about its middle)
    const scale = spec.scale ?? 1;
    const w = asset.width * texelW * scale;
    const h = asset.height * texelH * scale;

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
      index,
      action: spec.action,
      water: asset.water && spec.surface === "floor",
      key: surfaceKey(cell, spec.surface),
      position,
      orientation,
      size,
      material: this.layer(spec.decal, asset.material, index),
    }));
  }

  // The lights standing water glints with (see setWaterLights), and the clock
  // that ripples it: shared by every puddle's material.
  readonly waterUniforms = {
    uLights: { value: Array.from({ length: WATER_LIGHTS }, () => new THREE.Vector3()) },
    uColors: { value: Array.from({ length: WATER_LIGHTS }, () => new THREE.Vector3()) },
    uCount: { value: 0 },
    uTime: { value: 0 },
    // the sky it mirrors (an equirectangular image), and how much of it
    uSky: { value: new THREE.DataTexture(new Uint8Array([8, 10, 24, 255]), 1, 1) as THREE.Texture },
    uSkyAmount: { value: 0 },
  };

  // the sky the water mirrors (null: none - a dungeon's puddles only catch
  // the lights)
  setWaterSky(sky: THREE.Texture | null) {
    if (sky) this.waterUniforms.uSky.value = sky;
    this.waterUniforms.uSkyAmount.value = sky ? 1 : 0;
  }

  // the lights a puddle reflects: world positions, colors, strengths (the
  // nearest few, as many as the shader takes)
  setWaterLights(lights: { x: number; y: number; z: number; color: number; intensity: number }[]) {
    const u = this.waterUniforms;
    const n = Math.min(WATER_LIGHTS, lights.length);
    for (let i = 0; i < n; i++) {
      const l = lights[i];
      u.uLights.value[i].set(l.x, l.y, l.z);
      const c = new THREE.Color(l.color);
      u.uColors.value[i].set(c.r * l.intensity, c.g * l.intensity, c.b * l.intensity);
    }
    u.uCount.value = n;
  }

  // Standing water: the puddle's picture, lit by the lights around it (with a
  // soft glow), its surface rippling a little, and each light a bright glint
  // where it would mirror toward the eye - the glints slide as you move.
  private waterMaterial(map: THREE.Texture): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, ...this.waterUniforms },
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      vertexShader: `
        varying vec3 vWorld;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 uLights[${WATER_LIGHTS}];
        uniform vec3 uColors[${WATER_LIGHTS}];
        uniform int uCount;
        uniform float uTime;
        uniform sampler2D uSky;
        uniform float uSkyAmount;
        varying vec3 vWorld;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(map, vUv);
          if (base.a < 0.5) discard;
          vec3 V = normalize(cameraPosition - vWorld);
          // a restless surface: two slow cross ripples tilt the normal a little
          vec2 p = vWorld.xz * 11.0;
          vec3 N = normalize(vec3(
            0.016 * sin(p.x * 1.3 + uTime * 1.2) + 0.011 * sin(p.y * 2.1 - uTime * 0.9),
            1.0,
            0.016 * cos(p.y * 1.1 + uTime * 1.0) + 0.011 * cos(p.x * 1.9 - uTime * 0.7)));
          vec3 diffuse = vec3(0.0);
          vec3 glint = vec3(0.0);
          for (int i = 0; i < ${WATER_LIGHTS}; i++) {
            if (i >= uCount) break;
            vec3 toLight = uLights[i] - vWorld;
            float dist = length(toLight);
            vec3 L = toLight / dist;
            float atten = 1.0 / (1.0 + dist * dist * 0.7);
            diffuse += uColors[i] * max(dot(N, L), 0.0) * atten;
            vec3 H = normalize(L + V);
            // the light mirrored in the water: a tight, bright streak
            glint += uColors[i] * pow(max(dot(N, H), 0.0), 700.0) * atten * 2.0;
          }
          // Mirroring: the more slanted the view, the more the water reflects
          // (Schlick's fresnel, water's 2% head on) - the sky, where there is
          // one, else a faint warm sheen of the room
          float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          vec2 skyUv = vec2(atan(R.z, R.x) / 6.2831853 + 0.5, clamp(asin(clamp(R.y, -1.0, 1.0)) / 1.5707963, 0.0, 1.0));
          vec3 sky = texture2D(uSky, skyUv).rgb * 1.6;
          vec3 mirror = mix(vec3(0.1, 0.085, 0.075), sky, uSkyAmount);
          vec3 lit = base.rgb * (0.32 + diffuse * 1.1);
          // (a mirror of the open sky shows even head on, a little)
          float reflectance = min(1.0, fresnel * 1.6 + 0.18 * uSkyAmount);
          vec3 color = mix(lit, mirror, reflectance) + glint;
          gl_FragColor = vec4(color, 1.0);
        }`,
    });
  }

  // a decal's material pulled forward as far as its place in the list says
  private layer(name: string, base: THREE.Material, index: number): THREE.Material {
    // (water is a shader of its own, all of it sharing one set of light uniforms)
    if (base instanceof THREE.ShaderMaterial) return base;
    const std = base as THREE.MeshStandardMaterial;
    const layer = Math.min(index, DECAL_LAYERS - 1);
    const key = `${name}|${layer}`;
    let material = this.layered.get(key);
    if (!material) {
      material = std.clone();
      (material as THREE.MeshStandardMaterial).polygonOffsetUnits = std.polygonOffsetUnits - layer * LAYER_UNITS;
      this.layered.set(key, material);
      this.disposables.push(material);
    }
    return material;
  }

  // the water sheets made so far (one per decal, whatever floors it reaches)
  private sheets = new Set<number>();
  // every mesh put in the scene, to take out again (see reset)
  private meshes: THREE.Object3D[] = [];

  // show or hide every decal (the editor's layer toggle)
  setVisible(visible: boolean) {
    this.visibleNow = visible;
    for (const mesh of this.meshes) mesh.visible = visible;
  }
  private visibleNow = true;

  // The map's decals changed (one put in, moved, taken out): all of them redone
  // on the surfaces already in the scene. Unchanged ones come out of the
  // geometry cache, so only what's new costs anything.
  reset(specs: DecalSpec[]) {
    for (const mesh of this.meshes) this.opts.parent.remove(mesh);
    this.meshes = [];
    this.projections.clear();
    this.built.length = 0;
    this.sheets.clear();
    return this.add(specs);
  }

  private build(p: Projection, mesh: THREE.Mesh) {
    if (p.water) {
      // Standing water is level: one flat sheet over the whole puddle, just
      // above the floor's highest bumps, instead of a skin that follows them
      if (this.sheets.has(p.index)) return;
      this.sheets.add(p.index);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(p.size.x, p.size.y), p.material);
      this.disposables.push(sheet.geometry);
      sheet.rotation.copy(p.orientation);
      const up = new THREE.Vector3(0, 0, 1).applyEuler(p.orientation);
      sheet.position.copy(p.position).addScaledVector(up, this.opts.waterLift ?? 0.02);
      sheet.userData.decalIndex = p.index;
      sheet.visible = this.visibleNow;
      this.opts.parent.add(sheet);
      this.meshes.push(sheet);
      this.built.push({ decal: p.decal, key: p.key, triangles: 2 });
      return;
    }
    mesh.updateWorldMatrix(true, false);
    const cache = this.opts.geometryCache;
    const key = cache
      ? [
          mesh.geometry.uuid,
          mesh.matrixWorld.elements.map((v) => v.toFixed(4)).join(","),
          p.position.toArray().map((v) => v.toFixed(4)).join(","),
          p.orientation.toArray().slice(0, 3).map((v) => (v as number).toFixed(4)).join(","),
          p.size.toArray().map((v) => v.toFixed(4)).join(","),
        ].join("|")
      : "";
    let geometry = cache?.get(key);
    if (geometry === undefined) {
      geometry = new DecalGeometry(mesh, p.position, p.orientation, p.size);
      if (geometry.getAttribute("position").count === 0) {
        // this panel is out of the decal's reach after all
        geometry.dispose();
        geometry = null;
      }
      if (cache) cache.set(key, geometry);
      else if (geometry) this.disposables.push(geometry);
    }
    if (!geometry) return;
    const triangles = geometry.getAttribute("position").count / 3;
    const decal = new THREE.Mesh(geometry, p.material);
    // an interactive decal: the viewport finds it by this when touched
    if (p.action) decal.userData.action = p.action;
    // the map editor picks it by this
    decal.userData.decalIndex = p.index;
    decal.visible = this.visibleNow;
    this.opts.parent.add(decal);
    this.meshes.push(decal);
    this.built.push({ decal: p.decal, key: p.key, triangles });
  }
}
