// Minimal ambient types for `gifenc` (ships without TypeScript declarations).
declare module 'gifenc' {
  export type PixelFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export interface QuantizeOptions {
    format?: PixelFormat
    oneBitAlpha?: boolean | number
    clearAlpha?: boolean
    clearAlphaThreshold?: number
    clearAlphaColor?: number
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): number[][]

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: PixelFormat,
  ): Uint8Array

  export interface WriteFrameOptions {
    palette?: number[][]
    /** Frame delay in milliseconds. */
    delay?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
    /** 0 = loop forever (default on the first frame). */
    repeat?: number
    first?: boolean
  }

  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void
    finish(): void
    bytes(): Uint8Array<ArrayBuffer>
    bytesView(): Uint8Array<ArrayBuffer>
    reset(): void
  }

  export function GIFEncoder(options?: {
    auto?: boolean
    initialCapacity?: number
  }): GIFEncoderInstance
}
