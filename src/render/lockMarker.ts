import * as THREE from "three";

// The padlock drawn over a locked prop while the map is being edited (see game/propLocks.ts): a small amber sprite, like the
// event markers' (GameViewport's updateEventMarkers) but never picked - it is a sign, not a handle.

export function lockMarkerMaterial(): THREE.SpriteMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5a3d12";
  ctx.strokeStyle = "#ffd481";
  ctx.lineWidth = 4;
  // the shackle
  ctx.beginPath();
  ctx.arc(32, 25, 11, Math.PI, 0);
  ctx.lineTo(43, 33);
  ctx.moveTo(21, 25);
  ctx.lineTo(21, 33);
  ctx.stroke();
  // the body and the keyhole
  ctx.beginPath();
  ctx.roundRect(14, 31, 36, 27, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffd481";
  ctx.beginPath();
  ctx.arc(32, 42, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(30, 44, 4, 8);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map, depthWrite: false, fog: false, toneMapped: false });
}
