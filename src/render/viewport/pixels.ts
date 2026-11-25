// an RGBA image turned 90 degrees clockwise (text reading top to bottom)
export function turnClockwise(img: { width: number; height: number; rgba: Uint8Array }) {
  const { width: w, height: h } = img;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // (x, y) -> (h - 1 - y, x) in the w-tall, h-wide result
      const src = (y * w + x) * 4;
      const dst = (x * h + (h - 1 - y)) * 4;
      rgba.set(img.rgba.subarray(src, src + 4), dst);
    }
  }
  return { width: h, height: w, rgba };
}
