export interface LoadedImage {
  /** Decoded image element, usable as a drawImage source. */
  el: HTMLImageElement
  width: number
  height: number
  /** Object URL backing `el.src`; revoke when no longer needed. */
  url: string
}

function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'))
    img.src = url
  })
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 지원합니다.')
  }
  const url = URL.createObjectURL(file)
  try {
    const el = await decode(url)
    return { el, width: el.naturalWidth, height: el.naturalHeight, url }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}
