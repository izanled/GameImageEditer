import { describe, it, expect } from 'vitest'
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } from './color'

describe('hex/rgb', () => {
  it('round-trips', () => {
    expect(rgbToHex(hexToRgb('#1a2b3c'))).toBe('#1a2b3c')
    expect(hexToRgb('#0ff')).toEqual({ r: 0, g: 255, b: 255 })
  })
})

describe('hsl', () => {
  it('round-trips RGB within ±1 per channel', () => {
    const samples = [
      [10, 20, 30],
      [200, 100, 50],
      [0, 128, 255],
      [255, 255, 255],
      [0, 0, 0],
      [128, 128, 128],
      [173, 64, 219],
    ]
    for (const [r, g, b] of samples) {
      const [h, s, l] = rgbToHsl(r, g, b)
      const [r2, g2, b2] = hslToRgb(h, s, l)
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1)
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(1)
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(1)
    }
  })

  it('s=0 yields a gray with R=G=B', () => {
    const [r, g, b] = hslToRgb(123, 0, 0.5)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })
})
