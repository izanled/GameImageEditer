import { describe, expect, it } from 'vitest'
import { pixelateRgba } from './pixelate'

function rgba(...values: number[]) {
  return new Uint8ClampedArray(values)
}

describe('pixelateRgba', () => {
  it('returns an unchanged copy at strength 1', () => {
    const source = rgba(1, 2, 3, 4, 5, 6, 7, 8)

    const result = pixelateRgba(source, 2, 1, 1)

    expect(result).toEqual(source)
    expect(result).not.toBe(source)
  })

  it('fills each partial block from one source RGBA pixel', () => {
    const source = rgba(
      10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 32, 33,
      40, 41, 42, 43, 50, 51, 52, 53, 60, 61, 62, 63,
    )

    const result = pixelateRgba(source, 3, 2, 2)

    expect(Array.from(result)).toEqual([
      10, 11, 12, 13, 10, 11, 12, 13, 30, 31, 32, 33,
      10, 11, 12, 13, 10, 11, 12, 13, 30, 31, 32, 33,
    ])
    expect(Array.from(source)).toEqual([
      10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 32, 33,
      40, 41, 42, 43, 50, 51, 52, 53, 60, 61, 62, 63,
    ])
  })

  it('keeps sampled alpha values, including fully transparent pixels', () => {
    const source = rgba(
      255, 0, 0, 0,
      0, 255, 0, 255,
      0, 0, 255, 128,
      255, 255, 255, 64,
    )

    const result = pixelateRgba(source, 2, 2, 2)

    expect([result[3], result[7], result[11], result[15]]).toEqual([0, 0, 0, 0])
  })
})
