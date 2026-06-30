import { useEffect, useMemo, useRef, useState } from 'react'
import MultiImageDropzone, { type NamedImage } from '../../components/MultiImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob } from '../../lib/image/export'
import { encodeGif } from '../../lib/image/gif'
import { ANCHORS, anchorOffset, type Anchor } from '../../lib/image/canvasResize'
import { computeLayout } from '../../lib/image/packSheet'

const tool = getTool('sprite-sheet')!
const MAX_SIDE = 16384

interface Frame {
  id: number
  /** null → a blank (fully transparent) spacer frame */
  img: LoadedImage | null
  name: string
  w: number
  h: number
}

let nextId = 1

export default function SpriteSheetTool() {
  const [frames, setFrames] = useState<Frame[]>([])
  const [cols, setCols] = useState(4)
  const [padding, setPadding] = useState(0)
  const [margin, setMargin] = useState(0)
  const [anchor, setAnchor] = useState<Anchor>('center')
  const [transparent, setTransparent] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const [gifTarget, setGifTarget] = useState('all')
  const [gifFps, setGifFps] = useState(8)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function addImages(images: NamedImage[]) {
    setError(null)
    setFrames((prev) => [
      ...prev,
      ...images.map((n) => ({
        id: nextId++,
        img: n.img,
        name: n.name,
        w: n.img.width,
        h: n.img.height,
      })),
    ])
  }
  // append a blank, fully-transparent frame sized to the current cell (falls back to 32px)
  function addEmptyFrame() {
    const w = Math.max(1, layout.cellW || 32)
    const h = Math.max(1, layout.cellH || 32)
    setFrames((prev) => [...prev, { id: nextId++, img: null, name: '(빈 프레임)', w, h }])
  }
  function removeFrame(id: number) {
    setFrames((prev) => prev.filter((f) => f.id !== id))
  }
  function move(index: number, dir: -1 | 1) {
    setFrames((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }
  function sortByName() {
    setFrames((prev) =>
      [...prev].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    )
  }

  const layout = useMemo(
    () =>
      computeLayout(
        frames.map((f) => ({ w: f.w, h: f.h })),
        cols,
        padding,
        margin,
        anchor,
      ),
    [frames, cols, padding, margin, anchor],
  )

  // preview (scaled to fit)
  useEffect(() => {
    if (!canvasRef.current || frames.length === 0 || layout.sheetW < 1) return
    const fit = Math.min(560 / layout.sheetW, 440 / layout.sheetH)
    const scale = Math.min(fit, 8)
    const dw = Math.max(1, Math.round(layout.sheetW * scale))
    const dh = Math.max(1, Math.round(layout.sheetH * scale))
    const canvas = canvasRef.current
    canvas.width = dw
    canvas.height = dh
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, dw, dh)
    if (!transparent) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, dw, dh)
    }
    for (const p of layout.placements) {
      const f = frames[p.index]
      if (f.img) ctx.drawImage(f.img.el, p.drawX * scale, p.drawY * scale, p.w * scale, p.h * scale)
    }
  }, [frames, layout, transparent, bg])

  async function download() {
    if (frames.length === 0) return
    if (layout.sheetW > MAX_SIDE || layout.sheetH > MAX_SIDE) {
      setError(`시트가 너무 큽니다 (최대 ${MAX_SIDE}px). 열 수나 여백을 조정하세요.`)
      return
    }
    const canvas = createCanvas(layout.sheetW, layout.sheetH)
    const ctx = getContext(canvas, false)
    if (!transparent) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, layout.sheetW, layout.sheetH)
    }
    for (const p of layout.placements) {
      const f = frames[p.index]
      if (f.img) ctx.drawImage(f.img.el, p.drawX, p.drawY, p.w, p.h)
    }
    const blob = await canvasToBlob(canvas, 'image/png')
    downloadBlob(blob, 'spritesheet.png')
  }

  // GIF export: whole sheet (전체) or a single row (행 N), in frame order.
  const gifOptions = useMemo(() => {
    const opts = [{ value: 'all', label: `전체 (${frames.length})` }]
    for (let r = 0; r < layout.rows; r++) {
      const count = frames.filter((_, i) => Math.floor(i / cols) === r).length
      if (count) opts.push({ value: `row:${r}`, label: `행 ${r + 1} (${count})` })
    }
    return opts
  }, [frames, cols, layout.rows])

  function exportGif() {
    if (frames.length === 0 || layout.cellW < 1 || layout.cellH < 1) return
    const all = frames.map((_, i) => i)
    const idxs = gifTarget.startsWith('row:')
      ? all.filter((i) => Math.floor(i / cols) === Number(gifTarget.slice(4)))
      : all
    if (idxs.length === 0) return
    setError(null)
    const cw = layout.cellW
    const ch = layout.cellH
    const cells = idxs.map((i) => {
      const f = frames[i]
      const canvas = createCanvas(cw, ch)
      const ctx = getContext(canvas, false)
      if (!transparent) {
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, cw, ch)
      }
      if (f.img) {
        const [ox, oy] = anchorOffset(anchor, cw, ch, f.img.width, f.img.height)
        ctx.drawImage(f.img.el, ox, oy, f.img.width, f.img.height)
      }
      return canvas
    })
    const blob = encodeGif(cells, { fps: gifFps, transparent })
    const suffix = gifTarget.startsWith('row:') ? `_row${Number(gifTarget.slice(4)) + 1}` : ''
    downloadBlob(blob, `spritesheet${suffix}.gif`)
  }

  return (
    <ToolShell tool={tool}>
      {frames.length === 0 ? (
        <MultiImageDropzone onImages={addImages} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <div className="text-sm text-slate-500">프레임: {frames.length}개</div>

            <label className="block text-sm">
              열 (cols)
              <input
                type="number"
                min={1}
                value={cols}
                onChange={(e) => setCols(Math.max(1, Number(e.target.value) | 0))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                간격 (padding)
                <input
                  type="number"
                  min={0}
                  value={padding}
                  onChange={(e) => setPadding(Math.max(0, Number(e.target.value) | 0))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                />
              </label>
              <label className="text-sm">
                바깥 여백 (margin)
                <input
                  type="number"
                  min={0}
                  value={margin}
                  onChange={(e) => setMargin(Math.max(0, Number(e.target.value) | 0))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                />
              </label>
            </div>

            <div>
              <div className="mb-1 text-sm text-slate-500">셀 내 정렬 (앵커)</div>
              <div className="grid w-28 grid-cols-3 gap-1">
                {ANCHORS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-label={a}
                    onClick={() => setAnchor(a)}
                    className={`aspect-square rounded border text-xs ${
                      anchor === a
                        ? 'border-indigo-500 bg-indigo-500 text-white'
                        : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    ●
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              투명 배경
            </label>
            {!transparent && (
              <label className="flex items-center gap-2 text-sm">
                배경색
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              </label>
            )}

            <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
              시트: {layout.sheetW} × {layout.sheetH} · 셀: {layout.cellW} × {layout.cellH} ·{' '}
              {layout.cols} × {layout.rows}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <DownloadButton onClick={download}>PNG 다운로드</DownloadButton>
              <button
                type="button"
                onClick={addEmptyFrame}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                빈 프레임 추가
              </button>
              <button
                type="button"
                onClick={sortByName}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                이름순 정렬
              </button>
              <button
                type="button"
                onClick={() => setFrames([])}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                전체 삭제
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-sm font-medium">GIF 애니메이션</div>
              <label className="block text-sm">
                대상
                <select
                  value={gifTarget}
                  onChange={(e) => setGifTarget(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                >
                  {gifOptions.map((o) => (
                    <option key={o.value} value={o.value} className="dark:bg-slate-800">
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                FPS
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={gifFps}
                  onChange={(e) =>
                    setGifFps(Math.max(1, Math.min(60, Number(e.target.value) | 0)))
                  }
                  className="w-16 rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                />
              </label>
              <DownloadButton onClick={exportGif}>GIF 내보내기</DownloadButton>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
              <canvas ref={canvasRef} className="block [image-rendering:pixelated]" />
            </div>

            <div>
              <div className="mb-2 text-sm text-slate-500">프레임 순서</div>
              <div className="flex flex-wrap gap-2">
                {frames.map((f, i) => (
                  <div
                    key={f.id}
                    className="flex w-20 flex-col items-center gap-1 rounded-lg border border-slate-200 p-1 dark:border-slate-700"
                  >
                    <div className="checkerboard flex h-14 w-full items-center justify-center overflow-hidden rounded">
                      {f.img ? (
                        <img
                          src={f.img.url}
                          alt={f.name}
                          className="max-h-14 max-w-full [image-rendering:pixelated]"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400">빈 프레임</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">#{i + 1}</div>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        className="rounded border border-slate-300 px-1 text-xs dark:border-slate-700"
                        aria-label="앞으로"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        className="rounded border border-slate-300 px-1 text-xs dark:border-slate-700"
                        aria-label="뒤로"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFrame(f.id)}
                        className="rounded border border-slate-300 px-1 text-xs text-red-500 dark:border-slate-700"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div className="w-32">
                  <MultiImageDropzone onImages={addImages} onError={setError} compact />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
