export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'star' | 'polygon'

export type FillMode = 'full' | 'radial' | 'horizontal' | 'vertical'

export type FillStyle = 'solid' | 'linear-gradient' | 'radial-gradient'

export interface Point {
  x: number
  y: number
}

export interface RgbaColor {
  hex: string
  alpha: number
}

export interface CanvasSpec {
  width: number
  height: number
  transparent: boolean
  background: string
}

export interface DrawingLayerBase {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
}

export interface ShapeLayer extends DrawingLayerBase {
  type: 'shape'
  kind: ShapeKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  cornerRadius: number
  sides: number
  fill: RgbaColor
  fillStyle: FillStyle
  fill2: RgbaColor
  gradientAngle: number
  stroke: RgbaColor
  strokeWidth: number
  fillMode: FillMode
  fillAmount: number
  fillStartAngle: number
  fillClockwise: boolean
  fillReverse: boolean
}

export interface RasterLayer extends DrawingLayerBase {
  type: 'raster'
  dataUrl: string | null
}

export interface ImageLayer extends DrawingLayerBase {
  type: 'image'
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export type DrawingLayer = ShapeLayer | RasterLayer | ImageLayer

export interface DrawingDocument {
  version: 1
  canvas: CanvasSpec
  layers: DrawingLayer[]
}

export interface DrawingHistory {
  past: DrawingDocument[]
  present: DrawingDocument
  future: DrawingDocument[]
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
