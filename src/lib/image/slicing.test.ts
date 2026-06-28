import { describe, it, expect } from 'vitest'
import { sliceByCount, sliceBySize } from './gridSlice'
import { clampRect } from './crop'

describe('sliceByCount', () => {
  it('4x4 grid of a 64x64 image yields 16 cells of 16x16', () => {
    const cells = sliceByCount(64, 64, 4, 4)
    expect(cells).toHaveLength(16)
    expect(cells.every((c) => c.w === 16 && c.h === 16)).toBe(true)
  })
  it('covers the whole image with no gaps for non-divisible sizes', () => {
    const cells = sliceByCount(10, 10, 3, 1)
    const totalW = cells.reduce((s, c) => s + c.w, 0)
    expect(totalW).toBe(10)
    expect(cells).toHaveLength(3)
  })
})

describe('sliceBySize', () => {
  it('clips edge cells when size does not divide evenly', () => {
    const cells = sliceBySize(50, 50, 20, 20) // 3x3, edges 10px
    expect(cells).toHaveLength(9)
    const last = cells[cells.length - 1]
    expect(last.w).toBe(10)
    expect(last.h).toBe(10)
  })
})

describe('clampRect', () => {
  it('keeps an in-bounds rect intact', () => {
    expect(clampRect({ x: 10, y: 10, w: 20, h: 20 }, 100, 100)).toEqual({
      x: 10,
      y: 10,
      w: 20,
      h: 20,
    })
  })
  it('clamps width to the image edge', () => {
    expect(clampRect({ x: 90, y: 0, w: 50, h: 10 }, 100, 100)).toEqual({
      x: 90,
      y: 0,
      w: 10,
      h: 10,
    })
  })
})
