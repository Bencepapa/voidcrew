import * as THREE from "three";
import type { createSmokeFire } from "./smokeFire";

interface FrameDebugDeps {
  doorPreview: boolean;
  renderFrame: () => void;
  getSightCells: () => Set<string>;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group<THREE.Object3DEventMap>;
  renderer: THREE.WebGLRenderer;
  smokeFire: Pick<ReturnType<typeof createSmokeFire>, "getSmoke">;
}

export function createFrameDebug(deps: FrameDebugDeps) {
  const { doorPreview, renderFrame, getSightCells, camera, group, renderer, smokeFire } = deps;
  // dev-only: render a frame on demand and return it as an image, for the
  // voidcrew.capture() console helper - works even when the browser has
  // paused requestAnimationFrame (hidden tab/pane)
  const snapshot = () => {
    // a hidden page lays the view out at ~0x0; render captures at a fixed
    // size then, and put the real size back afterwards
    const size = renderer.getSize(new THREE.Vector2());
    const tiny = size.x < 16 || size.y < 16;
    if (tiny) {
      renderer.setSize(800, 600, false);
      camera.aspect = 800 / 600;
      camera.updateProjectionMatrix();
    }
    renderFrame();
    const url = renderer.domElement.toDataURL("image/jpeg", 0.9);
    if (tiny) {
      renderer.setSize(size.x, size.y, false);
      camera.aspect = size.x / size.y;
      camera.updateProjectionMatrix();
    }
    return url;
  };
  // dev-only: render a frame on demand and report what it drew
  const renderInfo = () => {
    snapshot();
    return { ...renderer.info.render, cellsInSight: getSightCells().size, objects: group.children.length };
  };
  // dev-only: how long a frame takes (ms; the median of `frames`, each
  // waited out on the graphics card) at a given size, with the smoke drawn
  // and without - and how long moving its puffs takes alone
  const bench = (frames = 120, width = 1280, height = 720) => {
    const size = renderer.getSize(new THREE.Vector2());
    const ratio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    const run = (withSmoke: boolean) => {
      const times: number[] = [];
      smokeFire.getSmoke().mesh.visible = withSmoke;
      for (let i = 0; i < frames + 10; i++) {
        const start = performance.now();
        renderFrame();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (i >= 10) times.push(performance.now() - start);
      }
      smokeFire.getSmoke().mesh.visible = true;
      times.sort((a, b) => a - b);
      return times[times.length >> 1];
    };
    const withSmoke = run(true);
    const without = run(false);
    const again = run(true);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) smokeFire.getSmoke().update(0, camera, getSightCells(), 0.3);
    const update = (performance.now() - start) / 1000;
    const geometry = smokeFire.getSmoke().mesh.geometry;
    const puffs = geometry instanceof THREE.InstancedBufferGeometry ? geometry.instanceCount : 0;
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.x, size.y, false);
    if (size.x > 0 && size.y > 0) {
      camera.aspect = size.x / size.y;
      camera.updateProjectionMatrix();
    }
    return { withSmoke, without, again, update, puffs, calls: renderer.info.render.calls };
  };
  if (import.meta.env.DEV && !doorPreview) {
    Object.assign(window, { __voidcrewSnapshot: snapshot, __voidcrewRenderInfo: renderInfo, __voidcrewScene: group, __voidcrewBench: bench });
  }
  function dispose() {
    const w = window as { __voidcrewSnapshot?: () => string };
    if (w.__voidcrewSnapshot === snapshot) delete w.__voidcrewSnapshot;
  }
  return { dispose };
}
