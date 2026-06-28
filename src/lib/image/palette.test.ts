import { describe, it, expect } from 'vitest'
import { extractPalette, nearestColor, remapToPalette } from './palette'
import type { RGB } from './color'

const RED: RGB = { r: 255, g: 0, b: 0 }
const BLUE: RGB = { r: 0, g: 0, b: 255 }

describe('extractPalette', () => {
  it('recovers the two source colors and respects the count cap', () => {
    // 2x1: red, blue
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255])
    const pal = extractPalette(data, 2)
    expect(pal).toHaveLength(2)
    const set = pal.map((c) => `${c.r},${c.g},${c.b}`).sort()
    expect(set).toEqual(['0,0,255', '255,0,0'])
  })

  it('never returns more colors than requested', () => {
    const data = new Uint8ClampedArray(16 * 4)
    for (let i = 0; i < 16; i++) {
      data[i * 4] = i * 16
      data[i * 4 + 3] = 255
    }
    expect(extractPalette(data, 4).length).toBeLessThanOrEqual(4)
  })

  it('ignores fully transparent pixels', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255])
    const pal = extractPalette(data, 4)
    expect(pal).toContainEqual(BLUE)
    expect(pal).not.toContainEqual(RED)
  })
})

describe('nearestColor', () => {
  it('picks the closest palette entry', () => {
    expect(nearestColor({ r: 250, g: 10, b: 10 }, [RED, BLUE])).toEqual(RED)
    expect(nearestColor({ r: 10, g: 10, b: 250 }, [RED, BLUE])).toEqual(BLUE)
  })
})

describe('remapToPalette', () => {
  it('snaps each opaque pixel and preserves alpha', () => {
    // greenish + transparent green
    const data = new Uint8ClampedArray([240, 20, 20, 200, 20, 20, 240, 0])
    remapToPalette(data, [RED, BLUE])
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 200])
    // transparent pixel keeps its rgba untouched
    expect([data[4], data[5], data[6], data[7]]).toEqual([20, 20, 240, 0])
  })
})
