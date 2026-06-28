import { describe, it, expect } from 'vitest'
import { computeLayout } from './packSheet'

const uniform = (n: number, w: number, h: number) =>
  Array.from({ length: n }, () => ({ w, h }))

describe('computeLayout', () => {
  it('lays out 6 uniform 32x32 frames in 3 columns', () => {
    const l = computeLayout(uniform(6, 32, 32), 3, 0, 0, 'top-left')
    expect(l.cols).toBe(3)
    expect(l.rows).toBe(2)
    expect(l.cellW).toBe(32)
    expect(l.cellH).toBe(32)
    expect(l.sheetW).toBe(96)
    expect(l.sheetH).toBe(64)
    expect(l.placements).toHaveLength(6)
    expect(l.placements[4]).toMatchObject({ col: 1, row: 1, drawX: 32, drawY: 32 })
  })

  it('accounts for padding and margin', () => {
    const l = computeLayout(uniform(2, 16, 16), 2, 4, 8, 'top-left')
    // 8 + 16 + 4 + 16 + 8 = 52 wide; 8 + 16 + 8 = 32 tall
    expect(l.sheetW).toBe(52)
    expect(l.sheetH).toBe(32)
    expect(l.placements[1].drawX).toBe(8 + 16 + 4)
  })

  it('uses the largest frame for the uniform cell and anchors smaller ones', () => {
    const l = computeLayout([{ w: 20, h: 40 }, { w: 10, h: 10 }], 2, 0, 0, 'center')
    expect(l.cellW).toBe(20)
    expect(l.cellH).toBe(40)
    // second frame (10x10) centered in 20x40 cell at col 1
    expect(l.placements[1].drawX).toBe(20 + Math.round((20 - 10) / 2))
    expect(l.placements[1].drawY).toBe(Math.round((40 - 10) / 2))
  })

  it('handles empty input', () => {
    const l = computeLayout([], 3, 0, 0, 'center')
    expect(l.rows).toBe(0)
    expect(l.placements).toHaveLength(0)
  })
})
