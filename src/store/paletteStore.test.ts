import { describe, it, expect } from 'vitest'
import { parseSavedPalettes, type SavedPalette } from './paletteStore'

const VALID: SavedPalette = {
  id: 'a1',
  name: '내 팔레트',
  colors: [{ r: 1, g: 2, b: 3 }],
  createdAt: 1700000000000,
}

describe('parseSavedPalettes', () => {
  it('round-trips a valid list', () => {
    expect(parseSavedPalettes(JSON.stringify([VALID]))).toEqual([VALID])
  })

  it('returns empty for null, malformed JSON, and non-arrays', () => {
    expect(parseSavedPalettes(null)).toEqual([])
    expect(parseSavedPalettes('not json')).toEqual([])
    expect(parseSavedPalettes('{"a":1}')).toEqual([])
  })

  it('drops entries with missing or invalid fields', () => {
    const broken = [
      VALID,
      { ...VALID, id: 2 },
      { ...VALID, colors: [] },
      { ...VALID, colors: [{ r: 'x', g: 0, b: 0 }] },
      null,
      'junk',
    ]
    expect(parseSavedPalettes(JSON.stringify(broken))).toEqual([VALID])
  })
})
