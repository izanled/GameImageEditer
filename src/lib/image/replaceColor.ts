import { rgbToHsl, hslToRgb, type RGB } from './color'

export interface ReplaceColorOptions {
  /** Eyedropper-sampled colors that define the selection. */
  samples: RGB[]
  /** Photoshop-like tolerance, 0–200. 0 selects only exact matches. */
  fuzziness: number
  /** Hue shift in degrees, -180..180. */
  hue: number
  /** Saturation shift, -100..100 (relative, like Photoshop). */
  saturation: number
  /** Lightness shift, -100..100 (relative, like Photoshop). */
  lightness: number
}

// Fuzziness 200 should reach across the whole RGB cube (max distance ≈ 441.7).
const FUZZINESS_TO_DISTANCE = 441.7 / 200

function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

/**
 * Selection weight of a color, 0..1: 1 at an exact sample match, falling off
 * smoothly to 0 at the fuzziness distance. Multiple samples take the nearest.
 */
export function maskWeight(c: RGB, samples: RGB[], fuzziness: number): number {
  if (samples.length === 0) return 0
  let bestD = Infinity
  for (const s of samples) {
    const dr = c.r - s.r
    const dg = c.g - s.g
    const db = c.b - s.b
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) bestD = d
  }
  const dist = Math.sqrt(bestD)
  const range = fuzziness * FUZZINESS_TO_DISTANCE
  if (range <= 0) return dist === 0 ? 1 : 0
  return smoothstep(1 - dist / range)
}

/**
 * Per-pixel selection weights (0..1); transparent pixels get 0.
 * Used for the selection overlay so it matches the remap exactly.
 */
export function buildReplaceMask(
  data: Uint8ClampedArray,
  samples: RGB[],
  fuzziness: number,
): Float32Array {
  const mask = new Float32Array(data.length / 4)
  if (samples.length === 0) return mask
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue
    mask[p] = maskWeight({ r: data[i], g: data[i + 1], b: data[i + 2] }, samples, fuzziness)
  }
  return mask
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Photoshop-style Replace Color, in place: pixels similar to the samples get
 * their hue/saturation/lightness shifted, blended by selection weight so
 * shading and soft edges are preserved. Alpha is untouched.
 */
export function applyReplaceColor(
  data: Uint8ClampedArray,
  opts: ReplaceColorOptions,
): void {
  const { samples, fuzziness, hue, saturation, lightness } = opts
  if (samples.length === 0) return
  if (hue === 0 && saturation === 0 && lightness === 0) return
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const w = maskWeight({ r, g, b }, samples, fuzziness)
    if (w <= 0) continue
    const [h, s, l] = rgbToHsl(r, g, b)
    const [nr, ng, nb] = hslToRgb(
      h + hue,
      clamp01(s + saturation / 100),
      clamp01(l + lightness / 100),
    )
    data[i] = Math.round(r + (nr - r) * w)
    data[i + 1] = Math.round(g + (ng - g) * w)
    data[i + 2] = Math.round(b + (nb - b) * w)
  }
}

/** Wrap a hue difference to the shortest direction, -180..180. */
export function hueDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/**
 * Slider values that turn `sample` into `target`, for the result-color picker.
 */
export function deltasForTarget(
  sample: RGB,
  target: RGB,
): { hue: number; saturation: number; lightness: number } {
  const [sh, ss, sl] = rgbToHsl(sample.r, sample.g, sample.b)
  const [th, ts, tl] = rgbToHsl(target.r, target.g, target.b)
  return {
    hue: Math.round(hueDelta(sh, th)),
    saturation: Math.round((ts - ss) * 100),
    lightness: Math.round((tl - sl) * 100),
  }
}

/** The color `sample` becomes under the current slider values (for preview). */
export function previewColor(
  sample: RGB,
  hue: number,
  saturation: number,
  lightness: number,
): RGB {
  const [h, s, l] = rgbToHsl(sample.r, sample.g, sample.b)
  const [r, g, b] = hslToRgb(h + hue, clamp01(s + saturation / 100), clamp01(l + lightness / 100))
  return { r, g, b }
}
