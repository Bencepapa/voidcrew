// Run: npx tsx src/game/skyImage.test.ts
import assert from "node:assert/strict";
import {
  isSharedSkyId, makeSeamless, neighbourDifference, seamDifference, seamReport, skyIssues, skyOptions, skySource,
  SKY_MAX_WIDTH, SKY_MIN_WIDTH, type RgbaImage,
} from "./skyImage";

const uuid = "0b8c1f6e-1111-4222-8333-444455556666";

// ids: a shared sky has its own type in the id; built-in names and other shared kinds are not skies
assert.equal(isSharedSkyId(`fantasy_sky_${uuid}`), true);
assert.equal(isSharedSkyId(`scifi_sky_${uuid}`), true);
assert.equal(isSharedSkyId("nappal"), false);
assert.equal(isSharedSkyId(`fantasy_decal_${uuid}`), false);
assert.equal(isSharedSkyId(`fantasy_sky_${uuid}x`), false);
assert.equal(isSharedSkyId(`fantasy_sky_${uuid}/../x`), false);
assert.equal(isSharedSkyId(undefined), false);
assert.equal(isSharedSkyId({}), false);

// size rules: 2:1, width 1024..4096; 1.8..2.2 only warns
const codes = (width: number, height: number) => {
  const { errors, warnings } = skyIssues(width, height);
  return { errors: errors.map(i => i.code), warnings: warnings.map(i => i.code) };
};
assert.deepEqual(codes(2048, 1024), { errors: [], warnings: [] });
assert.deepEqual(codes(1536, 768), { errors: [], warnings: [] });
assert.deepEqual(codes(SKY_MIN_WIDTH, 512), { errors: [], warnings: [] });
assert.deepEqual(codes(SKY_MAX_WIDTH, 2048), { errors: [], warnings: [] });
assert.deepEqual(codes(2048, 1000), { errors: [], warnings: [] }, "2.048 is still 2:1");
assert.deepEqual(codes(2048, 1100), { errors: [], warnings: ["aspectOff"] }, "1.86 warns");
assert.deepEqual(codes(2048, 900), { errors: ["badAspect"], warnings: [] }, "2.28 is out of the warn band: refused");
assert.deepEqual(codes(2048, 950), { errors: [], warnings: ["aspectOff"] }, "2.16 warns");
assert.deepEqual(codes(2000, 1000), { errors: [], warnings: [] });
assert.deepEqual(codes(2200, 1000), { errors: [], warnings: ["aspectOff"] });
assert.deepEqual(codes(2048, 2048), { errors: ["badAspect"], warnings: [] }, "a square is refused");
assert.deepEqual(codes(4096, 1024), { errors: ["badAspect"], warnings: [] }, "4:1 is refused");
assert.deepEqual(codes(512, 256), { errors: ["tooNarrow"], warnings: [] });
assert.deepEqual(codes(8192, 4096), { errors: ["tooWide"], warnings: [] });
assert.deepEqual(codes(0, 0).errors, ["tooNarrow"]);
assert.deepEqual(codes(NaN, 10).errors, ["tooNarrow"]);
assert.equal(skyIssues(2048, 2048).errors[0].params.ratio, 1);
assert.equal(skyIssues(2048, 1100).warnings[0].params.ratio, 1.86);

// pictures for the seam tests: a horizontal gradient (every column differs a little from its neighbour)
function picture(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = pixel(x, y);
    data.set([r, g, b, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
const W = 200, H = 6;
// a gradient that is the same at both ends (a cosine): a perfect wrap
const wrapped = picture(W, H, (x, y) => [Math.round(128 + 100 * Math.cos((2 * Math.PI * x) / W)), 100 + y, 60]);
// a ramp from dark to light: the right edge is far from the left edge
const ramp = picture(W, H, (x, y) => [Math.round((255 * x) / (W - 1)), 120 + y, 60]);

assert.ok(seamDifference(wrapped) < 3, "a wrapping picture has no jump");
assert.ok(seamReport(wrapped).ok);
assert.ok(Math.abs(seamDifference(ramp) - 255 / 3) < 0.01, "only the red channel differs by 255: 85 per channel on average");
assert.ok(neighbourDifference(ramp) < 3, "the ramp itself is smooth");
assert.equal(seamReport(ramp).ok, false);
assert.ok(seamReport(ramp).tolerance >= 6);

// a plain colour: no baseline at all, the floor is what counts
const flat = picture(64, 4, () => [10, 20, 30]);
assert.equal(seamReport(flat).baseline, 0);
assert.equal(seamReport(flat).ok, true);
const small = picture(64, 4, x => [x < 32 ? 10 : 18, 20, 30]);
assert.equal(seamReport({ ...small, data: small.data }).ok, true, "a difference under the floor is not a seam: 8/3 per channel");

// make seamless: the edges become identical, the middle is untouched, the size is the same
const fixed = makeSeamless(ramp);
assert.equal(fixed.length, ramp.data.length);
const fixedImage: RgbaImage = { width: W, height: H, data: fixed };
assert.equal(seamDifference(fixedImage), 0, "the join is exact");
assert.equal(seamReport(fixedImage).ok, true);
const band = Math.round(W * 0.08);
for (let y = 0; y < H; y++) for (let x = band; x < W - band; x++) {
  for (let c = 0; c < 4; c++) assert.equal(fixed[(y * W + x) * 4 + c], ramp.data[(y * W + x) * 4 + c], "the middle is not touched");
}
// the very edge is half of each side's colour (red: 0 on the left, 255 on the right -> 128 after rounding)
assert.equal(fixed[0], Math.round(255 / 2));
assert.equal(fixed[(W - 1) * 4], Math.round(255 / 2));
// nothing is changed beyond the band, and the input was not modified
assert.equal(ramp.data[0], 0);
// fixing an already seamless picture keeps it seamless
assert.equal(seamDifference({ width: W, height: H, data: makeSeamless(wrapped) }), 0);
// a tiny picture does not break (bands never overlap)
const tiny = picture(3, 2, x => [x * 100, 0, 0]);
const tinyFixed: RgbaImage = { width: 3, height: 2, data: makeSeamless(tiny) };
assert.equal(seamDifference(tinyFixed), 0);
assert.equal(makeSeamless(picture(1, 1, () => [5, 5, 5])).length, 4);
// alpha is mixed like the colours (an opaque sky stays opaque)
assert.equal(fixed[3], 255);

// where the picture comes from
const none = () => undefined;
assert.deepEqual(skySource("nappal", "/voidcrew/", "?v=3", none), { kind: "url", url: "/voidcrew/skies/nappal.png?v=3" });
assert.deepEqual(skySource(`fantasy_sky_${uuid}`, "/", "?v=3", none), { kind: "pending", id: `fantasy_sky_${uuid}` });
assert.deepEqual(skySource(`fantasy_sky_${uuid}`, "/", "?v=3", id => `https://store/${id}/r2/diffuse.png`),
  { kind: "url", url: `https://store/fantasy_sky_${uuid}/r2/diffuse.png` }, "a shared revision url is used as it is");
assert.deepEqual(skySource(`fantasy_sky_${uuid}`, "/", "", id => `/voidcrew/shared-images/${id}.webp`),
  { kind: "url", url: `/voidcrew/shared-images/fantasy_sky_${uuid}.webp` }, "a bundled sky is a local file, maybe a webp");

// the chooser: generated, built-in, then the world's shared skies by name
const shared = [
  { id: `fantasy_sky_${uuid}`, name: "Viharos", world: "fantasy", url: "https://x/a.png" },
  { id: `fantasy_sky_${uuid.replace("0b8c", "1b8c")}`, name: "Alkony", world: "fantasy", url: "https://x/b.png" },
  { id: `scifi_sky_${uuid}`, name: "Nebula", world: "scifi", url: "https://x/c.png" },
];
const base = { builtins: ["ejszaka", "nappal"], shared, world: "fantasy", baseUrl: "/", generatedLabel: "generated", missingLabel: (id: string) => `missing ${id}` };
let options = skyOptions({ ...base, current: undefined });
assert.deepEqual(options.map(o => o.label), ["generated", "ejszaka", "nappal", "Alkony", "Viharos"]);
assert.equal(options[1].image, "/skies/ejszaka.png");
assert.equal(options[3].image, "https://x/b.png");
// a chosen sky of another world stays listed; a chosen one that is not loaded shows as missing
options = skyOptions({ ...base, current: `scifi_sky_${uuid}` });
assert.ok(options.some(o => o.label === "Nebula"));
const ghost = `fantasy_sky_${uuid.replace("0b8c", "2b8c")}`;
options = skyOptions({ ...base, current: ghost });
assert.equal(options.at(-1)?.label, `missing ${ghost}`);
// a built-in name that is no longer in the list is kept too
assert.equal(skyOptions({ ...base, current: "gone" }).at(-1)?.value, "gone");
assert.equal(skyOptions({ ...base, current: "nappal" }).length, 5, "a listed choice is not doubled");

console.log("skyImage tests passed");
