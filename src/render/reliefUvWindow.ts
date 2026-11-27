export type ReliefUvWindow = readonly [start: number, end: number];

export interface HeightGrid {
  width: number;
  height: number;
  // Row-major, with normalized heights and row zero at the top.
  data: Float32Array;
  // Absent when all cells are solid.
  solid?: Uint8Array;
}

export function windowU([start, end]: ReliefUvWindow, u: number): number {
  return start + (end - start) * Math.min(1, Math.max(0, u));
}

// Filter by coverage so the first and last cells stop at the exact UV
// bounds even when a face cuts through a source texel.
export function windowHeightGrid(grid: HeightGrid, window: ReliefUvWindow, coarse = 1): HeightGrid {
  if (coarse === 1 && window[0] === 0 && window[1] === 1) return grid;
  const columns = Math.ceil((window[1] - window[0]) * grid.width);
  const width = Math.max(1, Math.floor(columns / coarse));
  const height = Math.max(1, Math.floor(grid.height / coarse));
  const rowSize = grid.height / height;
  const data = new Float32Array(width * height);
  const solid = grid.solid ? new Uint8Array(data.length) : undefined;
  for (let x = 0; x < width; x++) {
    const left = windowU(window, x / width) * grid.width;
    const right = windowU(window, (x + 1) / width) * grid.width;
    for (let y = 0; y < height; y++) {
      const top = y * rowSize;
      const bottom = (y + 1) * rowSize;
      let sum = 0;
      let coverage = 0;
      for (let sy = Math.floor(top); sy < Math.min(grid.height, Math.ceil(bottom)); sy++) {
        const overlapY = Math.min(bottom, sy + 1) - Math.max(top, sy);
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const i = sy * grid.width + sx;
          if (grid.solid && !grid.solid[i]) continue;
          const overlapX = Math.min(right, sx + 1) - Math.max(left, sx);
          const overlap = overlapX * overlapY;
          sum += grid.data[i] * overlap;
          coverage += overlap;
        }
      }
      const i = y * width + x;
      data[i] = coverage ? sum / coverage : 0;
      if (solid) solid[i] = coverage * 2 >= (right - left) * rowSize ? 1 : 0;
    }
  }
  return { width, height, data, solid };
}
