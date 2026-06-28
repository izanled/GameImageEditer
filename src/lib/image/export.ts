export type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp'

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: ExportFormat = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다.'))),
      type,
      quality,
    )
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function extFor(type: ExportFormat): string {
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/webp') return 'webp'
  return 'png'
}

/** Strip the existing extension and append a new one. */
export function replaceExt(name: string, ext: string): string {
  return name.replace(/\.[^./\\]+$/, '') + '.' + ext
}

/** Filename without its extension. */
export function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '')
}
