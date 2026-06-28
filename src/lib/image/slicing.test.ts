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
  it('honours margin and spacing', () => {
    const cells = sliceByCount(64, 64, 2, 1, 4, 6)
    expect(cells).toHaveLength(2)
    expect(cells[0]).toMatchObject({ x: 4, w: 25 })
    expect(cells[1]).toMatchObject({ x: 35, w: 25 })
    // outer margins symmetric and the gap equals spacing
    expect(64 - (cells[1].x + cells[1].w)).toBe(4)
    expect(cells[1].x - (cells[0].x + cells[0].w)).toBe(6)
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
  it('offsets by margin and steps by cell+spacing', () => {
    const cells = sliceBySize(40, 20, 10, 10, 2, 4) // step 14 -> 3 cols x 2 rows
    expect(cells).toHaveLength(6)
    expect(cells[0]).toMatchObject({ x: 2, y: 2, w: 10, h: 10 })
    const last = cells[cells.length - 1]
    expect(last).toMatchObject({ x: 30, y: 16, w: 10, h: 4 })
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
