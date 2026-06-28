import { useCallback, useRef, useState } from 'react'
import { loadImageFromFile, type LoadedImage } from '../lib/image/load'

export interface NamedImage {
  img: LoadedImage
  name: string
}

interface Props {
  onImages: (images: NamedImage[]) => void
  onError?: (msg: string) => void
  compact?: boolean
}

export default function MultiImageDropzone({ onImages, onError, compact }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) {
        onError?.('이미지 파일만 지원합니다.')
        return
      }
      // natural sort by filename (frame_01, frame_02, …)
      files.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      )
      const loaded: NamedImage[] = []
      for (const f of files) {
        try {
          loaded.push({ img: await loadImageFromFile(f), name: f.name })
        } catch (e) {
          onError?.((e as Error).message)
        }
      }
      if (loaded.length) onImages(loaded)
    },
    [onImages, onError],
  )

  return (
    <div
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
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition ${
        compact ? 'p-5' : 'p-12'
      } ${
        dragging
          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
          : 'border-slate-300 hover:border-indigo-400 dark:border-slate-700'
      }`}
    >
      <div className={compact ? 'text-2xl' : 'text-4xl'}>🖼️</div>
      <div className="font-medium">
        {compact ? '이미지 추가' : '여러 이미지를 드래그하거나 클릭해서 선택'}
      </div>
      {!compact && (
        <div className="text-sm text-slate-500">파일 이름순으로 자동 정렬됩니다</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
