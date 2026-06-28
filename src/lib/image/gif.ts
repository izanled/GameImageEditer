import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { getContext } from './draw'

/**
 * Encode a list of equally-sized canvases into a looping animated GIF.
 *
 * Each frame is quantized independently to 256 colors. Transparent output uses
 * a 1-bit alpha key, which suits hard-edged pixel art (no semi-transparent
 * edges). `fps` sets the per-frame delay.
 */
export function encodeGif(
  frames: HTMLCanvasElement[],
  opts: { fps: number; transparent: boolean },
): Blob {
  const gif = GIFEncoder()
  const delay = Math.max(20, Math.round(1000 / Math.max(1, opts.fps)))
  const format = opts.transparent ? 'rgba4444' : 'rgb565'
  for (const canvas of frames) {
    const ctx = getContext(canvas, false)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const palette = quantize(data, 256, { format, oneBitAlpha: opts.transparent })
    const index = applyPalette(data, palette, format)
    gif.writeFrame(index, width, height, { palette, delay, transparent: opts.transparent })
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}
