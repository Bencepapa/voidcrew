import * as THREE from "three";
import { cleanSkyGradient } from "../../game/skyGradient";
import { isSharedSkyId, skySource } from "../../game/skyImage";
import type { GameMap } from "../../game/types";
import { onSharedImagesChanged, sharedImage } from "../sharedImages";
import { makeSkyGradientTexture, makeSkyMaterial } from "./sky";

interface SkySurfaceContext {
  map: GameMap;
  loader: THREE.TextureLoader;
  bust: string;
  setWaterSky(texture: THREE.Texture): void;
  isDisposed(): boolean;
}

export function createSkySurface({ map, loader, bust, setWaterSky, isDisposed }: SkySurfaceContext) {
  // the open sky: walls and ceilings of the "sky" set are panes that show the
  // starry sky (looked at from the camera, as if far away) - nothing else is
  // sky, so gaps between walls and the far distance stay black
  let skyMat: THREE.ShaderMaterial | null = null;
  // (a shared sky's picture that is not registered yet: this stops waiting for it)
  let stopSkyWait: (() => void) | null = null;
  const skySurface = () => {
    if (!skyMat) {
      const material = makeSkyMaterial();
      skyMat = material;
      // a gradient wins over the image name (the starry sky shows till one is in)
      const gradient = cleanSkyGradient(map.textures?.skyGradient);
      if (gradient) {
        const tex = makeSkyGradientTexture(gradient);
        (material.uniforms.map.value as THREE.Texture).dispose();
        material.uniforms.map.value = tex;
        material.uniforms.gradientMode.value = 1;
        setWaterSky(tex);
      }
      const name = gradient ? undefined : map.textures?.sky;
      if (name) {
        const loadSky = (url: string) => loader.load(
          url,
          (tex) => {
            if (isDisposed()) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.NoColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            (material.uniforms.map.value as THREE.Texture).dispose();
            material.uniforms.map.value = tex;
            setWaterSky(tex);
          },
          undefined,
          () => console.warn(`Sky "${name}" could not be loaded (${isSharedSkyId(name) ? "shared sky" : "public/skies/"})`),
        );
        // a built-in name is a file in public/skies/; a shared sky is its registered (or bundled) picture, which may
        // still be on its way: the starry sky shows till it is in (see game/skyImage.ts)
        const source = skySource(name, import.meta.env.BASE_URL, bust, (id) => sharedImage(id)?.url);
        if (source.kind === "url") loadSky(source.url);
        else {
          stopSkyWait = onSharedImagesChanged(() => {
            const url = sharedImage(source.id)?.url;
            if (!url || isDisposed()) return;
            stopSkyWait?.();
            stopSkyWait = null;
            loadSky(url);
          });
        }
      }
    }
    return skyMat;
  };

  // Unsubscribe before decals are disposed. The sky texture is released later.
  function stopWaiting() {
    stopSkyWait?.();
  }

  function dispose() {
    skyMat?.uniforms.map.value.dispose();
    skyMat?.dispose();
  }

  return { skySurface, getTexture: (): THREE.Texture | null => skyMat?.uniforms.map.value ?? null, stopWaiting, dispose };
}
