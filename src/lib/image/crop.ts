export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Clamp a rectangle to the image bounds and round to integer pixels. */
export function clampRect(r: Rect, maxW: number, maxH: number): Rect {
  const x = Math.max(0, Math.min(r.x, maxW - 1))
  const y = Math.max(0, Math.min(r.y, maxH - 1))
  const w = Math.max(1, Math.min(r.w, maxW - x))
  const h = Math.max(1, Math.min(r.h, maxH - y))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

/** Normalize a rectangle defined by two corner points into x/y/w/h. */
export function rectFromPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  }
}
