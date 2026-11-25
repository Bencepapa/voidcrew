import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createLookResolver, type ResolvedLook } from "../../game/look";
import type { GameMap } from "../../game/types";
import { WORLDS } from "../../game/worlds";
import { createColorLookPass, type ColorLookPass } from "../colorLookPass";
import { DarkFantasyShader, updateDarkFantasyUniforms } from "../darkFantasyShader";
import { geometryViewMaterial } from "./materials";
import type { GeometryViewId, ViewportSettings } from "./settings";

interface PostPipelineContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  settingsRef: { readonly current: ViewportSettings };
  latestMapRef: { readonly current: GameMap };
}

export function createPostPipeline({ renderer, scene, camera, settingsRef, latestMapRef }: PostPipelineContext) {
  const cutoutFaceMaterials = new Map<THREE.Material, THREE.MeshNormalMaterial>();
  function cutoutFaceMaterial(material: THREE.Material): THREE.Material {
    const { map } = material as THREE.MeshStandardMaterial;
    if (!map || !material.alphaTest) return material;
    let faces = cutoutFaceMaterials.get(material);
    if (!faces) {
      // MeshNormalMaterial has no diffuse map. Keep just the alpha mask so
      // the geometry view shows the same silhouette as the textured view.
      faces = new THREE.MeshNormalMaterial({ side: material.side });
      faces.allowOverride = false;
      faces.onBeforeCompile = (shader) => {
        if (map.matrixAutoUpdate) map.updateMatrix();
        shader.uniforms.cutoutMap = { value: map };
        shader.uniforms.cutoutTransform = { value: map.matrix };
        shader.uniforms.cutoutThreshold = { value: material.alphaTest };
        shader.vertexShader = shader.vertexShader
          .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nvarying vec2 cutoutUv;\nuniform mat3 cutoutTransform;")
          .replace("#include <uv_vertex>", "#include <uv_vertex>\ncutoutUv = (cutoutTransform * vec3(uv, 1.0)).xy;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <uv_pars_fragment>", "#include <uv_pars_fragment>\nvarying vec2 cutoutUv;\nuniform sampler2D cutoutMap;\nuniform float cutoutThreshold;")
          .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (texture2D(cutoutMap, cutoutUv).a < cutoutThreshold) discard;");
      };
      cutoutFaceMaterials.set(material, faces);
    }
    return faces;
  }
  // The optional post-processes: the scene into a half-float target (MSAA when antialiasing is on), the
  // output pass (tone mapping, sRGB), then the map's colour look (a LUT, see colorLookPass.ts), then the
  // dark fantasy colour pass last, to the screen; a pass that isn't on is skipped. Textured view only, and
  // only when one of the two is on: otherwise the scene is drawn straight to the screen as ever.
  let post: { composer: EffectComposer; pass: ShaderPass; look: ColorLookPass; ratio: number; w: number; h: number } | null = null;
  const resolveLook = createLookResolver();
  // the colour look to draw now: the map's own, else its world's default (null: none, or switched off)
  function currentLook(s: ViewportSettings): ResolvedLook | null {
    if (s.postLookOff) return null;
    const m = latestMapRef.current;
    return resolveLook(m.look, WORLDS[m.world]?.defaultLook);
  }
  function renderPost(s: ViewportSettings, look: ResolvedLook | null) {
    const size = renderer.getSize(new THREE.Vector2());
    const ratio = renderer.getPixelRatio();
    if (!post) {
      const target = new THREE.WebGLRenderTarget(size.x * ratio, size.y * ratio, { type: THREE.HalfFloatType, samples: s.antialias ? 4 : 0 });
      const composer = new EffectComposer(renderer, target);
      composer.setPixelRatio(ratio);
      composer.setSize(size.x, size.y);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new OutputPass());
      const lookPass = createColorLookPass();
      composer.addPass(lookPass.pass);
      const pass = new ShaderPass(DarkFantasyShader);
      composer.addPass(pass);
      post = { composer, pass, look: lookPass, ratio, w: size.x, h: size.y };
    } else if (post.ratio !== ratio || post.w !== size.x || post.h !== size.y) {
      post.composer.setPixelRatio(ratio);
      post.composer.setSize(size.x, size.y);
      post.ratio = ratio;
      post.w = size.x;
      post.h = size.y;
    }
    const u = post.pass.uniforms;
    updateDarkFantasyUniforms(u, s);
    post.pass.enabled = s.postDark;
    post.look.apply(look);
    post.composer.render();
  }
  function renderGeometryView(view: GeometryViewId) {
    scene.overrideMaterial = geometryViewMaterial(view);
    if (view === "textured") {
      const look = currentLook(settingsRef.current);
      if (settingsRef.current.postDark || look) {
        renderPost(settingsRef.current, look);
        return;
      }
    }
    if (view !== "faces") {
      renderer.render(scene, camera);
      return;
    }
    const originals: { mesh: THREE.Mesh; material: THREE.Mesh["material"] }[] = [];
    scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material;
      const replacement = Array.isArray(material)
        ? material.some((face) => face.alphaTest) ? material.map(cutoutFaceMaterial) : material
        : cutoutFaceMaterial(material);
      if (replacement === material) return;
      originals.push({ mesh, material });
      mesh.material = replacement;
    });
    try {
      renderer.render(scene, camera);
    } finally {
      for (const { mesh, material } of originals) mesh.material = material;
    }
  }

  function dispose() {
    post?.composer.dispose();
    post?.look.dispose();
    post = null;
  }

  // Released with the scene materials, after the composer.
  function disposeFaceMaterials() {
    for (const mat of cutoutFaceMaterials.values()) mat.dispose();
  }

  return { renderGeometryView, dispose, disposeFaceMaterials };
}
