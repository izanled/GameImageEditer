import { useCallback, useEffect, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import { clampRect, rectFromPoints, type Rect } from '../../lib/image/crop'

const tool = getTool('crop')!

export default function CropTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [sel, setSel] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState(false)
  const [displayW, setDisplayW] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const imgRef = useRef<HTMLImageElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const resultRef = useRef<HTMLCanvasElement>(null)

  const onImage = (img: LoadedImage, file: File) => {
    setImage(img)
    setName(file.name)
    setError(null)
    setSel({ x: 0, y: 0, w: img.width, h: img.height })
  }

  const measure = useCallback(() => {
    if (imgRef.current) setDisplayW(imgRef.current.clientWidth)
  }, [])

  useEffect(() => {
    if (!image) return
    measure()
    const ro = new ResizeObserver(measure)
    if (imgRef.current) ro.observe(imgRef.current)
    return () => ro.disconnect()
  }, [image, measure])

  // redraw cropped result preview whenever the selection changes
  useEffect(() => {
    if (!image || !sel || !resultRef.current || sel.w < 1 || sel.h < 1) return
    const canvas = resultRef.current
    canvas.width = sel.w
    canvas.height = sel.h
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, sel.w, sel.h)
    ctx.drawImage(image.el, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h)
  }, [image, sel])

  const scale = image && displayW ? displayW / image.width : 1

  function clientToImage(e: React.PointerEvent) {
    const img = imgRef.current!
    const rect = img.getBoundingClientRect()
    const sx = img.naturalWidth / rect.width
    const sy = img.naturalHeight / rect.height
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!image) return
    wrapRef.current?.setPointerCapture(e.pointerId)
    const p = clientToImage(e)
    dragStart.current = p
    setDragging(true)
    setSel(clampRect({ x: p.x, y: p.y, w: 0, h: 0 }, image.width, image.height))
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !image) return
    const p = clientToImage(e)
    const s = dragStart.current
    setSel(
      clampRect(rectFromPoints(s.x, s.y, p.x, p.y), image.width, image.height),
    )
  }
  function onPointerUp() {
    setDragging(false)
  }

  function updateSel(patch: Partial<Rect>) {
    if (!image || !sel) return
    setSel(clampRect({ ...sel, ...patch }, image.width, image.height))
  }

  async function download() {
    if (!resultRef.current) return
    const blob = await canvasToBlob(resultRef.current, 'image/png')
    downloadBlob(blob, replaceExt(name, 'png'))
  }

  return (
    <ToolShell tool={tool}>
      {!image ? (
        <ImageDropzone onImage={onImage} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <div className="text-sm text-slate-500">
              원본: {image.width} × {image.height}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="text-sm uppercase">
                  {k}
                  <input
                    type="number"
                    min={k === 'w' || k === 'h' ? 1 : 0}
                    value={sel ? sel[k] : 0}
                    onChange={(e) => updateSel({ [k]: Number(e.target.value) | 0 })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              미리보기 위에서 드래그하여 영역을 선택하세요.
            </p>
            <div className="text-sm text-slate-500">
              선택: {sel?.w ?? 0} × {sel?.h ?? 0}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <DownloadButton onClick={download} disabled={!sel || sel.w < 1}>
                PNG 다운로드
              </DownloadButton>
              <button
                type="button"
                onClick={() => setImage(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                이미지 변경
              </button>
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">결과 미리보기</div>
              <div className="checkerboard inline-block rounded border border-slate-200 dark:border-slate-700">
                <canvas
                  ref={resultRef}
                  className="[image-rendering:pixelated]"
                  style={{ maxWidth: '100%', maxHeight: 160 }}
                />
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div
              ref={wrapRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="checkerboard relative inline-block max-w-full overflow-hidden cursor-crosshair touch-none select-none rounded border border-slate-200 dark:border-slate-700"
            >
              <img
                ref={imgRef}
                src={image.url}
                onLoad={measure}
                draggable={false}
                className="block max-w-full [image-rendering:pixelated]"
                alt="크롭 대상"
              />
              {sel && sel.w > 0 && (
                <div
                  className="pointer-events-none absolute border-2 border-indigo-400"
                  style={{
                    left: sel.x * scale,
                    top: sel.y * scale,
                    width: sel.w * scale,
                    height: sel.h * scale,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
