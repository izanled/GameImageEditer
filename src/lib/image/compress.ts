import UPNG from 'upng-js'
import type { LoadedImage } from './load'
import { createCanvas, getContext } from './draw'
import { canvasToBlob, replaceExt } from './export'

export type CompressFormat = 'image/png' | 'image/jpeg'

export interface CompressOptions {
  format: CompressFormat
  /** JPEG quality, 0–100. */
  jpegQuality: number
  /** PNG palette color count, 2–256 (ignored when pngLossless). */
  pngColors: number
  /** Encode PNG losslessly (cnum = 0) instead of quantizing. */
  pngLossless: boolean
  /** Hex background used to flatten transparency when encoding JPEG. */
  background: string
}

// --- pure helpers (unit-tested) ---

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Map a 0–100 quality to the 0–1 fraction canvas.toBlob expects. */
export function qualityToFraction(q: number): number {
  return clamp(q, 0, 100) / 100
}

/** Resolve the UPNG `cnum` argument: 0 = lossless, else clamped 2–256. */
export function pngColorCount(colors: number, lossless: boolean): number {
  return lossless ? 0 : clamp(Math.round(colors), 2, 256)
}

export function outputExt(format: CompressFormat): 'jpg' | 'png' {
  return format === 'image/jpeg' ? 'jpg' : 'png'
}

export function outputFilename(name: string, format: CompressFormat): string {
  return replaceExt(name, outputExt(format))
}

/** Multiple images are bundled into a ZIP; a single image downloads directly. */
export function shouldZip(count: number): boolean {
  return count > 1
}

/** Percentage saved relative to the original size (negative if it grew). */
export function compressionRatio(orig: number, comp: number): number {
  return orig > 0 ? Math.round((1 - comp / orig) * 100) : 0
}

// --- encoding (browser-verified; not unit-tested due to canvas/jsdom limits) ---

export async function compressImage(
  img: LoadedImage,
  opts: CompressOptions,
): Promise<Blob> {
  const { width, height } = img
  const canvas = createCanvas(width, height)
  const ctx = getContext(canvas, true)

  if (opts.format === 'image/jpeg') {
    // JPEG has no alpha channel — flatten onto the chosen background first.
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img.el, 0, 0, width, height)

  if (opts.format === 'image/jpeg') {
    return canvasToBlob(canvas, 'image/jpeg', qualityToFraction(opts.jpegQuality))
  }

  // PNG: re-encode through UPNG with palette quantization for real size savings.
  const { data } = ctx.getImageData(0, 0, width, height)
  const cnum = pngColorCount(opts.pngColors, opts.pngLossless)
  const png = UPNG.encode([data.buffer], width, height, cnum)
  return new Blob([png], { type: 'image/png' })
}
