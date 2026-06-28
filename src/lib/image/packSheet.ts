import { anchorOffset, type Anchor } from './canvasResize'

export interface FrameSize {
  w: number
  h: number
}

export interface Placement {
  index: number
  col: number
  row: number
  /** Top-left of the frame inside the sheet, after anchoring within its cell. */
  drawX: number
  drawY: number
  w: number
  h: number
}

export interface SheetLayout {
  cols: number
  rows: number
  cellW: number
  cellH: number
  sheetW: number
  sheetH: number
  placements: Placement[]
}

/**
 * Compute a uniform-cell sprite-sheet layout. Every cell is sized to the
 * largest frame, and each frame is anchored within its cell. Pure function.
 */
export function computeLayout(
  frames: FrameSize[],
  cols: number,
  padding: number,
  margin: number,
  anchor: Anchor,
): SheetLayout {
  const n = frames.length
  if (n === 0) {
    return { cols: 1, rows: 0, cellW: 0, cellH: 0, sheetW: 0, sheetH: 0, placements: [] }
  }
  const c = Math.max(1, Math.floor(cols))
  const rows = Math.ceil(n / c)
  const cellW = Math.max(...frames.map((f) => f.w))
  const cellH = Math.max(...frames.map((f) => f.h))
  const sheetW = margin * 2 + c * cellW + (c - 1) * padding
  const sheetH = margin * 2 + rows * cellH + (rows - 1) * padding

  const placements: Placement[] = frames.map((f, i) => {
    const col = i % c
    const row = Math.floor(i / c)
    const cellX = margin + col * (cellW + padding)
    const cellY = margin + row * (cellH + padding)
    const [ox, oy] = anchorOffset(anchor, cellW, cellH, f.w, f.h)
    return { index: i, col, row, drawX: cellX + ox, drawY: cellY + oy, w: f.w, h: f.h }
  })

  return { cols: c, rows, cellW, cellH, sheetW, sheetH, placements }
}
