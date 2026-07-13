import type { RGB } from './color'

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

function boxRange(box: RGB[]): { range: number; channel: 'r' | 'g' | 'b' } {
  let rmin = 255
  let rmax = 0
  let gmin = 255
  let gmax = 0
  let bmin = 255
  let bmax = 0
  for (const p of box) {
    if (p.r < rmin) rmin = p.r
    if (p.r > rmax) rmax = p.r
    if (p.g < gmin) gmin = p.g
    if (p.g > gmax) gmax = p.g
    if (p.b < bmin) bmin = p.b
    if (p.b > bmax) bmax = p.b
  }
  const rr = rmax - rmin
  const gr = gmax - gmin
  const br = bmax - bmin
  const m = Math.max(rr, gr, br)
  const channel = m === rr ? 'r' : m === gr ? 'g' : 'b'
  return { range: m, channel }
}

function averageColor(box: RGB[]): RGB {
  let r = 0
  let g = 0
  let b = 0
  for (const p of box) {
    r += p.r
    g += p.g
    b += p.b
  }
  const n = box.length
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

/**
 * Extract up to `count` representative colors via deterministic median-cut.
 * Fully transparent pixels are ignored. Returns 1..count colors.
 */
export function extractPalette(data: Uint8ClampedArray, count: number): RGB[] {
  const target = Math.max(1, Math.min(256, Math.floor(count)))
  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  if (pixels.length === 0) return [{ r: 0, g: 0, b: 0 }]

  const boxes: RGB[][] = [pixels]
  while (boxes.length < target) {
    let bestIdx = -1
    let bestRange = -1
    let bestChannel: 'r' | 'g' | 'b' = 'r'
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue
      const { range, channel } = boxRange(boxes[i])
      if (range > bestRange) {
        bestRange = range
        bestIdx = i
        bestChannel = channel
      }
    }
    if (bestIdx === -1) break
    const box = boxes[bestIdx]
    box.sort((a, b) => a[bestChannel] - b[bestChannel])
    const mid = box.length >> 1
    boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid))
  }
  return boxes.map(averageColor)
}

/** Index of the nearest palette color by squared Euclidean RGB distance. */
export function nearestIndex(c: RGB, palette: RGB[]): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]
    const dr = c.r - p.r
    const dg = c.g - p.g
    const db = c.b - p.b
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Nearest palette color by squared Euclidean RGB distance. */
export function nearestColor(c: RGB, palette: RGB[]): RGB {
  return palette[nearestIndex(c, palette)]
}

/** Perceived luminance (Rec. 709) for stable palette ordering. */
export function luminance(c: RGB): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

/** New array sorted dark → light so two palettes pair up by brightness rank. */
export function sortByLuminance(palette: RGB[]): RGB[] {
  return [...palette].sort((a, b) => luminance(a) - luminance(b))
}

/**
 * Snap every opaque pixel to its nearest palette color, in place.
 * With `outPalette`, the match happens against `palette` but the written color
 * comes from `outPalette` at the same index (index-based palette swap).
 */
export function remapToPalette(
  data: Uint8ClampedArray,
  palette: RGB[],
  outPalette?: RGB[],
): void {
  if (palette.length === 0) return
  const mapped = outPalette && outPalette.length > 0 ? outPalette : null
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const idx = nearestIndex({ r: data[i], g: data[i + 1], b: data[i + 2] }, palette)
    const n = mapped ? mapped[idx % mapped.length] : palette[idx]
    data[i] = n.r
    data[i + 1] = n.g
    data[i + 2] = n.b
  }
}

/**
 * Per-pixel index of the nearest palette color; -1 for transparent pixels.
 * Used to highlight where a palette color is used without rescanning per click.
 */
export function buildIndexMap(data: Uint8ClampedArray, palette: RGB[]): Int32Array {
  const map = new Int32Array(data.length / 4).fill(-1)
  if (palette.length === 0) return map
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue
    map[p] = nearestIndex({ r: data[i], g: data[i + 1], b: data[i + 2] }, palette)
  }
  return map
}

/**
 * Floyd–Steinberg error-diffusion remap for smoother gradients, in place.
 * With `outPalette`, quantization error is computed against `palette` but the
 * final written color is the same-index entry of `outPalette`.
 */
export function applyDither(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  palette: RGB[],
  outPalette?: RGB[],
): void {
  if (palette.length === 0) return
  const mapped = outPalette && outPalette.length > 0 ? outPalette : null
  const indices = mapped ? new Int32Array(w * h).fill(-1) : null
  const buf = Float32Array.from(data)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] === 0) continue
      const or = buf[i]
      const og = buf[i + 1]
      const ob = buf[i + 2]
      const ni = nearestIndex({ r: or, g: og, b: ob }, palette)
      const n = palette[ni]
      if (indices) indices[y * w + x] = ni
      buf[i] = n.r
      buf[i + 1] = n.g
      buf[i + 2] = n.b
      const er = or - n.r
      const eg = og - n.g
      const eb = ob - n.b
      const spread = (dx: number, dy: number, f: number) => {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) return
        const j = (yy * w + xx) * 4
        buf[j] += er * f
        buf[j + 1] += eg * f
        buf[j + 2] += eb * f
      }
      spread(1, 0, 7 / 16)
      spread(-1, 1, 3 / 16)
      spread(0, 1, 5 / 16)
      spread(1, 1, 1 / 16)
    }
  }
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue
    if (mapped && indices && indices[p] >= 0) {
      const m = mapped[indices[p] % mapped.length]
      data[i] = m.r
      data[i + 1] = m.g
      data[i + 2] = m.b
      continue
    }
    data[i] = clamp255(buf[i])
    data[i + 1] = clamp255(buf[i + 1])
    data[i + 2] = clamp255(buf[i + 2])
  }
}
