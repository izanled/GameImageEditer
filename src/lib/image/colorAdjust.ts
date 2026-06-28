import { rgbToHsl, hslToRgb } from './color'

export interface AdjustOptions {
  /** -100..100 */
  brightness: number
  /** -100..100 */
  contrast: number
  /** -100..100 (-100 = grayscale, +100 = doubly saturated) */
  saturation: number
  /** degrees, -180..180 */
  hue: number
  /** -100..100 (positive = warmer) */
  temperature: number
  /** 0.2..3.0 (1 = no change) */
  gamma: number
  /** 0 = off, else 2..32 tonal levels */
  posterize: number
  invert: boolean
  grayscale: boolean
  sepia: boolean
}

export const DEFAULT_ADJUSTMENTS: AdjustOptions = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  gamma: 1,
  posterize: 0,
  invert: false,
  grayscale: false,
  sepia: false,
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

export function adjustGamma(data: Uint8ClampedArray, gamma: number): void {
  if (gamma === 1) return
  const inv = 1 / gamma
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) lut[i] = clamp255(255 * Math.pow(i / 255, inv))
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}

export function adjustBrightness(data: Uint8ClampedArray, amount: number): void {
  if (amount === 0) return
  const add = amount * 2.55
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] + add)
    data[i + 1] = clamp255(data[i + 1] + add)
    data[i + 2] = clamp255(data[i + 2] + add)
  }
}

export function adjustContrast(data: Uint8ClampedArray, amount: number): void {
  if (amount === 0) return
  const c = amount * 2.55
  const f = (259 * (c + 255)) / (255 * (259 - c))
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(f * (data[i] - 128) + 128)
    data[i + 1] = clamp255(f * (data[i + 1] - 128) + 128)
    data[i + 2] = clamp255(f * (data[i + 2] - 128) + 128)
  }
}

/** Warm/cool shift: positive pushes red up and blue down. */
export function adjustTemperature(data: Uint8ClampedArray, amount: number): void {
  if (amount === 0) return
  const shift = amount * 0.6
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] + shift)
    data[i + 2] = clamp255(data[i + 2] - shift)
  }
}

export function rotateHue(data: Uint8ClampedArray, degrees: number): void {
  if (degrees % 360 === 0) return
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    const [r, g, b] = hslToRgb(h + degrees, s, l)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

export function adjustSaturation(data: Uint8ClampedArray, amount: number): void {
  if (amount === 0) return
  const factor = 1 + amount / 100
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    let ns = s * factor
    ns = ns < 0 ? 0 : ns > 1 ? 1 : ns
    const [r, g, b] = hslToRgb(h, ns, l)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

export function posterize(data: Uint8ClampedArray, levels: number): void {
  if (levels < 2) return
  const step = 255 / (levels - 1)
  const q = (v: number) => clamp255(Math.round(Math.round(v / step) * step))
  for (let i = 0; i < data.length; i += 4) {
    data[i] = q(data[i])
    data[i + 1] = q(data[i + 1])
    data[i + 2] = q(data[i + 2])
  }
}

export function invert(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]
    data[i + 1] = 255 - data[i + 1]
    data[i + 2] = 255 - data[i + 2]
  }
}

export function grayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    data[i] = y
    data[i + 1] = y
    data[i + 2] = y
  }
}

export function sepia(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    data[i] = clamp255(0.393 * r + 0.769 * g + 0.189 * b)
    data[i + 1] = clamp255(0.349 * r + 0.686 * g + 0.168 * b)
    data[i + 2] = clamp255(0.272 * r + 0.534 * g + 0.131 * b)
  }
}

/** Run every adjustment in a fixed order. Alpha is never touched. */
export function applyAdjustments(data: Uint8ClampedArray, opts: AdjustOptions): void {
  adjustGamma(data, opts.gamma)
  adjustBrightness(data, opts.brightness)
  adjustContrast(data, opts.contrast)
  adjustTemperature(data, opts.temperature)
  rotateHue(data, opts.hue)
  adjustSaturation(data, opts.saturation)
  if (opts.posterize >= 2) posterize(data, opts.posterize)
  if (opts.invert) invert(data)
  if (opts.grayscale) grayscale(data)
  else if (opts.sepia) sepia(data)
}
