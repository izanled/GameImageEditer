import { createCanvas, getContext } from './draw'

export interface GifFrame {
  /** Fully-composited frame, sized to the GIF's logical screen. */
  canvas: HTMLCanvasElement
  /** Display duration of this frame in milliseconds. */
  delayMs: number
}

export interface DecodedGif {
  width: number
  height: number
  frames: GifFrame[]
}

/** Cap extraction so a pathological GIF can't exhaust memory. */
export const MAX_FRAMES = 1024

/**
 * Decode every frame of an animated GIF into a list of canvases.
 *
 * Uses the native `ImageDecoder` (WebCodecs), which composites each frame
 * against the previous ones and honours per-frame disposal — so optimised GIFs
 * that only store changed pixels still produce complete frames. Runs entirely
 * in the browser; nothing is uploaded.
 */
export async function decodeGif(blob: Blob): Promise<DecodedGif> {
  if (typeof ImageDecoder === 'undefined') {
    throw new Error(
      '이 브라우저는 GIF 프레임 추출을 지원하지 않습니다. 최신 Chrome·Edge·Firefox·Safari에서 사용해주세요.',
    )
  }
  const data = await blob.arrayBuffer()
  const decoder = new ImageDecoder({ data, type: 'image/gif' })
  try {
    // tracks.ready must resolve before selectedTrack is populated; completed
    // ensures frameCount is final rather than a partial estimate.
    await decoder.tracks.ready
    await decoder.completed
    const track = decoder.tracks.selectedTrack
    if (!track || track.frameCount < 1) {
      throw new Error('GIF에서 프레임을 찾을 수 없습니다.')
    }
    const count = Math.min(track.frameCount, MAX_FRAMES)
    const frames: GifFrame[] = []
    let width = 0
    let height = 0
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      width = image.displayWidth
      height = image.displayHeight
      const canvas = createCanvas(width, height)
      getContext(canvas, false).drawImage(image, 0, 0)
      // VideoFrame.duration is microseconds; fall back to 100ms when absent.
      frames.push({ canvas, delayMs: image.duration != null ? image.duration / 1000 : 100 })
      image.close()
    }
    return { width, height, frames }
  } finally {
    decoder.close()
  }
}

/** Suggest a roughly-square column count for an n-frame sheet. */
export function suggestCols(n: number): number {
  if (n <= 1) return 1
  return Math.min(n, Math.ceil(Math.sqrt(n)))
}

/** Average frame delay (ms) → an integer FPS estimate, clamped to 1..60. */
export function frameDelaysToFps(delaysMs: number[]): number {
  const valid = delaysMs.filter((d) => d > 0)
  if (valid.length === 0) return 10
  const avg = valid.reduce((sum, d) => sum + d, 0) / valid.length
  return Math.max(1, Math.min(60, Math.round(1000 / avg)))
}

/** Zero-pad a frame number to the width of `total` (e.g. 7 of 120 → "007"). */
export function padFrameIndex(n: number, total: number): string {
  return String(n).padStart(String(Math.max(1, total)).length, '0')
}
