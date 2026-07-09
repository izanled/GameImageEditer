export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type CropEdge = 'left' | 'right' | 'top' | 'bottom'

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/** Clamp a rectangle to the image bounds and round to integer pixels. */
export function clampRect(r: Rect, maxW: number, maxH: number): Rect {
  const x = Math.max(0, Math.min(r.x, maxW - 1))
  const y = Math.max(0, Math.min(r.y, maxH - 1))
  const w = Math.max(1, Math.min(r.w, maxW - x))
  const h = Math.max(1, Math.min(r.h, maxH - y))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

/** Keep the requested size when possible by moving the rectangle back in-bounds. */
export function fitRect(r: Rect, maxW: number, maxH: number): Rect {
  const w = clampValue(Math.round(r.w), 1, maxW)
  const h = clampValue(Math.round(r.h), 1, maxH)
  const x = clampValue(Math.round(r.x), 0, Math.max(0, maxW - w))
  const y = clampValue(Math.round(r.y), 0, Math.max(0, maxH - h))
  return { x, y, w, h }
}

export function resizeRectEdge(
  r: Rect,
  edge: CropEdge,
  position: number,
  maxW: number,
  maxH: number,
): Rect {
  const pos = Math.round(position)
  const right = r.x + r.w
  const bottom = r.y + r.h

  switch (edge) {
    case 'left': {
      const x = clampValue(pos, 0, right - 1)
      return fitRect({ x, y: r.y, w: right - x, h: r.h }, maxW, maxH)
    }
    case 'right': {
      const nextRight = clampValue(pos, r.x + 1, maxW)
      return fitRect({ x: r.x, y: r.y, w: nextRight - r.x, h: r.h }, maxW, maxH)
    }
    case 'top': {
      const y = clampValue(pos, 0, bottom - 1)
      return fitRect({ x: r.x, y, w: r.w, h: bottom - y }, maxW, maxH)
    }
    case 'bottom': {
      const nextBottom = clampValue(pos, r.y + 1, maxH)
      return fitRect({ x: r.x, y: r.y, w: r.w, h: nextBottom - r.y }, maxW, maxH)
    }
  }
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
