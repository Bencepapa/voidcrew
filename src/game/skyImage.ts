// A map's sky picture: a built-in name (public/skies/<name>.png) or a shared sky id (`<world>_sky_<uuid>`, uploaded in
// the Assets manager). Pure (no DOM, no network): the renderer, the editors, `npm run pull:shared` and the tests share it.
//
// The format the shader expects (GameViewport makeSkyMaterial):
//   - a 2:1 panorama (equirectangular, upper hemisphere only): recommended 2048 x 1024;
//   - the BOTTOM edge is the horizon, the TOP row the zenith (straight up);
//   - the left and right edges wrap around (360 degrees), so they must join without a visible seam;
//   - no colour conversion: the pixel values are shown as they are.

const UUID = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const SKY_ID = new RegExp(`^(?:fantasy|scifi)_sky_${UUID}$`);

/** Is this `textures.sky` value a shared (uploaded) sky, rather than a name in public/skies/? */
export const isSharedSkyId = (value: unknown): value is string => typeof value === "string" && SKY_ID.test(value);

export const SKY_MIN_WIDTH = 1024;
export const SKY_MAX_WIDTH = 4096;
export const SKY_RECOMMENDED = { width: 2048, height: 1024 } as const;
// width / height: 2 is the format; this much off only warns, more is refused
export const SKY_ASPECT = 2;
export const SKY_ASPECT_WARN = { min: 1.8, max: 2.2 } as const;
const SKY_ASPECT_OK = { min: 1.95, max: 2.05 } as const;

export interface SkyIssue {
  code: "tooNarrow" | "tooWide" | "badAspect" | "aspectOff";
  params: Record<string, string | number>;
}

/** What is wrong with a picture of this size as a sky: errors keep it from being used, warnings only say so. */
export function skyIssues(width: number, height: number): { errors: SkyIssue[]; warnings: SkyIssue[] } {
  const errors: SkyIssue[] = [];
  const warnings: SkyIssue[] = [];
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { errors: [{ code: "tooNarrow", params: { min: SKY_MIN_WIDTH, width: 0 } }], warnings };
  }
  if (width < SKY_MIN_WIDTH) errors.push({ code: "tooNarrow", params: { min: SKY_MIN_WIDTH, width } });
  if (width > SKY_MAX_WIDTH) errors.push({ code: "tooWide", params: { max: SKY_MAX_WIDTH, width } });
  const ratio = width / height;
  const shown = Math.round(ratio * 100) / 100;
  if (ratio < SKY_ASPECT_WARN.min || ratio > SKY_ASPECT_WARN.max) errors.push({ code: "badAspect", params: { ratio: shown } });
  else if (ratio < SKY_ASPECT_OK.min || ratio > SKY_ASPECT_OK.max) warnings.push({ code: "aspectOff", params: { ratio: shown } });
  return { errors, warnings };
}

// ---- the seam: the left and right edge columns meet when the sky wraps around ----

/** RGBA pixels, row by row (an ImageData has this shape). */
export interface RgbaImage { width: number; height: number; data: ArrayLike<number> }

const columnGap = (image: RgbaImage, a: number, b: number) => {
  const { width, height, data } = image;
  let sum = 0;
  for (let y = 0; y < height; y++) {
    const i = (y * width + a) * 4;
    const j = (y * width + b) * 4;
    sum += Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
  }
  return sum / (height * 3);
};

/** The mean colour difference (0..255, per channel) between the last and the first column: the jump at the seam. */
export const seamDifference = (image: RgbaImage): number => image.width < 2 ? 0 : columnGap(image, image.width - 1, 0);

/** The mean difference between neighbouring columns inside the picture (a few places spread across it): what a
 *  natural join looks like in this picture. */
export function neighbourDifference(image: RgbaImage): number {
  const { width } = image;
  if (width < 4) return 0;
  const spots = Math.min(16, width - 2);
  let sum = 0;
  for (let k = 1; k <= spots; k++) {
    const x = Math.min(width - 2, Math.max(0, Math.round((k * width) / (spots + 1))));
    sum += columnGap(image, x, x + 1);
  }
  return sum / spots;
}

// A join is fine when it is no worse than a small floor or a couple of times the picture's own column-to-column change
export const SEAM_FLOOR = 6;
export const SEAM_FACTOR = 2.5;

export interface SeamReport { seam: number; baseline: number; tolerance: number; ok: boolean }

export function seamReport(image: RgbaImage): SeamReport {
  const seam = seamDifference(image);
  const baseline = neighbourDifference(image);
  const tolerance = Math.max(SEAM_FLOOR, baseline * SEAM_FACTOR);
  return { seam, baseline, tolerance, ok: seam <= tolerance };
}

/** The share of the width at each edge that "make seamless" blends. */
export const SEAM_BAND = 0.08;

/**
 * Makes the left and right edges join: a mirror blend. In the band at each edge (8% of the width) every column is
 * mixed with the mirrored column of the OTHER edge, the mix going from half-and-half at the very edge to the
 * picture's own colours at the band's inner side. The two edge columns end up identical (the join is exact) and the
 * rest of the picture is untouched; the price is a mirrored, slightly ghosted band at each edge. Returns new RGBA
 * pixels; the size does not change.
 */
export function makeSeamless(image: RgbaImage, fraction: number = SEAM_BAND): Uint8ClampedArray {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i++) out[i] = data[i];
  const band = Math.max(1, Math.min(Math.floor(width / 2), Math.round(width * fraction)));
  if (width < 2) return out;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < band; x++) {
      // the share of the column's own colour: 1/2 at the edge, to 1 at the inner side of the band
      const own = 0.5 + 0.5 * (x / band);
      const left = row + x * 4;
      const right = row + (width - 1 - x) * 4;
      for (let c = 0; c < 4; c++) {
        out[left + c] = Math.round(data[left + c] * own + data[right + c] * (1 - own));
        out[right + c] = Math.round(data[right + c] * own + data[left + c] * (1 - own));
      }
    }
  }
  return out;
}

// ---- where the picture comes from ----

export type SkySource =
  | { kind: "url"; url: string }
  // a shared sky whose picture is not registered (loaded) yet
  | { kind: "pending"; id: string };

/**
 * The picture of a map's `textures.sky`: a built-in name is the file in public/skies/ (with the cache-buster); a
 * shared sky id is the url of its registered picture (a shared store revision folder never changes, so no buster).
 */
export function skySource(name: string, baseUrl: string, bust: string, sharedUrl: (id: string) => string | undefined): SkySource {
  if (!isSharedSkyId(name)) return { kind: "url", url: `${baseUrl}skies/${name}.png${bust}` };
  const url = sharedUrl(name);
  return url ? { kind: "url", url } : { kind: "pending", id: name };
}

export interface SkyOption { value: string; label: string; image?: string }

/**
 * The sky chooser's rows: the generated starry sky, the built-in names, then the shared skies of the map's world (a
 * chosen one of another world, or one not loaded yet, is kept so the choice does not vanish).
 */
export function skyOptions(input: {
  builtins: readonly string[];
  shared: readonly { id: string; name: string; world: string; url: string }[];
  world: string;
  current: string | undefined;
  baseUrl: string;
  generatedLabel: string;
  missingLabel: (id: string) => string;
}): SkyOption[] {
  const { builtins, shared, world, current, baseUrl } = input;
  const rows: SkyOption[] = [{ value: "", label: input.generatedLabel }];
  for (const name of builtins) rows.push({ value: name, label: name, image: `${baseUrl}skies/${name}.png` });
  const mine = shared
    .filter(image => image.world === world || image.id === current)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const image of mine) rows.push({ value: image.id, label: image.name, image: image.url });
  if (current && !rows.some(row => row.value === current)) rows.push({ value: current, label: input.missingLabel(current) });
  return rows;
}
