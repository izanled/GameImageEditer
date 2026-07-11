const MIN_BLOCK_SIZE = 1

/**
 * Turns an RGBA buffer into square pixel blocks without flattening transparency.
 * Each block uses the RGBA value of its top-left source pixel, so alpha is
 * treated exactly like the colour channels.
 */
export function pixelateRgba(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('이미지 크기가 올바르지 않습니다.')
  }
  if (source.length !== width * height * 4) {
    throw new Error('이미지 픽셀 데이터 크기가 맞지 않습니다.')
  }

  const size = Math.max(MIN_BLOCK_SIZE, Math.round(blockSize) || MIN_BLOCK_SIZE)
  const output = new Uint8ClampedArray(source.length)

  for (let top = 0; top < height; top += size) {
    for (let left = 0; left < width; left += size) {
      const sourceIndex = (top * width + left) * 4
      const right = Math.min(left + size, width)
      const bottom = Math.min(top + size, height)

      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const targetIndex = (y * width + x) * 4
          output[targetIndex] = source[sourceIndex]
          output[targetIndex + 1] = source[sourceIndex + 1]
          output[targetIndex + 2] = source[sourceIndex + 2]
          output[targetIndex + 3] = source[sourceIndex + 3]
        }
      }
    }
  }

  return output
}
