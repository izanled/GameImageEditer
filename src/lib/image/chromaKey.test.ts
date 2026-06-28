import { describe, it, expect } from 'vitest'
import { keyOut, detectKeyColor, hexToRgb, rgbToHex } from './chromaKey'

describe('hex/rgb', () => {
  it('round-trips', () => {
    expect(rgbToHex(hexToRgb('#00ffff'))).toBe('#00ffff')
    expect(hexToRgb('#0ff')).toEqual({ r: 0, g: 255, b: 255 })
  })
})

describe('detectKeyColor', () => {
  it('reads the corner color', () => {
    const w = 3, h = 3
    const data = new Uint8ClampedArray(w * h * 4)
    for (let p = 0; p < w * h; p++) {
      data[p * 4] = 0
      data[p * 4 + 1] = 255
      data[p * 4 + 2] = 255
      data[p * 4 + 3] = 255
    }
    expect(detectKeyColor(data, w, h)).toEqual({ r: 0, g: 255, b: 255 })
  })
})

describe('keyOut', () => {
  it('keys out the background, keeps the subject, and despills the edge', () => {
    // 3x1: [pure cyan key, 50% blend, pure red subject]
    const data = new Uint8ClampedArray([
      0, 255, 255, 255, // key
      100, 255, 255, 255, // edge (dist 100)
      255, 0, 0, 255, // subject (dist ~441)
    ])
    keyOut(data, 3, 1, { r: 0, g: 255, b: 255 }, 50, 100, 0, true)
    // p0 fully transparent
    expect(data[3]).toBe(0)
    // p1 edge: alpha 0.5 -> 128, red channel un-mixed up to 200
    expect(data[7]).toBe(128)
    expect(data[4]).toBe(200)
    // p2 subject untouched, opaque
    expect([data[8], data[9], data[10], data[11]]).toEqual([255, 0, 0, 255])
  })

  it('choke erodes a thin edge ring to remove fringe', () => {
    // 3x1: [key, near-key edge kept, subject]; choke=1 should erode the edge next to transparent
    const data = new Uint8ClampedArray([
      0, 255, 255, 255,
      120, 255, 255, 255, // dist 120 -> alpha 0.7 (kept) before choke
      255, 0, 0, 255,
    ])
    keyOut(data, 3, 1, { r: 0, g: 255, b: 255 }, 50, 100, 1, false)
    // middle pixel is adjacent to the fully-transparent key pixel -> choked to 0
    expect(data[7]).toBe(0)
  })
})
