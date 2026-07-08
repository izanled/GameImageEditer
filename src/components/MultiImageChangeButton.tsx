import { useCallback, useState, type ReactNode } from 'react'
import { loadImageFromFile } from '../lib/image/load'
import type { NamedImage } from './MultiImageDropzone'

interface Props {
  onClick: () => void
  onImages: (images: NamedImage[]) => void
  onError?: (msg: string) => void
  children?: ReactNode
}

export default function MultiImageChangeButton({
  onClick,
  onImages,
  onError,
  children,
}: Props) {
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) {
        onError?.('이미지 파일만 지원합니다.')
        return
      }
      files.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      )
      const loaded: NamedImage[] = []
      for (const file of files) {
        try {
          loaded.push({ img: await loadImageFromFile(file), name: file.name })
        } catch (err) {
          onError?.((err as Error).message)
        }
      }
      if (loaded.length > 0) onImages(loaded)
    },
    [onImages, onError],
  )

  return (
    <button
      type="button"
      onClick={onClick}
      onDragEnter={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={`rounded-lg border px-4 py-2 text-sm transition ${
        dragging
          ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
          : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
      }`}
    >
      {children ?? '이미지 변경'}
    </button>
  )
}
