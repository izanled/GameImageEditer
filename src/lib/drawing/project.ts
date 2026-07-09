import type { DrawingDocument, RasterLayer } from './types'

export const DRAWING_PROJECT_VERSION = 1

export function createEmptyDocument(width = 1024, height = 1024): DrawingDocument {
  const rasterLayer: RasterLayer = {
    id: 'raster-base',
    name: '브러쉬 레이어',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    dataUrl: null,
  }
  return {
    version: DRAWING_PROJECT_VERSION,
    canvas: {
      width,
      height,
      transparent: true,
      background: '#ffffff',
    },
    layers: [rasterLayer],
  }
}

export function serializeDrawingProject(document: DrawingDocument): string {
  return JSON.stringify(document, null, 2)
}

export function parseDrawingProject(text: string): DrawingDocument {
  const parsed = JSON.parse(text) as DrawingDocument
  if (parsed.version !== DRAWING_PROJECT_VERSION) {
    throw new Error('지원하지 않는 이미지 에디터 프로젝트 버전입니다.')
  }
  if (!parsed.canvas || !Array.isArray(parsed.layers)) {
    throw new Error('이미지 에디터 프로젝트 형식이 올바르지 않습니다.')
  }
  return parsed
}
