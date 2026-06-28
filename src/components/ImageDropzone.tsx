import { useCallback, useEffect, useRef, useState } from 'react'
import { loadImageFromFile, type LoadedImage } from '../lib/image/load'

interface Props {
  onImage: (img: LoadedImage, file: File) => void
  onError?: (msg: string) => void
}

export default function ImageDropzone({ onImage, onError }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return
      try {
        const img = await loadImageFromFile(file)
        onImage(img, file)
      } catch (err) {
        onError?.((err as Error).message)
      }
    },
    [onImage, onError],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      if (item) {
        const file = item.getAsFile()
        if (file) handleFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

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
        handleFile(e.dataTransfer.files?.[0])
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-12 text-center transition ${
        dragging
          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
          : 'border-slate-300 hover:border-indigo-400 dark:border-slate-700'
      }`}
    >
      <div className="text-4xl">🖼️</div>
      <div className="font-medium">이미지를 드래그하거나 클릭해서 선택</div>
      <div className="text-sm text-slate-500">또는 Ctrl+V로 붙여넣기</div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
