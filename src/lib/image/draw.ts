export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Get a 2D context with smoothing configured.
 * `smoothing = false` gives crisp nearest-neighbor scaling (pixel art).
 */
export function getContext(
  canvas: HTMLCanvasElement,
  smoothing: boolean,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들 수 없습니다.')
  ctx.imageSmoothingEnabled = smoothing
  if (smoothing) ctx.imageSmoothingQuality = 'high'
  return ctx
}
