// A 5x7 pixel font (uppercase, digits, a few symbols) for stenciled text
// decals - generated text is always spelled right, unlike AI-drawn lettering.

export const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", "..#..", "..#.."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

type RGB = [number, number, number];

export function seededRandom(seedText: string): () => number {
  let seed = [...seedText].reduce((s, ch) => (Math.imul(s, 31) + ch.charCodeAt(0)) | 0, 17) & 0x7fffffff;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Stenciled, slightly worn text as RGBA: each font pixel becomes a
// `scale`-sized block, a few pixels get the darker shade (uneven paint) and
// some are knocked out (wear). "\n" starts a new line; lines are centered.
// `random` should be seeded for repeatable output.
export function renderText(
  text: string,
  scale: number,
  color: RGB,
  darker: RGB,
  wear: number,
  random: () => number,
): { width: number; height: number; rgba: Uint8Array } {
  const lines = text.toUpperCase().split("\n").map((line) => [...line]);
  const unknown = lines.flat().filter((ch) => !FONT[ch]);
  if (unknown.length) throw new Error(`no glyph for: ${[...new Set(unknown)].join(" ")}`);

  const gap = scale;
  const lineGap = 2 * scale;
  const lineWidth = (chars: string[]) => chars.length * 5 * scale + (chars.length - 1) * gap;
  const width = Math.max(...lines.map(lineWidth));
  const height = lines.length * 7 * scale + (lines.length - 1) * lineGap;
  const rgba = new Uint8Array(width * height * 4);
  lines.forEach((chars, li) => {
    const oy = li * (7 * scale + lineGap);
    const lineX = Math.floor((width - lineWidth(chars)) / 2);
    chars.forEach((ch, i) => {
      const ox = lineX + i * (5 * scale + gap);
      FONT[ch].forEach((row, gy) =>
        [...row].forEach((bit, gx) => {
          if (bit !== "#") return;
          for (let y = 0; y < scale; y++) {
            for (let x = 0; x < scale; x++) {
              if (random() < wear) continue;
              const [r, g, b] = random() < 0.12 ? darker : color;
              const o = ((oy + gy * scale + y) * width + ox + gx * scale + x) * 4;
              rgba[o] = r;
              rgba[o + 1] = g;
              rgba[o + 2] = b;
              rgba[o + 3] = 255;
            }
          }
        }),
      );
    });
  });
  return { width, height, rgba };
}
