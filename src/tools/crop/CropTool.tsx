import { useCallback, useEffect, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import ImageChangeButton from '../../components/ImageChangeButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import { fitRect, resizeRectEdge, type CropEdge, type Rect } from '../../lib/image/crop'

const tool = getTool('crop')!

type Point = { x: number; y: number }

type DragState =
  | { kind: 'move'; source: 'image' | 'result'; start: Point; rect: Rect }
  | { kind: 'resize'; edge: CropEdge; rect: Rect }

export default function CropTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [sel, setSel] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState<CropEdge | 'move' | null>(null)
  const [displayW, setDisplayW] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const imgRef = useRef<HTMLImageElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<DragState | null>(null)
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

  function clientToImage(e: React.PointerEvent<HTMLElement>): Point {
    const img = imgRef.current!
    const rect = img.getBoundingClientRect()
    const sx = img.naturalWidth / rect.width
    const sy = img.naturalHeight / rect.height
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  function clientToCanvas(e: React.PointerEvent<HTMLElement>, canvas: HTMLCanvasElement): Point {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function startMove(e: React.PointerEvent<HTMLElement>, source: 'image' | 'result') {
    if (!image || !sel) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = source === 'image'
      ? clientToImage(e)
      : clientToCanvas(e, resultRef.current!)
    dragState.current = { kind: 'move', source, start, rect: sel }
    setDragging('move')
  }

  function onPreviewPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button === 2) startMove(e, 'image')
  }

  function onResultPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button === 2) startMove(e, 'result')
  }

  function onEdgePointerDown(e: React.PointerEvent<HTMLDivElement>, edge: CropEdge) {
    if (!image || !sel || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    wrapRef.current?.setPointerCapture(e.pointerId)
    dragState.current = { kind: 'resize', edge, rect: sel }
    setDragging(edge)
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = dragState.current
    if (!drag || !image) return
    e.preventDefault()

    if (drag.kind === 'move') {
      const current = drag.source === 'image'
        ? clientToImage(e)
        : clientToCanvas(e, resultRef.current!)
      setSel(
        fitRect(
          {
            ...drag.rect,
            x: drag.rect.x + current.x - drag.start.x,
            y: drag.rect.y + current.y - drag.start.y,
          },
          image.width,
          image.height,
        ),
      )
      return
    }

    const p = clientToImage(e)
    const position = drag.edge === 'left' || drag.edge === 'right' ? p.x : p.y
    setSel(resizeRectEdge(drag.rect, drag.edge, position, image.width, image.height))
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragState.current = null
    setDragging(null)
  }

  function updateSel(patch: Partial<Rect>) {
    if (!image || !sel) return
    setSel(fitRect({ ...sel, ...patch }, image.width, image.height))
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
              {(['w', 'h', 'x', 'y'] as const).map((k) => (
                <label key={k} className="text-sm uppercase">
                  {k}
                  <input
                    type="number"
                    min={k === 'w' || k === 'h' ? 1 : 0}
                    max={
                      k === 'w' ? image.width
                        : k === 'h' ? image.height
                          : k === 'x' ? Math.max(0, image.width - (sel?.w ?? 1))
                            : Math.max(0, image.height - (sel?.h ?? 1))
                    }
                    value={sel ? sel[k] : 0}
                    onChange={(e) => updateSel({ [k]: Number(e.target.value) | 0 })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              W/H 입력 후 우클릭 드래그로 위치 이동 · 테두리로 상하좌우 조정
            </p>
            <div className="text-sm text-slate-500">
              선택: {sel?.w ?? 0} × {sel?.h ?? 0}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <DownloadButton onClick={download} disabled={!sel || sel.w < 1}>
                PNG 다운로드
              </DownloadButton>
              <ImageChangeButton onClick={() => setImage(null)} onImage={onImage} onError={setError}>
                이미지 변경
              </ImageChangeButton>
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">결과 미리보기</div>
              <div className="checkerboard inline-block rounded border border-slate-200 dark:border-slate-700">
                <canvas
                  ref={resultRef}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={onResultPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  className={`[image-rendering:pixelated] ${dragging === 'move' ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{ maxWidth: '100%', maxHeight: 160 }}
                />
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div
              ref={wrapRef}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onPreviewPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`checkerboard relative inline-block max-w-full overflow-hidden touch-none select-none rounded border border-slate-200 dark:border-slate-700 ${
                dragging === 'move' ? 'cursor-grabbing' : 'cursor-default'
              }`}
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
                  className="absolute border-2 border-indigo-400"
                  style={{
                    left: sel.x * scale,
                    top: sel.y * scale,
                    width: sel.w * scale,
                    height: sel.h * scale,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                  }}
                >
                  <div
                    onPointerDown={(e) => onEdgePointerDown(e, 'left')}
                    className="pointer-events-auto absolute top-1/2 -left-1 h-10 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-indigo-500 bg-white/90 shadow-sm dark:bg-slate-950/90"
                  />
                  <div
                    onPointerDown={(e) => onEdgePointerDown(e, 'right')}
                    className="pointer-events-auto absolute top-1/2 -right-1 h-10 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-indigo-500 bg-white/90 shadow-sm dark:bg-slate-950/90"
                  />
                  <div
                    onPointerDown={(e) => onEdgePointerDown(e, 'top')}
                    className="pointer-events-auto absolute top-[-5px] left-1/2 h-2 w-10 -translate-x-1/2 cursor-ns-resize rounded-sm border border-indigo-500 bg-white/90 shadow-sm dark:bg-slate-950/90"
                  />
                  <div
                    onPointerDown={(e) => onEdgePointerDown(e, 'bottom')}
                    className="pointer-events-auto absolute bottom-[-5px] left-1/2 h-2 w-10 -translate-x-1/2 cursor-ns-resize rounded-sm border border-indigo-500 bg-white/90 shadow-sm dark:bg-slate-950/90"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
