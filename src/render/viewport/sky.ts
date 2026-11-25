import { skyGradientStops, type SkyGradient } from "../../game/skyGradient";
import * as THREE from "three";

// The starry sky behind open walls and ceilings (a map's "sky" texture set): a
// night gradient with a few hundred stars, drawn once as the scene's
// background (an equirectangular image, so it turns with the view and
// stays out of the fog and the far plane). Seeded, so it's the same sky
// every time.
function makeSkyTexture(): THREE.Texture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#02030a");
  gradient.addColorStop(0.55, "#0a1230");
  gradient.addColorStop(1, "#16203f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  let seed = 20240611;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 700; i++) {
    const x = Math.floor(random() * w);
    const y = Math.floor(random() * h * 0.85);
    const bright = 0.35 + random() * 0.65;
    const size = random() < 0.08 ? 2 : 1;
    ctx.fillStyle = `rgba(${Math.round(200 + 55 * random())}, ${Math.round(210 + 45 * random())}, 255, ${bright})`;
    ctx.fillRect(x, y, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  // (the shader below writes these values as they are: no color conversion)
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// A gradient sky needs no file: a narrow canvas, zenith at its top, horizon
// halfway down and the ground colour (when there is one) at its bottom.
export function makeSkyGradientTexture(spec: SkyGradient): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  for (const stop of skyGradientStops(spec)) gradient.addColorStop(stop.offset, stop.color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A pane of sky: it shows the sky image in the direction the camera looks
// through it, so panes next to each other join up and the sky stays far away
// whatever the pane's distance. Not lit, not fogged.
export function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: makeSkyTexture() }, gradientMode: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform float gradientMode;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float elevation = asin(clamp(dir.y, -1.0, 1.0));
        // the image covers the upper hemisphere (horizon at its bottom edge);
        // a gradient's canvas also has room below the horizon for its ground colour
        float v = gradientMode > 0.5 ? elevation / 3.14159265 + 0.5 : clamp(elevation / 1.5707963, 0.0, 1.0);
        vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, v);
        vec3 color = texture2D(map, uv).rgb;
        if (gradientMode > 0.5) {
          // the canvas colour is sRGB: undo the GPU's decode so the ramp shows its colours
          color = mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), color));
        }
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
}
