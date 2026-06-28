import { describe, it, expect } from 'vitest'
import { lockedDimension } from './resize'
import { anchorOffset } from './canvasResize'

describe('lockedDimension', () => {
  it('keeps aspect ratio when width changes', () => {
    // 100x50, new width 200 -> height 100
    expect(lockedDimension(100, 50, 'width', 200)).toBe(100)
  })
  it('keeps aspect ratio when height changes', () => {
    // 100x50, new height 100 -> width 200
    expect(lockedDimension(100, 50, 'height', 100)).toBe(200)
  })
  it('integer 4x of an 8px sprite stays exact', () => {
    expect(lockedDimension(8, 8, 'width', 32)).toBe(32)
  })
  it('never returns less than 1', () => {
    expect(lockedDimension(100, 50, 'width', 1)).toBeGreaterThanOrEqual(1)
  })
})

describe('anchorOffset', () => {
  const cw = 100
  const ch = 100
  const iw = 40
  const ih = 20

  it('top-left places image at origin', () => {
    expect(anchorOffset('top-left', cw, ch, iw, ih)).toEqual([0, 0])
  })
  it('center centers the image', () => {
    expect(anchorOffset('center', cw, ch, iw, ih)).toEqual([30, 40])
  })
  it('bottom-right aligns to far corner', () => {
    expect(anchorOffset('bottom-right', cw, ch, iw, ih)).toEqual([60, 80])
  })
  it('right + vertical center', () => {
    expect(anchorOffset('right', cw, ch, iw, ih)).toEqual([60, 40])
  })
})
