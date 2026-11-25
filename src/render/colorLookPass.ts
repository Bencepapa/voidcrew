import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { ColorLookShader } from "./colorLookShader";
import { LUT_SIZE, buildLut, gradeKey, type ColorGrade } from "./colorGrade";
import type { ResolvedLook } from "../game/look";

// The colour look as a composer pass: owns the lookup texture, builds it again (at most every
// REBUILD_MS, so a slider drag stays smooth) when the grade changes, and sets the strength live.
// The scene is never rebuilt for a look. See colorGrade.ts and colorLookShader.ts.

const REBUILD_MS = 100;

export interface ColorLookPass {
  pass: ShaderPass;
  // Takes the look of the moment (null: none); returns whether the pass has anything to do.
  apply(look: ResolvedLook | null): boolean;
  dispose(): void;
}

// the table as a half-float 3D texture: filtered in hardware in WebGL 2 with no extension, and
// without the 8-bit steps a byte table would put in a smooth gradient
function makeTexture(grade: ColorGrade): THREE.Data3DTexture {
  const floats = buildLut(grade, LUT_SIZE);
  const half = new Uint16Array(floats.length);
  for (let i = 0; i < floats.length; i++) half[i] = THREE.DataUtils.toHalfFloat(floats[i]);
  const texture = new THREE.Data3DTexture(half, LUT_SIZE, LUT_SIZE, LUT_SIZE);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.HalfFloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createColorLookPass(): ColorLookPass {
  const pass = new ShaderPass(ColorLookShader);
  pass.enabled = false;
  pass.uniforms.uSize.value = LUT_SIZE;
  let texture: THREE.Data3DTexture | null = null;
  let builtKey = "";
  let builtAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wanted: ColorGrade | null = null;

  function build(grade: ColorGrade) {
    const next = makeTexture(grade);
    pass.uniforms.tLut.value = next;
    texture?.dispose();
    texture = next;
    builtKey = gradeKey(grade);
    builtAt = performance.now();
  }

  return {
    pass,
    apply(look) {
      if (!look) {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        pass.enabled = false;
        return false;
      }
      pass.uniforms.uStrength.value = look.strength;
      wanted = look.grade;
      const key = gradeKey(look.grade);
      if (!texture) {
        build(look.grade);
      } else if (key !== builtKey && timer === undefined) {
        // the next table once the last one is REBUILD_MS old (the newest grade by then)
        const wait = Math.max(0, REBUILD_MS - (performance.now() - builtAt));
        timer = setTimeout(() => {
          timer = undefined;
          if (wanted && gradeKey(wanted) !== builtKey) build(wanted);
        }, wait);
      }
      pass.enabled = true;
      return true;
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      texture?.dispose();
      texture = null;
      pass.dispose();
    },
  };
}
