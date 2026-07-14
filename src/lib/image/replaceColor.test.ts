import { describe, it, expect } from 'vitest'
import {
  maskWeight,
  buildReplaceMask,
  applyReplaceColor,
  hueDelta,
  deltasForTarget,
  previewColor,
} from './replaceColor'
import type { RGB } from './color'

const RED: RGB = { r: 255, g: 0, b: 0 }
const BLUE: RGB = { r: 0, g: 0, b: 255 }

describe('maskWeight', () => {
  it('is 1 at an exact match and 0 for distant colors', () => {
    expect(maskWeight(RED, [RED], 40)).toBe(1)
    expect(maskWeight(BLUE, [RED], 40)).toBe(0)
  })

  it('falls off smoothly within the fuzziness range', () => {
    const near: RGB = { r: 235, g: 10, b: 10 }
    const w = maskWeight(near, [RED], 40)
    expect(w).toBeGreaterThan(0)
    expect(w).toBeLessThan(1)
  })

  it('uses the nearest of multiple samples', () => {
    expect(maskWeight(RED, [BLUE, RED], 40)).toBe(1)
  })

  it('selects only exact matches when fuzziness is 0', () => {
    expect(maskWeight(RED, [RED], 0)).toBe(1)
    expect(maskWeight({ r: 254, g: 0, b: 0 }, [RED], 0)).toBe(0)
  })

  it('returns 0 with no samples', () => {
    expect(maskWeight(RED, [], 40)).toBe(0)
  })
})

describe('buildReplaceMask', () => {
  it('weights opaque pixels and zeroes transparent ones', () => {
    // red opaque, red transparent, blue opaque
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 0, 0, 0,
      0, 0, 255, 255,
    ])
    const mask = buildReplaceMask(data, [RED], 40)
    expect(mask[0]).toBe(1)
    expect(mask[1]).toBe(0)
    expect(mask[2]).toBe(0)
  })
})

describe('applyReplaceColor', () => {
  it('shifts hue of selected pixels and leaves others untouched', () => {
    // red pixel + blue pixel
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 200])
    applyReplaceColor(data, { samples: [RED], fuzziness: 40, hue: 120, saturation: 0, lightness: 0 })
    // red (h=0) + 120° → green
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 255, 0, 255])
    // blue is outside the selection; alpha preserved
    expect([data[4], data[5], data[6], data[7]]).toEqual([0, 0, 255, 200])
  })

  it('preserves shading: light and dark variants of the sample shift together', () => {
    const lightRed: RGB = { r: 255, g: 102, b: 102 }
    const data = new Uint8ClampedArray([
      lightRed.r, lightRed.g, lightRed.b, 255,
    ])
    applyReplaceColor(data, { samples: [lightRed], fuzziness: 40, hue: 120, saturation: 0, lightness: 0 })
    // hue rotates, lightness stays → light green, not flat green
    expect(data[1]).toBe(255)
    expect(data[0]).toBeGreaterThan(0)
    expect(data[0]).toBe(data[2])
  })

  it('does nothing when all shifts are zero', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255])
    applyReplaceColor(data, { samples: [RED], fuzziness: 40, hue: 0, saturation: 0, lightness: 0 })
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 0])
  })

  it('skips transparent pixels', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 0])
    applyReplaceColor(data, { samples: [RED], fuzziness: 40, hue: 120, saturation: 0, lightness: 0 })
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 0])
  })
})

describe('hueDelta', () => {
  it('wraps to the shortest direction', () => {
    expect(hueDelta(0, 120)).toBe(120)
    expect(hueDelta(350, 10)).toBe(20)
    expect(hueDelta(10, 350)).toBe(-20)
  })
})

describe('deltasForTarget / previewColor', () => {
  it('round-trips: applying the deltas to the sample yields the target', () => {
    const sample = RED
    const goal: RGB = { r: 0, g: 0, b: 255 }
    const d = deltasForTarget(sample, goal)
    const out = previewColor(sample, d.hue, d.saturation, d.lightness)
    expect(Math.abs(out.r - goal.r)).toBeLessThanOrEqual(2)
    expect(Math.abs(out.g - goal.g)).toBeLessThanOrEqual(2)
    expect(Math.abs(out.b - goal.b)).toBeLessThanOrEqual(2)
  })
})
