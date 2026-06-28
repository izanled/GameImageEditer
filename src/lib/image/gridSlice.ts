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
 *
 * `margin` is the empty border around the whole grid; `spacing` is the gap
 * between cells. Both default to 0 (contiguous, borderless tiling).
 */
export function sliceByCount(
  imgW: number,
  imgH: number,
  cols: number,
  rows: number,
  margin = 0,
  spacing = 0,
): Cell[] {
  const cells: Cell[] = []
  const cellWf = (imgW - 2 * margin - (cols - 1) * spacing) / cols
  const cellHf = (imgH - 2 * margin - (rows - 1) * spacing) / rows
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const fx = margin + col * (cellWf + spacing)
      const fy = margin + row * (cellHf + spacing)
      const x = Math.round(fx)
      const y = Math.round(fy)
      const w = Math.round(fx + cellWf) - x
      const h = Math.round(fy + cellHf) - y
      cells.push({ col, row, x, y, w, h })
    }
  }
  return cells
}

/**
 * Split into fixed-size cells; edge cells are clipped to the image.
 *
 * `margin` offsets the first cell from the top-left; `spacing` is the gap
 * between cells. Both default to 0.
 */
export function sliceBySize(
  imgW: number,
  imgH: number,
  cellW: number,
  cellH: number,
  margin = 0,
  spacing = 0,
): Cell[] {
  const cells: Cell[] = []
  const stepX = cellW + spacing
  const stepY = cellH + spacing
  const cols = Math.max(1, Math.ceil((imgW - 2 * margin + spacing) / stepX))
  const rows = Math.max(1, Math.ceil((imgH - 2 * margin + spacing) / stepY))
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = margin + col * stepX
      const y = margin + row * stepY
      const w = Math.min(cellW, imgW - x)
      const h = Math.min(cellH, imgH - y)
      if (w <= 0 || h <= 0) continue
      cells.push({ col, row, x, y, w, h })
    }
  }
  return cells
}
