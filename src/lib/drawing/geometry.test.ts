import { describe, expect, it } from 'vitest'
import { clampCornerRadius, createShapeLayer, getRegularPolygonPoints, getStarPoints } from './geometry'
import { radialEndAngle } from './render'

describe('drawing geometry', () => {
  it('creates regular polygons with the requested side count', () => {
    expect(getRegularPolygonPoints(5, 100, 100)).toHaveLength(5)
    expect(getRegularPolygonPoints(8, 100, 100)).toHaveLength(8)
  })

  it('creates a five-point star as ten alternating points', () => {
    expect(getStarPoints(5, 100, 100)).toHaveLength(10)
  })

  it('clamps corner radius to half of the smallest side', () => {
    const shape = createShapeLayer('shape-1', 'rectangle', { x: 0, y: 0, width: 120, height: 40 }, {
      cornerRadius: 80,
    })
    expect(clampCornerRadius(shape)).toBe(20)
  })

  it('calculates radial fill end angles from amount and direction', () => {
    expect(radialEndAngle(0, 0.25, true)).toBeCloseTo(Math.PI / 2)
    expect(radialEndAngle(0, 0.25, false)).toBeCloseTo(-Math.PI / 2)
  })
})
