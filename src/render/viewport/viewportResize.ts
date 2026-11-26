import type { PerspectiveCamera, WebGLRenderer } from "three";
import { verticalFov } from "./camera";

export function observeViewportSize(
  container: HTMLElement,
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  getFov: () => number,
) {

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = verticalFov(getFov(), camera.aspect);
    camera.updateProjectionMatrix();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  return () => resizeObserver.disconnect();
}
