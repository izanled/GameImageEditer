import { describe, it, expect } from 'vitest'
import {
  applyAdjustments,
  adjustBrightness,
  adjustContrast,
  adjustSaturation,
  rotateHue,
  posterize,
  invert,
  grayscale,
  DEFAULT_ADJUSTMENTS,
} from './colorAdjust'

function px(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a])
}

describe('adjustBrightness', () => {
  it('+100 clamps to white, -100 to black, alpha preserved', () => {
    const up = px(100, 150, 200, 123)
    adjustBrightness(up, 100)
    expect([up[0], up[1], up[2], up[3]]).toEqual([255, 255, 255, 123])
    const down = px(100, 150, 200, 50)
    adjustBrightness(down, -100)
    expect([down[0], down[1], down[2], down[3]]).toEqual([0, 0, 0, 50])
  })
})

describe('adjustContrast', () => {
  it('0 leaves pixels unchanged', () => {
    const d = px(10, 128, 240)
    adjustContrast(d, 0)
    expect([d[0], d[1], d[2]]).toEqual([10, 128, 240])
  })
})

describe('adjustSaturation', () => {
  it('-100 desaturates to R=G=B', () => {
    const d = px(200, 100, 50)
    adjustSaturation(d, -100)
    expect(d[0]).toBe(d[1])
    expect(d[1]).toBe(d[2])
  })
})

describe('rotateHue', () => {
  it('360° is an exact identity', () => {
    const d = px(200, 100, 50)
    rotateHue(d, 360)
    expect([d[0], d[1], d[2]]).toEqual([200, 100, 50])
  })
})

describe('posterize', () => {
  it('2 levels collapses each channel to ≤2 distinct values', () => {
    const d = new Uint8ClampedArray([0, 60, 127, 255, 128, 200, 255, 255])
    posterize(d, 2)
    const reds = new Set([d[0], d[4]])
    expect(reds.size).toBeLessThanOrEqual(2)
    for (const v of [d[0], d[1], d[2], d[4], d[5], d[6]]) {
      expect(v === 0 || v === 255).toBe(true)
    }
  })
})

describe('invert / grayscale', () => {
  it('invert is 255 - v', () => {
    const d = px(10, 20, 30)
    invert(d)
    expect([d[0], d[1], d[2]]).toEqual([245, 235, 225])
  })
  it('grayscale uses luma weights', () => {
    const d = px(255, 0, 0)
    grayscale(d)
    const y = Math.round(0.299 * 255)
    expect([d[0], d[1], d[2]]).toEqual([y, y, y])
  })
})

describe('applyAdjustments', () => {
  it('leaves data untouched when all defaults', () => {
    const d = px(73, 145, 12, 200)
    const before = Array.from(d)
    applyAdjustments(d, DEFAULT_ADJUSTMENTS)
    expect(Array.from(d)).toEqual(before)
  })
})
