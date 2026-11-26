import * as THREE from "three";
import { probeColor, probeDirectionOffset, probePosition, type ProbeGrid } from "./probeDebugData";

function drawProbes(scene: THREE.Scene, grid: ProbeGrid) {
  const count = grid.nx * grid.ny * grid.nz;
  const geometry = new THREE.SphereGeometry(0.06, 8, 6);
  const material = new THREE.MeshBasicMaterial({ fog: false });
  material.allowOverride = false;
  const spheres = new THREE.InstancedMesh(geometry, material, count);
  spheres.raycast = () => {};
  const linePositions = grid.mode === "directional" ? new Float32Array(count * 6) : undefined;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    const { x, y, z } = probePosition(grid, index);
    const { r, g, b } = probeColor(grid, index);
    spheres.setMatrixAt(index, matrix.makeTranslation(x, y, z));
    spheres.setColorAt(index, color.setRGB(r, g, b));
    if (linePositions) {
      const offset = probeDirectionOffset(grid, index);
      const start = index * 6;
      linePositions[start] = x;
      linePositions[start + 1] = y;
      linePositions[start + 2] = z;
      linePositions[start + 3] = x + offset.x;
      linePositions[start + 4] = y + offset.y;
      linePositions[start + 5] = z + offset.z;
    }
  }
  scene.add(spheres);

  let lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined;
  if (linePositions) {
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ fog: false });
    lineMaterial.allowOverride = false;
    lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.raycast = () => {};
    scene.add(lines);
  }

  return () => {
    spheres.removeFromParent();
    spheres.dispose();
    geometry.dispose();
    material.dispose();
    if (lines) {
      lines.removeFromParent();
      lines.geometry.dispose();
      lines.material.dispose();
    }
  };
}

export function createProbeDebug(scene: THREE.Scene) {
  let drawnGrid: ProbeGrid | undefined;
  let remove: (() => void) | undefined;
  function update(grid?: ProbeGrid) {
    if (grid === drawnGrid) return;
    remove?.();
    remove = grid && drawProbes(scene, grid);
    drawnGrid = grid;
  }
  return { update, dispose: () => update() };
}
