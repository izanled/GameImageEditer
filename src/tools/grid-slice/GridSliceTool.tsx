import { useEffect, useMemo, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, baseName } from '../../lib/image/export'
import { downloadZip, type ZipEntry } from '../../lib/zip'
import { sliceByCount, sliceBySize, type Cell } from '../../lib/image/gridSlice'

const tool = getTool('grid-slice')!

function isEmpty(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false
  }
  return true
}

export default function GridSliceTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('sheet.png')
  const [mode, setMode] = useState<'count' | 'size'>('count')
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(4)
  const [cellW, setCellW] = useState(32)
  const [cellH, setCellH] = useState(32)
  const [skipEmpty, setSkipEmpty] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const onImage = (img: LoadedImage, file: File) => {
    setImage(img)
    setName(file.name)
    setError(null)
  }

  const cells: Cell[] = useMemo(() => {
    if (!image) return []
    return mode === 'count'
      ? sliceByCount(image.width, image.height, Math.max(1, cols), Math.max(1, rows))
      : sliceBySize(image.width, image.height, Math.max(1, cellW), Math.max(1, cellH))
  }, [image, mode, cols, rows, cellW, cellH])

  // preview: scaled image + grid overlay
  useEffect(() => {
    if (!image || !canvasRef.current) return
    const fit = Math.min(560 / image.width, 400 / image.height)
    const scale = Math.min(fit, 6)
    const dw = Math.max(1, Math.round(image.width * scale))
    const dh = Math.max(1, Math.round(image.height * scale))
    const canvas = canvasRef.current
    canvas.width = dw
    canvas.height = dh
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, dw, dh)
    ctx.drawImage(image.el, 0, 0, dw, dh)
    ctx.strokeStyle = 'rgba(99,102,241,0.9)'
    ctx.lineWidth = 1
    for (const c of cells) {
      ctx.strokeRect(c.x * scale + 0.5, c.y * scale + 0.5, c.w * scale, c.h * scale)
    }
  }, [image, cells])

  async function exportZip() {
    if (!image || cells.length === 0) return
    if (cells.length > 4096) {
      setError('셀이 너무 많습니다 (최대 4096). 분할 수를 줄여주세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const base = baseName(name)
      const entries: ZipEntry[] = []
      for (const c of cells) {
        const canvas = createCanvas(c.w, c.h)
        const ctx = getContext(canvas, false)
        ctx.drawImage(image.el, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h)
        if (skipEmpty && isEmpty(ctx, c.w, c.h)) continue
        const blob = await canvasToBlob(canvas, 'image/png')
        const r = String(c.row).padStart(2, '0')
        const col = String(c.col).padStart(2, '0')
        entries.push({ name: `${base}_${r}_${col}.png`, blob })
      }
      if (entries.length === 0) {
        setError('내보낼 셀이 없습니다 (모두 비어 있음).')
        return
      }
      await downloadZip(entries, `${base}_sliced.zip`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
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

            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMode('count')}
                className={`rounded-md px-3 py-1 ${mode === 'count' ? 'bg-indigo-600 text-white' : ''}`}
              >
                개수 지정
              </button>
              <button
                type="button"
                onClick={() => setMode('size')}
                className={`rounded-md px-3 py-1 ${mode === 'size' ? 'bg-indigo-600 text-white' : ''}`}
              >
                셀 크기 지정
              </button>
            </div>

            {mode === 'count' ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  열 (cols)
                  <input
                    type="number"
                    min={1}
                    value={cols}
                    onChange={(e) => setCols(Math.max(1, Number(e.target.value) | 0))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                  />
                </label>
                <label className="text-sm">
                  행 (rows)
                  <input
                    type="number"
                    min={1}
                    value={rows}
                    onChange={(e) => setRows(Math.max(1, Number(e.target.value) | 0))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                  />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  셀 너비
                  <input
                    type="number"
                    min={1}
                    value={cellW}
                    onChange={(e) => setCellW(Math.max(1, Number(e.target.value) | 0))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                  />
                </label>
                <label className="text-sm">
                  셀 높이
                  <input
                    type="number"
                    min={1}
                    value={cellH}
                    onChange={(e) => setCellH(Math.max(1, Number(e.target.value) | 0))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                  />
                </label>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipEmpty}
                onChange={(e) => setSkipEmpty(e.target.checked)}
              />
              빈(투명) 셀 건너뛰기
            </label>

            <div className="text-sm text-slate-500">셀 개수: {cells.length}</div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={exportZip}
                disabled={busy || cells.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {busy ? '생성 중…' : 'ZIP 다운로드'}
              </button>
              <button
                type="button"
                onClick={() => setImage(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                이미지 변경
              </button>
            </div>
          </div>

          <div className="flex-1">
            <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
              <canvas ref={canvasRef} className="block [image-rendering:pixelated]" />
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
