import * as THREE from "three";
import { type Interaction } from "../../game/interactions";

export function eventMarkerMaterial(kind: Interaction["kind"]): THREE.SpriteMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = kind === "message" ? "#244665" : "#68451f";
  ctx.strokeStyle = kind === "message" ? "#91daff" : "#ffd481";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(5, 5, 54, 47, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(kind === "message" ? "!" : "▣", 32, 31);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map, depthWrite: false, fog: false, toneMapped: false });
}

// an exit's floor marker: a green frame with chevrons and EXIT - a gate to
// another map (see mapLinks.ts) is amber, and says GATE
export function makeExitMarker(gate = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = ctx.fillStyle = gate ? "#ffcf5d" : "#5dffa0";
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.lineWidth = 6;
  ctx.lineJoin = "miter";
  for (const y of [34, 50]) {
    ctx.beginPath();
    ctx.moveTo(40, y + 12);
    ctx.lineTo(64, y - 6);
    ctx.lineTo(88, y + 12);
    ctx.stroke();
  }
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText(gate ? "GATE" : "EXIT", 64, 102);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// a staircase's floor marker (see StairsSpec): steps rising (up, cyan) or
// sinking (down, violet) with an arrow above them - or, for a spiral, a spiral
// turning up or down - and UP / DOWN
export function makeStairsMarker(up: boolean, spiral: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = ctx.fillStyle = up ? "#7fd8ff" : "#d6a8ff";
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.lineWidth = 6;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  if (spiral) {
    // (a spiral winding out from the middle; its arrowhead says which way it turns)
    const turn = up ? 1 : -1;
    let x = 64;
    let y = 52;
    for (let a = 0; a <= 4.4; a += 0.08) {
      x = 64 + Math.cos(a * turn - Math.PI / 2) * (4 + a * 6);
      y = 52 + Math.sin(a * turn - Math.PI / 2) * (4 + a * 6);
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // (four steps; up they rise to the right, down to the left)
    for (let i = 0; i < 4; i++) {
      const x = up ? 30 + i * 17 : 98 - i * 17;
      const y = 78 - i * 11;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      ctx.lineTo(x, y - 11);
      ctx.lineTo(x + (up ? 17 : -17), y - 11);
    }
    ctx.stroke();
  }
  ctx.font = "bold 24px monospace";
  ctx.textAlign = "center";
  ctx.fillText(up ? "UP" : "DOWN", 64, 104);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// a chalk cross over a whole texture, a few rough strokes (the mark on an
// emptied container)
export function drawChalkCross(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.lineCap = "round";
  const unit = Math.min(w, h) / 128;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 3 * unit;
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? "rgba(250, 248, 240, 0.95)" : "rgba(235, 232, 222, 0.55)";
      ctx.lineWidth = (pass ? 4 : 8) * unit;
      ctx.beginPath();
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + rand();
        const y = y0 + (y1 - y0) * t + rand();
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
  stroke(w * 0.2, h * 0.18, w * 0.8, h * 0.8);
  stroke(w * 0.8, h * 0.2, w * 0.22, h * 0.82);
  ctx.restore();
}
