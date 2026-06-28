// Ambient declaration for upng-js (ships no TypeScript types).
// Mirrors the gifenc.d.ts approach used elsewhere in this project.
declare module 'upng-js' {
  const UPNG: {
    /**
     * Encode RGBA frame buffers to PNG/APNG.
     * `cnum` is the palette color count: 0 = lossless, 2..256 = lossy indexed.
     */
    encode(bufs: ArrayBuffer[], w: number, h: number, cnum: number, dels?: number[]): ArrayBuffer
    decode(buf: ArrayBuffer): unknown
    toRGBA8(img: unknown): ArrayBuffer[]
  }
  export default UPNG
}
