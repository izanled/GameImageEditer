import { useEffect, useMemo, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob } from '../../lib/image/export'
import { ANCHORS, anchorOffset, type Anchor } from '../../lib/image/canvasResize'
import { sliceByCount, sliceBySize } from '../../lib/image/gridSlice'
import { computeLayout } from '../../lib/image/packSheet'

const tool = getTool('sheet-editor')!
const MAX_SIDE = 16384

interface Frame {
  id: number
  canvas: HTMLCanvasElement
  w: number
  h: number
  url: string
  /** Per-frame alignment transform, in sheet (cell-space) pixels. */
  dx: number
  dy: number
  scale: number
}

let nextId = 1

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export default function SheetEditorTool() {
  // --- staging (a sheet being sliced into frames) ---
  const [staging, setStaging] = useState<LoadedImage | null>(null)
  const [mode, setMode] = useState<'count' | 'size'>('count')
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(4)
  const [cellW, setCellW] = useState(32)
  const [cellH, setCellH] = useState(32)
  const stageRef = useRef<HTMLCanvasElement>(null)

  // --- frame pool + output ---
  const [frames, setFrames] = useState<Frame[]>([])
  const [outCols, setOutCols] = useState(4)
  const [outPad, setOutPad] = useState(0)
  const [outMargin, setOutMargin] = useState(0)
  const [outAnchor, setOutAnchor] = useState<Anchor>('center')
  const [transparent, setTransparent] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const outRef = useRef<HTMLCanvasElement>(null)
  const dragIndex = useRef<number | null>(null)

  // --- preview / per-frame editor ---
  const [animSel, setAnimSel] = useState<string>('all')
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(8)
  const [frameIdx, setFrameIdx] = useState(0)
  const [showGuides, setShowGuides] = useState(true)
  const [baselineFrac, setBaselineFrac] = useState(0.85)
  const editRef = useRef<HTMLCanvasElement>(null)
  // live view metrics for pointer math (kept in a ref to avoid stale closures)
  const viewRef = useRef({ ds: 1, cellW: 1, cellH: 1 })
  const dragMode = useRef<null | 'sprite' | 'guide'>(null)
  const lastPt = useRef({ x: 0, y: 0 })

  const [error, setError] = useState<string | null>(null)

  const stageCells = useMemo(() => {
    if (!staging) return []
    return mode === 'count'
      ? sliceByCount(staging.width, staging.height, Math.max(1, cols), Math.max(1, rows))
      : sliceBySize(staging.width, staging.height, Math.max(1, cellW), Math.max(1, cellH))
  }, [staging, mode, cols, rows, cellW, cellH])

  const outLayout = useMemo(
    () =>
      computeLayout(
        frames.map((f) => ({
          w: Math.max(1, Math.round(f.w * f.scale)),
          h: Math.max(1, Math.round(f.h * f.scale)),
        })),
        outCols,
        outPad,
        outMargin,
        outAnchor,
      ),
    [frames, outCols, outPad, outMargin, outAnchor],
  )

  // frames belonging to the selected animation set (pool indices, in order)
  const setIndices = useMemo(() => {
    const n = frames.length
    const all = Array.from({ length: n }, (_, i) => i)
    if (animSel.startsWith('row:')) {
      const r = Number(animSel.slice(4))
      const sel = all.filter((i) => Math.floor(i / outCols) === r)
      return sel.length ? sel : all
    }
    if (animSel.startsWith('col:')) {
      const c = Number(animSel.slice(4))
      const sel = all.filter((i) => i % outCols === c)
      return sel.length ? sel : all
    }
    return all
  }, [animSel, frames.length, outCols])

  const curPoolIndex = setIndices.length
    ? setIndices[Math.min(frameIdx, setIndices.length - 1)]
    : -1
  const curFrame = curPoolIndex >= 0 ? frames[curPoolIndex] : null

  function updateFrame(id: number, patch: (f: Frame) => Partial<Frame>) {
    setFrames((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch(f) } : f)))
  }

  // staging preview: scaled sheet + grid overlay
  useEffect(() => {
    if (!staging || !stageRef.current) return
    const fit = Math.min(520 / staging.width, 360 / staging.height)
    const scale = Math.min(fit, 8)
    const dw = Math.max(1, Math.round(staging.width * scale))
    const dh = Math.max(1, Math.round(staging.height * scale))
    const canvas = stageRef.current
    canvas.width = dw
    canvas.height = dh
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, dw, dh)
    ctx.drawImage(staging.el, 0, 0, dw, dh)
    ctx.strokeStyle = 'rgba(99,102,241,0.9)'
    ctx.lineWidth = 1
    for (const c of stageCells) {
      ctx.strokeRect(c.x * scale + 0.5, c.y * scale + 0.5, c.w * scale, c.h * scale)
    }
  }, [staging, stageCells])

  // paint the packed sheet (with per-frame transforms) at a given display scale
  function paintSheet(ctx: CanvasRenderingContext2D, scale: number, fillBg: boolean) {
    if (fillBg && !transparent) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, outLayout.sheetW * scale, outLayout.sheetH * scale)
    }
    for (const p of outLayout.placements) {
      const f = frames[p.index]
      const cellX = outMargin + p.col * (outLayout.cellW + outPad)
      const cellY = outMargin + p.row * (outLayout.cellH + outPad)
      ctx.save()
      ctx.beginPath()
      ctx.rect(cellX * scale, cellY * scale, outLayout.cellW * scale, outLayout.cellH * scale)
      ctx.clip()
      ctx.drawImage(
        f.canvas,
        (p.drawX + f.dx) * scale,
        (p.drawY + f.dy) * scale,
        p.w * scale,
        p.h * scale,
      )
      ctx.restore()
    }
  }

  // output preview
  useEffect(() => {
    if (!outRef.current || frames.length === 0 || outLayout.sheetW < 1) return
    const fit = Math.min(560 / outLayout.sheetW, 420 / outLayout.sheetH)
    const scale = Math.min(fit, 8)
    const dw = Math.max(1, Math.round(outLayout.sheetW * scale))
    const dh = Math.max(1, Math.round(outLayout.sheetH * scale))
    const canvas = outRef.current
    canvas.width = dw
    canvas.height = dh
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, dw, dh)
    paintSheet(ctx, scale, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, outLayout, transparent, bg])

  // per-frame editor / animation frame render
  useEffect(() => {
    const canvas = editRef.current
    if (!canvas || !curFrame || outLayout.cellW < 1) return
    const cw = outLayout.cellW
    const ch = outLayout.cellH
    const ds = clamp(Math.min(420 / cw, 420 / ch), 0.5, 16)
    viewRef.current = { ds, cellW: cw, cellH: ch }
    const dw = Math.max(1, Math.round(cw * ds))
    const dh = Math.max(1, Math.round(ch * ds))
    canvas.width = dw
    canvas.height = dh
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, dw, dh)

    const fw = Math.max(1, Math.round(curFrame.w * curFrame.scale))
    const fh = Math.max(1, Math.round(curFrame.h * curFrame.scale))
    const [bx, by] = anchorOffset(outAnchor, cw, ch, fw, fh)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, dw, dh)
    ctx.clip()
    ctx.drawImage(curFrame.canvas, (bx + curFrame.dx) * ds, (by + curFrame.dy) * ds, fw * ds, fh * ds)
    ctx.restore()

    if (showGuides) {
      ctx.lineWidth = 1
      // vertical center line
      ctx.strokeStyle = 'rgba(56,189,248,0.9)'
      const cx = Math.round((cw / 2) * ds) + 0.5
      ctx.beginPath()
      ctx.moveTo(cx, 0)
      ctx.lineTo(cx, dh)
      ctx.stroke()
      // horizontal baseline (shared, draggable)
      ctx.strokeStyle = 'rgba(244,63,94,0.95)'
      const gy = Math.round(baselineFrac * ch * ds) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, gy)
      ctx.lineTo(dw, gy)
      ctx.stroke()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curFrame, frames, outLayout, outAnchor, showGuides, baselineFrac])

  // reset playback position when the selected set changes
  useEffect(() => {
    setFrameIdx(0)
  }, [animSel])

  // animation loop
  useEffect(() => {
    if (!playing || setIndices.length < 2) return
    const id = window.setInterval(
      () => setFrameIdx((i) => (i + 1) % setIndices.length),
      Math.max(1000 / 60, 1000 / Math.max(1, fps)),
    )
    return () => window.clearInterval(id)
  }, [playing, fps, setIndices.length])

  // wheel-to-scale on the editor canvas (native listener so we can preventDefault)
  useEffect(() => {
    const canvas = editRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      if (!curFrame) return
      e.preventDefault()
      setPlaying(false)
      const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05
      updateFrame(curFrame.id, (f) => ({ scale: clamp(f.scale * factor, 0.1, 8) }))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [curFrame?.id])

  function onEditPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!curFrame) return
    setPlaying(false)
    const canvas = editRef.current!
    const rect = canvas.getBoundingClientRect()
    const { ds, cellH: ch } = viewRef.current
    const my = e.clientY - rect.top
    const gy = baselineFrac * ch * ds
    dragMode.current = showGuides && Math.abs(my - gy) <= 6 ? 'guide' : 'sprite'
    lastPt.current = { x: e.clientX, y: e.clientY }
    canvas.setPointerCapture(e.pointerId)
  }
  function onEditPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragMode.current || !curFrame) return
    const { ds, cellH: ch } = viewRef.current
    if (dragMode.current === 'guide') {
      const rect = editRef.current!.getBoundingClientRect()
      setBaselineFrac(clamp((e.clientY - rect.top) / (ch * ds), 0, 1))
    } else {
      const ddx = (e.clientX - lastPt.current.x) / ds
      const ddy = (e.clientY - lastPt.current.y) / ds
      updateFrame(curFrame.id, (f) => ({ dx: f.dx + ddx, dy: f.dy + ddy }))
    }
    lastPt.current = { x: e.clientX, y: e.clientY }
  }
  function onEditPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragMode.current = null
    editRef.current?.releasePointerCapture(e.pointerId)
  }

  function resetFrame(id: number) {
    updateFrame(id, () => ({ dx: 0, dy: 0, scale: 1 }))
  }

  function addFromStaging() {
    if (!staging || stageCells.length === 0) return
    const added: Frame[] = stageCells.map((c) => {
      const canvas = createCanvas(c.w, c.h)
      const ctx = getContext(canvas, false)
      ctx.drawImage(staging.el, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h)
      return {
        id: nextId++,
        canvas,
        w: c.w,
        h: c.h,
        url: canvas.toDataURL('image/png'),
        dx: 0,
        dy: 0,
        scale: 1,
      }
    })
    setFrames((prev) => [...prev, ...added])
    setStaging(null)
  }

  function removeFrame(id: number) {
    setFrames((prev) => prev.filter((f) => f.id !== id))
  }
  function reorder(from: number, to: number) {
    setFrames((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length)
        return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  async function exportSheet() {
    if (frames.length === 0) return
    if (outLayout.sheetW > MAX_SIDE || outLayout.sheetH > MAX_SIDE) {
      setError(`시트가 너무 큽니다 (최대 ${MAX_SIDE}px). 열 수나 여백을 조정하세요.`)
      return
    }
    setError(null)
    const canvas = createCanvas(outLayout.sheetW, outLayout.sheetH)
    const ctx = getContext(canvas, false)
    paintSheet(ctx, 1, true)
    const blob = await canvasToBlob(canvas, 'image/png')
    downloadBlob(blob, 'spritesheet_edited.png')
  }

  // animation set options for the combobox
  const animOptions = useMemo(() => {
    const opts = [{ value: 'all', label: `전체 (${frames.length})` }]
    for (let r = 0; r < outLayout.rows; r++) {
      const count = frames.filter((_, i) => Math.floor(i / outCols) === r).length
      if (count) opts.push({ value: `row:${r}`, label: `행 ${r + 1} (${count})` })
    }
    for (let c = 0; c < outCols; c++) {
      const count = frames.filter((_, i) => i % outCols === c).length
      if (count) opts.push({ value: `col:${c}`, label: `열 ${c + 1} (${count})` })
    }
    return opts
  }, [frames, outCols, outLayout.rows])

  const numInput =
    'mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700'
  const ctrlBtn =
    'rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'

  return (
    <ToolShell tool={tool}>
      {/* Section 1 — import a sheet and slice it into frames */}
      <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="mb-3 text-sm font-semibold">1. 시트 불러와 프레임 추가</h2>
        {!staging ? (
          <ImageDropzone onImage={(img) => setStaging(img)} onError={setError} />
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row">
            <div className="shrink-0 space-y-4 lg:w-64">
              <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setMode('count')}
                  className={`rounded-md px-3 py-1 ${mode === 'count' ? 'bg-indigo-600 text-white' : ''}`}
                >
                  개수
                </button>
                <button
                  type="button"
                  onClick={() => setMode('size')}
                  className={`rounded-md px-3 py-1 ${mode === 'size' ? 'bg-indigo-600 text-white' : ''}`}
                >
                  셀 크기
                </button>
              </div>
              {mode === 'count' ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    열
                    <input type="number" min={1} value={cols} onChange={(e) => setCols(Math.max(1, Number(e.target.value) | 0))} className={numInput} />
                  </label>
                  <label className="text-sm">
                    행
                    <input type="number" min={1} value={rows} onChange={(e) => setRows(Math.max(1, Number(e.target.value) | 0))} className={numInput} />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    셀 너비
                    <input type="number" min={1} value={cellW} onChange={(e) => setCellW(Math.max(1, Number(e.target.value) | 0))} className={numInput} />
                  </label>
                  <label className="text-sm">
                    셀 높이
                    <input type="number" min={1} value={cellH} onChange={(e) => setCellH(Math.max(1, Number(e.target.value) | 0))} className={numInput} />
                  </label>
                </div>
              )}
              <div className="text-sm text-slate-500">자를 셀: {stageCells.length}개</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addFromStaging}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  프레임 추가 ({stageCells.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStaging(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  취소
                </button>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                <canvas ref={stageRef} className="block [image-rendering:pixelated]" />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Section 2 — reorder frames and export */}
      {frames.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold">2. 순서 편집 &amp; 내보내기</h2>
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="shrink-0 space-y-4 lg:w-64">
              <div className="text-sm text-slate-500">프레임: {frames.length}개</div>
              <label className="block text-sm">
                열 (cols)
                <input type="number" min={1} value={outCols} onChange={(e) => setOutCols(Math.max(1, Number(e.target.value) | 0))} className={numInput} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  간격
                  <input type="number" min={0} value={outPad} onChange={(e) => setOutPad(Math.max(0, Number(e.target.value) | 0))} className={numInput} />
                </label>
                <label className="text-sm">
                  여백
                  <input type="number" min={0} value={outMargin} onChange={(e) => setOutMargin(Math.max(0, Number(e.target.value) | 0))} className={numInput} />
                </label>
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">셀 내 정렬</div>
                <div className="grid w-28 grid-cols-3 gap-1">
                  {ANCHORS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-label={a}
                      onClick={() => setOutAnchor(a)}
                      className={`aspect-square rounded border text-xs ${
                        outAnchor === a
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
                <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
                투명 배경
              </label>
              {!transparent && (
                <label className="flex items-center gap-2 text-sm">
                  배경색
                  <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
                </label>
              )}
              <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
                시트: {outLayout.sheetW} × {outLayout.sheetH} · 셀: {outLayout.cellW} × {outLayout.cellH} · {outLayout.cols} × {outLayout.rows}
              </div>
              <div className="flex flex-wrap gap-2">
                <DownloadButton onClick={exportSheet}>PNG 내보내기</DownloadButton>
                <button
                  type="button"
                  onClick={() => setFrames([])}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  전체 삭제
                </button>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-col gap-5 2xl:flex-row">
                {/* sprite (output) preview */}
                <div className="space-y-2">
                  <div className="text-sm text-slate-500">스프라이트 미리보기</div>
                  <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                    <canvas ref={outRef} className="block [image-rendering:pixelated]" />
                  </div>
                </div>

                {/* frame preview / per-frame editor */}
                <div className="space-y-2">
                  <div className="text-sm text-slate-500">프레임 미리보기 / 편집</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      value={animSel}
                      onChange={(e) => setAnimSel(e.target.value)}
                      className="rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                      aria-label="재생 대상"
                    >
                      {animOptions.map((o) => (
                        <option key={o.value} value={o.value} className="dark:bg-slate-800">
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      className={ctrlBtn}
                      aria-label={playing ? '일시정지' : '재생'}
                    >
                      {playing ? '⏸' : '▶'}
                    </button>
                    <button type="button" onClick={() => { setPlaying(false); setFrameIdx((i) => (i - 1 + setIndices.length) % Math.max(1, setIndices.length)) }} className={ctrlBtn} aria-label="이전 프레임">◀</button>
                    <span className="tabular-nums text-slate-500">
                      {setIndices.length ? Math.min(frameIdx, setIndices.length - 1) + 1 : 0}/{setIndices.length}
                    </span>
                    <button type="button" onClick={() => { setPlaying(false); setFrameIdx((i) => (i + 1) % Math.max(1, setIndices.length)) }} className={ctrlBtn} aria-label="다음 프레임">▶</button>
                    <label className="flex items-center gap-1">
                      FPS
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={fps}
                        onChange={(e) => setFps(clamp(Number(e.target.value) | 0, 1, 60))}
                        className="w-14 rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
                      기준선
                    </label>
                  </div>
                  <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                    <canvas
                      ref={editRef}
                      onPointerDown={onEditPointerDown}
                      onPointerMove={onEditPointerMove}
                      onPointerUp={onEditPointerUp}
                      className="block touch-none cursor-move [image-rendering:pixelated]"
                    />
                  </div>
                  {curFrame && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="tabular-nums">
                        크기 {Math.round(curFrame.scale * 100)}% · 위치 {Math.round(curFrame.dx)},{Math.round(curFrame.dy)}
                      </span>
                      <button type="button" onClick={() => resetFrame(curFrame.id)} className={ctrlBtn}>
                        이 프레임 초기화
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    드래그로 위치 이동 · 휠로 크기 조정 · 빨간 가로선 드래그로 기준선 이동(모든 프레임 공통)
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm text-slate-500">
                  프레임 순서 (드래그 또는 ◀▶로 이동)
                </div>
                <div className="flex flex-wrap gap-2">
                  {frames.map((f, i) => (
                    <div
                      key={f.id}
                      draggable
                      onDragStart={() => (dragIndex.current = i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex.current !== null) reorder(dragIndex.current, i)
                        dragIndex.current = null
                      }}
                      className={`flex w-20 cursor-move flex-col items-center gap-1 rounded-lg border p-1 ${
                        i === curPoolIndex
                          ? 'border-indigo-500 ring-1 ring-indigo-500'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="checkerboard flex h-14 w-full items-center justify-center overflow-hidden rounded">
                        <img src={f.url} alt={`frame ${i + 1}`} className="max-h-14 max-w-full [image-rendering:pixelated]" />
                      </div>
                      <div className="text-[10px] text-slate-400">#{i + 1}</div>
                      <div className="flex gap-0.5">
                        <button type="button" onClick={() => reorder(i, i - 1)} className="rounded border border-slate-300 px-1 text-xs dark:border-slate-700" aria-label="앞으로">◀</button>
                        <button type="button" onClick={() => reorder(i, i + 1)} className="rounded border border-slate-300 px-1 text-xs dark:border-slate-700" aria-label="뒤로">▶</button>
                        <button type="button" onClick={() => removeFrame(f.id)} className="rounded border border-slate-300 px-1 text-xs text-red-500 dark:border-slate-700" aria-label="삭제">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
