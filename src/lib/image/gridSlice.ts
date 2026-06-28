export interface Cell {
  col: number
  row: number
  x: number
  y: number
  w: number
  h: number
}

/**
 * Split into an exact cols x rows grid. Cell boundaries are rounded so the
 * cells tile the image with no gaps even when it doesn't divide evenly.
 */
export function sliceByCount(
  imgW: number,
  imgH: number,
  cols: number,
  rows: number,
): Cell[] {
  const cells: Cell[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round((col * imgW) / cols)
      const y = Math.round((row * imgH) / rows)
      const x2 = Math.round(((col + 1) * imgW) / cols)
      const y2 = Math.round(((row + 1) * imgH) / rows)
      cells.push({ col, row, x, y, w: x2 - x, h: y2 - y })
    }
  }
  return cells
}

/** Split into fixed-size cells; edge cells are clipped to the image. */
export function sliceBySize(
  imgW: number,
  imgH: number,
  cellW: number,
  cellH: number,
): Cell[] {
  const cells: Cell[] = []
  const cols = Math.ceil(imgW / cellW)
  const rows = Math.ceil(imgH / cellH)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW
      const y = row * cellH
      const w = Math.min(cellW, imgW - x)
      const h = Math.min(cellH, imgH - y)
      if (w <= 0 || h <= 0) continue
      cells.push({ col, row, x, y, w, h })
    }
  }
  return cells
}
