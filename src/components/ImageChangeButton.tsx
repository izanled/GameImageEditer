import { useCallback, useState, type ReactNode } from 'react'
import { loadImageFromFile, type LoadedImage } from '../lib/image/load'

interface Props {
  onClick: () => void
  onImage: (img: LoadedImage, file: File) => void
  onError?: (msg: string) => void
  children?: ReactNode
}

export default function ImageChangeButton({
  onClick,
  onImage,
  onError,
  children,
}: Props) {
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        onError?.('이미지 파일만 지원합니다.')
        return
      }
      try {
        onImage(await loadImageFromFile(file), file)
      } catch (err) {
        onError?.((err as Error).message)
      }
    },
    [onImage, onError],
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
        handleFile(e.dataTransfer.files?.[0])
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
