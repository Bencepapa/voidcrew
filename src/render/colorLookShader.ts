import * as THREE from "three";

// The colour look pass (see colorGrade.ts, colorLookPass.ts): every pixel of the finished,
// display-referred picture (after tone mapping and the sRGB output pass) is looked up in a 3D table
// of graded colours, with a hardware-filtered texture read. `uStrength` mixes the result with the
// plain picture. A tiny noise (about one 8-bit step) breaks up the banding smooth gradients get
// when the picture ends in an 8-bit canvas.
// It runs after the output pass and before the dark fantasy pass.
export const ColorLookShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tLut: { value: null as THREE.Data3DTexture | null },
    uStrength: { value: 1 },
    uSize: { value: 32 },
    uDither: { value: 1 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  // (a ShaderMaterial is compiled as GLSL ES 3.00 in WebGL 2 - three puts the precision of
  // sampler3D and the texture2D / gl_FragColor names in place - so texture() on a sampler3D works)
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler3D tLut;
    uniform float uStrength;
    uniform float uSize;
    uniform float uDither;
    varying vec2 vUv;

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 color = clamp(src.rgb, 0.0, 1.0);
      // the table's entries sit at texel centres: the first colour at half a texel in
      vec3 coord = color * ((uSize - 1.0) / uSize) + 0.5 / uSize;
      vec3 graded = texture(tLut, coord).rgb;
      vec3 result = mix(color, graded, uStrength);
      // interleaved gradient noise, one 8-bit step peak to peak
      float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      result += (noise - 0.5) * (uDither / 255.0);
      gl_FragColor = vec4(result, src.a);
    }
  `,
};
