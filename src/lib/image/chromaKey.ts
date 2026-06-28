export interface RGB {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

/** Average the four corner pixels — assumed to be the solid background. */
export function detectKeyColor(data: Uint8ClampedArray, w: number, h: number): RGB {
  const pts: Array<[number, number]> = [
    [1, 1],
    [w - 2, 1],
    [1, h - 2],
    [w - 2, h - 2],
  ]
  let r = 0
  let g = 0
  let b = 0
  for (const [x, y] of pts) {
    const i = (Math.max(0, y) * w + Math.max(0, x)) * 4
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  return { r: Math.round(r / 4), g: Math.round(g / 4), b: Math.round(b / 4) }
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/**
 * Remove a solid (chroma) background in place.
 *  - `tolerance`: colour distance fully keyed out (alpha 0)
 *  - `softness`: ramp width above tolerance for anti-aliased edges
 *  - `choke`: erode the alpha matte by N px to trim a thin fringe
 *  - `despill`: un-mix the key colour from edge pixels so no tint remains
 *
 * Edge pixels are modelled as observed = a*Foreground + (1-a)*Key, so the true
 * foreground is recovered as F = (observed - (1-a)*Key) / a, which removes the
 * residual background colour.
 */
export function keyOut(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  key: RGB,
  tolerance: number,
  softness: number,
  choke: number,
  despill: boolean,
): void {
  const n = w * h
  const A = new Float32Array(n)
  const s = Math.max(1, softness)

  for (let p = 0; p < n; p++) {
    const i = p * 4
    const dr = data[i] - key.r
    const dg = data[i + 1] - key.g
    const db = data[i + 2] - key.b
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    let a = (dist - tolerance) / s
    a = a < 0 ? 0 : a > 1 ? 1 : a
    A[p] = a
  }

  // Choke: erode the alpha matte (morphological min over 4-neighbourhood).
  for (let c = 0; c < choke; c++) {
    const B = A.slice()
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        let m = B[p]
        if (x > 0) m = Math.min(m, B[p - 1])
        if (x < w - 1) m = Math.min(m, B[p + 1])
        if (y > 0) m = Math.min(m, B[p - w])
        if (y < h - 1) m = Math.min(m, B[p + w])
        A[p] = m
      }
    }
  }

  for (let p = 0; p < n; p++) {
    const i = p * 4
    const a = A[p]
    if (a <= 0) {
      data[i + 3] = 0
      continue
    }
    if (despill && a < 1) {
      const inv = 1 - a
      data[i] = clamp255((data[i] - inv * key.r) / a)
      data[i + 1] = clamp255((data[i + 1] - inv * key.g) / a)
      data[i + 2] = clamp255((data[i + 2] - inv * key.b) / a)
    }
    data[i + 3] = Math.round(a * data[i + 3])
  }
}
