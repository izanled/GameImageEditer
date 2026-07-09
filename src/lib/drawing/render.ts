import {
  clamp,
  clampCornerRadius,
  degreesToRadians,
  getRegularPolygonPoints,
  getStarPoints,
} from './geometry'
import type { DrawingDocument, DrawingLayer, ImageLayer, Point, RgbaColor, ShapeLayer } from './types'

export interface RenderResources {
  rasterCanvases?: Map<string, HTMLCanvasElement>
  imageCache?: Map<string, HTMLImageElement>
}

export function rgbaToCss(color: RgbaColor, opacity = 1): string {
  const hex = color.hex.replace('#', '')
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${clamp(color.alpha * opacity, 0, 1)})`
}

export function radialEndAngle(startDegrees: number, amount: number, clockwise: boolean): number {
  const start = degreesToRadians(startDegrees)
  const delta = Math.PI * 2 * clamp(amount, 0, 1)
  return clockwise ? start + delta : start - delta
}

export function buildShapePath(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  const width = Math.max(1, shape.width)
  const height = Math.max(1, shape.height)
  if (shape.kind === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2)
    return
  }

  if (shape.kind === 'rectangle') {
    roundedRectPath(ctx, -width / 2, -height / 2, width, height, clampCornerRadius(shape))
    return
  }

  const points =
    shape.kind === 'star'
      ? getStarPoints(shape.sides, width, height)
      : getRegularPolygonPoints(shape.kind === 'triangle' ? 3 : shape.sides, width, height)
  roundedPolygonPath(ctx, points, clampCornerRadius(shape))
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = clamp(radius, 0, Math.min(width, height) / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function roundedPolygonPath(ctx: CanvasRenderingContext2D, points: Point[], radius: number): void {
  ctx.beginPath()
  if (points.length === 0) return
  if (radius <= 0) {
    ctx.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.closePath()
    return
  }

  points.forEach((point, index) => {
    const prev = points[(index - 1 + points.length) % points.length]
    const next = points[(index + 1) % points.length]
    const prevDistance = Math.hypot(prev.x - point.x, prev.y - point.y)
    const nextDistance = Math.hypot(next.x - point.x, next.y - point.y)
    const safeRadius = Math.min(radius, prevDistance / 2, nextDistance / 2)
    const fromPrev = {
      x: point.x + ((prev.x - point.x) / prevDistance) * safeRadius,
      y: point.y + ((prev.y - point.y) / prevDistance) * safeRadius,
    }
    const toNext = {
      x: point.x + ((next.x - point.x) / nextDistance) * safeRadius,
      y: point.y + ((next.y - point.y) / nextDistance) * safeRadius,
    }
    if (index === 0) ctx.moveTo(fromPrev.x, fromPrev.y)
    else ctx.lineTo(fromPrev.x, fromPrev.y)
    ctx.quadraticCurveTo(point.x, point.y, toNext.x, toNext.y)
  })
  ctx.closePath()
}

export function renderDocument(
  ctx: CanvasRenderingContext2D,
  document: DrawingDocument,
  resources: RenderResources = {},
): void {
  ctx.clearRect(0, 0, document.canvas.width, document.canvas.height)
  if (!document.canvas.transparent) {
    ctx.fillStyle = document.canvas.background
    ctx.fillRect(0, 0, document.canvas.width, document.canvas.height)
  }
  for (const layer of document.layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    if (layer.type === 'shape') drawShape(ctx, layer)
    if (layer.type === 'raster') drawRasterLayer(ctx, layer, resources)
    if (layer.type === 'image') drawImageLayer(ctx, layer, resources)
  }
}

function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  ctx.save()
  ctx.globalAlpha = shape.opacity
  ctx.translate(shape.x + shape.width / 2, shape.y + shape.height / 2)
  ctx.rotate(degreesToRadians(shape.rotation))
  buildShapePath(ctx, shape)
  drawShapeFill(ctx, shape)
  if (shape.strokeWidth > 0 && shape.stroke.alpha > 0) {
    buildShapePath(ctx, shape)
    ctx.lineWidth = shape.strokeWidth
    ctx.strokeStyle = rgbaToCss(shape.stroke)
    ctx.stroke()
  }
  ctx.restore()
}

function drawShapeFill(ctx: CanvasRenderingContext2D, shape: ShapeLayer): void {
  const amount = clamp(shape.fillAmount, 0, 1)
  if (amount <= 0 || shape.fill.alpha <= 0) return
  const width = Math.max(1, shape.width)
  const height = Math.max(1, shape.height)
  ctx.save()
  buildShapePath(ctx, shape)
  ctx.clip()
  ctx.fillStyle = createFillStyle(ctx, shape, width, height)

  if (shape.fillMode === 'full') {
    ctx.fillRect(-width / 2, -height / 2, width, height)
  } else if (shape.fillMode === 'horizontal') {
    const fillWidth = width * amount
    const x = shape.fillReverse ? width / 2 - fillWidth : -width / 2
    ctx.fillRect(x, -height / 2, fillWidth, height)
  } else if (shape.fillMode === 'vertical') {
    const fillHeight = height * amount
    const y = shape.fillReverse ? -height / 2 : height / 2 - fillHeight
    ctx.fillRect(-width / 2, y, width, fillHeight)
  } else {
    const radius = Math.hypot(width, height)
    const start = degreesToRadians(shape.fillStartAngle)
    const end = radialEndAngle(shape.fillStartAngle, amount, shape.fillClockwise)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, radius, start, end, !shape.fillClockwise)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function createFillStyle(
  ctx: CanvasRenderingContext2D,
  shape: ShapeLayer,
  width: number,
  height: number,
): string | CanvasGradient {
  if (shape.fillStyle === 'linear-gradient') {
    const angle = degreesToRadians(shape.gradientAngle ?? 0)
    const radius = Math.hypot(width, height) / 2
    const dx = Math.cos(angle) * radius
    const dy = Math.sin(angle) * radius
    const gradient = ctx.createLinearGradient(-dx, -dy, dx, dy)
    gradient.addColorStop(0, rgbaToCss(shape.fill))
    gradient.addColorStop(1, rgbaToCss(shape.fill2 ?? shape.fill))
    return gradient
  }
  if (shape.fillStyle === 'radial-gradient') {
    const radius = Math.hypot(width, height) / 2
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
    gradient.addColorStop(0, rgbaToCss(shape.fill))
    gradient.addColorStop(1, rgbaToCss(shape.fill2 ?? shape.fill))
    return gradient
  }
  return rgbaToCss(shape.fill)
}

function drawRasterLayer(
  ctx: CanvasRenderingContext2D,
  layer: DrawingLayer & { type: 'raster' },
  resources: RenderResources,
): void {
  const canvas = resources.rasterCanvases?.get(layer.id)
  if (!canvas) return
  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.drawImage(canvas, 0, 0)
  ctx.restore()
}

function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer, resources: RenderResources): void {
  const img = resources.imageCache?.get(layer.id)
  if (!img) return
  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
  ctx.rotate(degreesToRadians(layer.rotation))
  ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
  ctx.restore()
}
