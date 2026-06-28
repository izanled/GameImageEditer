import { describe, expect, it } from 'vitest'
import {
  compressionRatio,
  outputExt,
  outputFilename,
  pngColorCount,
  qualityToFraction,
  shouldZip,
} from './compress'

describe('qualityToFraction', () => {
  it('maps 0–100 to 0–1', () => {
    expect(qualityToFraction(0)).toBe(0)
    expect(qualityToFraction(80)).toBeCloseTo(0.8)
    expect(qualityToFraction(100)).toBe(1)
  })
  it('clamps out-of-range input', () => {
    expect(qualityToFraction(-20)).toBe(0)
    expect(qualityToFraction(150)).toBe(1)
  })
})

describe('pngColorCount', () => {
  it('returns 0 when lossless', () => {
    expect(pngColorCount(64, true)).toBe(0)
  })
  it('clamps colors to 2–256 and rounds', () => {
    expect(pngColorCount(1, false)).toBe(2)
    expect(pngColorCount(300, false)).toBe(256)
    expect(pngColorCount(127.6, false)).toBe(128)
  })
})

describe('outputExt / outputFilename', () => {
  it('picks extension by format', () => {
    expect(outputExt('image/jpeg')).toBe('jpg')
    expect(outputExt('image/png')).toBe('png')
  })
  it('replaces the original extension', () => {
    expect(outputFilename('hero.PNG', 'image/jpeg')).toBe('hero.jpg')
    expect(outputFilename('sprite.jpeg', 'image/png')).toBe('sprite.png')
    expect(outputFilename('noext', 'image/png')).toBe('noext.png')
  })
})

describe('shouldZip', () => {
  it('zips only when more than one image', () => {
    expect(shouldZip(0)).toBe(false)
    expect(shouldZip(1)).toBe(false)
    expect(shouldZip(2)).toBe(true)
  })
})

describe('compressionRatio', () => {
  it('computes percent saved', () => {
    expect(compressionRatio(1000, 250)).toBe(75)
    expect(compressionRatio(1000, 1000)).toBe(0)
  })
  it('is negative when output grew', () => {
    expect(compressionRatio(1000, 1200)).toBe(-20)
  })
  it('guards against zero original size', () => {
    expect(compressionRatio(0, 500)).toBe(0)
  })
})
