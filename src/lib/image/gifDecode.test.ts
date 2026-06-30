import { describe, it, expect } from 'vitest'
import { suggestCols, frameDelaysToFps, padFrameIndex } from './gifDecode'

describe('suggestCols', () => {
  it('returns 1 for zero or one frame', () => {
    expect(suggestCols(0)).toBe(1)
    expect(suggestCols(1)).toBe(1)
  })

  it('picks a roughly-square layout', () => {
    expect(suggestCols(4)).toBe(2)
    expect(suggestCols(9)).toBe(3)
    expect(suggestCols(10)).toBe(4)
  })

  it('never exceeds the frame count', () => {
    expect(suggestCols(2)).toBe(2)
    expect(suggestCols(3)).toBe(2)
  })
})

describe('frameDelaysToFps', () => {
  it('converts an average delay to fps', () => {
    expect(frameDelaysToFps([100, 100, 100])).toBe(10)
    expect(frameDelaysToFps([40])).toBe(25)
  })

  it('ignores zero-length delays', () => {
    expect(frameDelaysToFps([0, 0, 50])).toBe(20)
  })

  it('clamps to 1..60 and defaults when no valid delays', () => {
    expect(frameDelaysToFps([])).toBe(10)
    expect(frameDelaysToFps([1])).toBe(60)
    expect(frameDelaysToFps([100000])).toBe(1)
  })
})

describe('padFrameIndex', () => {
  it('pads to the width of the total', () => {
    expect(padFrameIndex(7, 120)).toBe('007')
    expect(padFrameIndex(7, 9)).toBe('7')
    expect(padFrameIndex(7, 99)).toBe('07')
    expect(padFrameIndex(120, 120)).toBe('120')
  })
})
