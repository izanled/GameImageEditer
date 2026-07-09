import type { Bounds, DrawingLayer, ImageLayer, Point, ShapeLayer } from './types'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function normalizeRect(a: Point, b: Point): Bounds {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

export function snapValue(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 1) return value
  return Math.round(value / gridSize) * gridSize
}

export function snapPoint(point: Point, gridSize: number, enabled: boolean): Point {
  return {
    x: snapValue(point.x, gridSize, enabled),
    y: snapValue(point.y, gridSize, enabled),
  }
}

export function createShapeLayer(
  id: string,
  kind: ShapeLayer['kind'],
  bounds: Bounds,
  patch: Partial<ShapeLayer> = {},
): ShapeLayer {
  const sides = kind === 'triangle' ? 3 : kind === 'polygon' ? 5 : 5
  return {
    id,
    name: shapeLabel(kind, sides),
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    kind,
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    rotation: 0,
    cornerRadius: 0,
    sides,
    fill: { hex: '#4f46e5', alpha: 1 },
    fillStyle: 'solid',
    fill2: { hex: '#22c55e', alpha: 1 },
    gradientAngle: 0,
    stroke: { hex: '#111827', alpha: 1 },
    strokeWidth: 2,
    fillMode: 'full',
    fillAmount: 1,
    fillStartAngle: -90,
    fillClockwise: true,
    fillReverse: false,
    ...patch,
  }
}

export function shapeLabel(kind: ShapeLayer['kind'], sides: number): string {
  if (kind === 'rectangle') return '네모'
  if (kind === 'ellipse') return '원/타원'
  if (kind === 'triangle') return '세모'
  if (kind === 'star') return '별'
  return `${sides}각형`
}

export function getLayerBounds(layer: DrawingLayer): Bounds {
  if (layer.type === 'raster') {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  }
}

export function getLayerCenter(layer: ShapeLayer | Extract<DrawingLayer, { type: 'image' }>): Point {
  return {
    x: layer.x + layer.width / 2,
    y: layer.y + layer.height / 2,
  }
}

export function pointInLayerBounds(point: Point, layer: DrawingLayer): boolean {
  if (layer.type === 'raster' || !layer.visible || layer.locked) return false
  const center = getLayerCenter(layer)
  const angle = degreesToRadians(-layer.rotation)
  const dx = point.x - center.x
  const dy = point.y - center.y
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
  return (
    localX >= -layer.width / 2 &&
    localX <= layer.width / 2 &&
    localY >= -layer.height / 2 &&
    localY <= layer.height / 2
  )
}

export function findTopLayerAtPoint(layers: DrawingLayer[], point: Point): DrawingLayer | null {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i]
    if (pointInLayerBounds(point, layer)) return layer
  }
  return null
}

export function getSelectionBounds(layers: DrawingLayer[], ids: string[]): Bounds | null {
  const selected = layers.filter(
    (layer): layer is ShapeLayer | ImageLayer => ids.includes(layer.id) && layer.type !== 'raster',
  )
  if (selected.length === 0) return null
  const edges = selected.flatMap((layer) => rotatedCorners(layer))
  const xs = edges.map((point) => point.x)
  const ys = edges.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  }
}

export function rotatedCorners(layer: ShapeLayer | Extract<DrawingLayer, { type: 'image' }>): Point[] {
  const center = getLayerCenter(layer)
  const angle = degreesToRadians(layer.rotation)
  const corners = [
    { x: -layer.width / 2, y: -layer.height / 2 },
    { x: layer.width / 2, y: -layer.height / 2 },
    { x: layer.width / 2, y: layer.height / 2 },
    { x: -layer.width / 2, y: layer.height / 2 },
  ]
  return corners.map((point) => ({
    x: center.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: center.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  }))
}

export function getRegularPolygonPoints(sides: number, width: number, height: number): Point[] {
  const safeSides = clamp(Math.round(sides), 3, 8)
  return Array.from({ length: safeSides }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / safeSides
    return {
      x: Math.cos(angle) * width / 2,
      y: Math.sin(angle) * height / 2,
    }
  })
}

export function getStarPoints(points: number, width: number, height: number): Point[] {
  const safePoints = clamp(Math.round(points), 5, 8)
  return Array.from({ length: safePoints * 2 }, (_, index) => {
    const outer = index % 2 === 0
    const angle = -Math.PI / 2 + (index * Math.PI) / safePoints
    const radius = outer ? 0.5 : 0.23
    return {
      x: Math.cos(angle) * width * radius,
      y: Math.sin(angle) * height * radius,
    }
  })
}

export function maxCornerRadius(shape: ShapeLayer): number {
  if (shape.kind === 'ellipse') return 0
  const minSize = Math.min(Math.abs(shape.width), Math.abs(shape.height))
  return Math.max(0, Math.floor(minSize / 2))
}

export function clampCornerRadius(shape: ShapeLayer): number {
  return clamp(shape.cornerRadius, 0, maxCornerRadius(shape))
}

export function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
