import assert from "node:assert/strict";
import { cleanRenderLook, pickRender } from "../../game/renderLook";
import { SKY_CEILING, SKY_FACE } from "../bakeOcclusion";
import { skyLightOf, skySurfaceMask, type SkyBakeMap } from "./skyBakeInputs";

const map: SkyBakeMap = {
  width: 3, height: 1, cells: [["floor", "floor", "wall"]],
  textures: { ceiling: "sky" },
  ceilingTextureAt: (x) => x === 1 ? "stone" : undefined,
};
assert.deepEqual(
  skySurfaceMask(map, (x, _z, side) => x === 1 && side === "E"),
  Uint8Array.of(SKY_CEILING, SKY_FACE.E, 0),
);
assert.equal(skySurfaceMask({ ...map, textures: undefined }, () => true), undefined);

const settings = { skyLightIntensity: 0, skyDomeIntensity: 0.45, skyLightAzimuth: 42, skyLightElevation: 35, skyLightColor: "#123456" };
assert.deepEqual(skyLightOf(settings, true), {
  intensity: 0, domeIntensity: 0.45, azimuth: 42, elevation: 35, color: 0x123456, quick: true,
});
assert.equal(skyLightOf({ ...settings, skyDomeIntensity: 0 }, false), undefined);
assert.equal(skyLightOf({ ...settings, skyLightIntensity: 1, skyDomeIntensity: 0 }, false)?.intensity, 3);
assert.deepEqual(cleanRenderLook(pickRender({ ...settings, skyDomeIntensity: 0 }, settings)), { skyDomeIntensity: 0 });
