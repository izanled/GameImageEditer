import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob } from '../../lib/image/export'
import { encodeGif } from '../../lib/image/gif'
import { ANCHORS, anchorOffset, type Anchor } from '../../lib/image/canvasResize'
import { sliceByCount, sliceBySize } from '../../lib/image/gridSlice'
import { computeLayout } from '../../lib/image/packSheet'

const tool = getTool('sheet-editor')!
const MAX_SIDE = 16384

interface Frame {
  id: number
  canvas: HTMLCanvasElement
  /** Pristine copy of the sliced pixels, used to undo erasing on reset. */
  base: HTMLCanvasElement
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

// Rotate a canvas 90° clockwise into a fresh canvas (width/height swap).
function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = createCanvas(src.height, src.width)
  const ctx = getContext(out, false)
  ctx.translate(out.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(src, 0, 0)
  // Reset the transform: getContext('2d') returns this same context object later
  // (e.g. when erasing/resetting the frame), so a leftover rotation would offset
  // every subsequent draw onto this canvas.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return out
}

const allowDrop = (e: React.DragEvent) => e.preventDefault()

// Memoised so reordering/deleting one frame only re-renders the cards whose
// index (or selection) actually changed, instead of the whole 100+ card grid.
interface FrameCardProps {
  id: number
  url: string
  scale: number
  index: number
  selected: boolean
  onSelect: (index: number) => void
  onReorder: (from: number, to: number) => void
  onRemove: (id: number) => void
  onDragStart: (index: number) => void
  onDrop: (index: number) => void
}

const FrameCard = memo(function FrameCard({
  id,
  url,
  scale,
  index,
  selected,
  onSelect,
  onReorder,
  onRemove,
  onDragStart,
  onDrop,
}: FrameCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={allowDrop}
      onDrop={() => onDrop(index)}
      className={`flex w-20 cursor-move flex-col items-center gap-1 rounded-lg border p-1 ${
        selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        className="checkerboard flex h-14 w-full cursor-pointer items-center justify-center overflow-hidden rounded"
        aria-label={`프레임 ${index + 1} 선택`}
      >
        <img
          src={url}
          alt={`frame ${index + 1}`}
          className="max-h-14 max-w-full [image-rendering:pixelated]"
          style={{ transform: `scale(${scale})` }}
        />
      </button>
      <div className="text-[10px] text-slate-400">#{index + 1}</div>
      <div className="flex gap-0.5">
        <button type="button" onClick={() => onReorder(index, index - 1)} className="rounded border border-slate-300 px-1 text-xs dark:border-slate-700" aria-label="앞으로">◀</button>
        <button type="button" onClick={() => onReorder(index, index + 1)} className="rounded border border-slate-300 px-1 text-xs dark:border-slate-700" aria-label="뒤로">▶</button>
        <button type="button" onClick={() => onRemove(id)} className="rounded border border-slate-300 px-1 text-xs text-red-500 dark:border-slate-700" aria-label="삭제">✕</button>
      </div>
    </div>
  )
})

interface TrashCardProps {
  id: number
  url: string
  ctrlBtn: string
  onRestore: (id: number) => void
  onPurge: (id: number) => void
}

const TrashCard = memo(function TrashCard({ id, url, ctrlBtn, onRestore, onPurge }: TrashCardProps) {
  return (
    <div className="flex w-20 flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 p-1 opacity-70 dark:border-slate-700">
      <div className="checkerboard flex h-14 w-full items-center justify-center overflow-hidden rounded">
        <img src={url} alt="삭제된 프레임" className="max-h-14 max-w-full [image-rendering:pixelated]" />
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={() => onRestore(id)} className={ctrlBtn}>
          복원
        </button>
        <button
          type="button"
          onClick={() => onPurge(id)}
          className="rounded border border-slate-300 px-1 text-xs text-red-500 dark:border-slate-700"
          aria-label="영구 삭제"
        >
          ✕
        </button>
      </div>
    </div>
  )
})

export default function SheetEditorTool() {
  // --- staging (a sheet being sliced into frames) ---
  const [staging, setStaging] = useState<LoadedImage | null>(null)
  const [mode, setMode] = useState<'count' | 'size'>('count')
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(4)
  const [cellW, setCellW] = useState(32)
  const [cellH, setCellH] = useState(32)
  // grid spacing in the *source* sheet, plus an inward shave to drop edge bleed
  const [srcMargin, setSrcMargin] = useState(0)
  const [srcSpacing, setSrcSpacing] = useState(0)
  const [srcInset, setSrcInset] = useState(0)
  const stageRef = useRef<HTMLCanvasElement>(null)

  // --- frame pool + output ---
  const [frames, setFrames] = useState<Frame[]>([])
  // frames removed via the ✕ button, kept so they can be restored
  const [trash, setTrash] = useState<{ frame: Frame; index: number }[]>([])
  const [outCols, setOutCols] = useState(4)
  const [outPad, setOutPad] = useState(0)
  const [outMargin, setOutMargin] = useState(0)
  const [outAnchor, setOutAnchor] = useState<Anchor>('center')
  const [transparent, setTransparent] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const [gifTarget, setGifTarget] = useState('all')
  const [gifFps, setGifFps] = useState(8)
  const outRef = useRef<HTMLCanvasElement>(null)
  const dragIndex = useRef<number | null>(null)

  // --- preview / per-frame editor ---
  const [animSel, setAnimSel] = useState<string>('all')
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(8)
  const [frameIdx, setFrameIdx] = useState(0)
  const [showGuides, setShowGuides] = useState(true)
  const [baselineFrac, setBaselineFrac] = useState(0.85)
  const [editTool, setEditTool] = useState<'move' | 'erase'>('move')
  const [brush, setBrush] = useState(12)
  const [brushShape, setBrushShape] = useState<'round' | 'square'>('round')
  const editRef = useRef<HTMLCanvasElement>(null)
  const brushRef = useRef<HTMLDivElement>(null)
  // live view metrics for pointer math (kept in a ref to avoid stale closures)
  const viewRef = useRef({ ds: 1, cellW: 1, cellH: 1 })
  const dragMode = useRef<null | 'sprite' | 'guide' | 'erase'>(null)
  const lastPt = useRef({ x: 0, y: 0 })
  // carries a target pool index across the animSel-change frameIdx reset
  const pendingPoolRef = useRef<number | null>(null)

  const [error, setError] = useState<string | null>(null)

  const stageCells = useMemo(() => {
    if (!staging) return []
    const base =
      mode === 'count'
        ? sliceByCount(staging.width, staging.height, Math.max(1, cols), Math.max(1, rows), srcMargin, srcSpacing)
        : sliceBySize(staging.width, staging.height, Math.max(1, cellW), Math.max(1, cellH), srcMargin, srcSpacing)
    if (srcInset === 0) return base
    // positive inset shaves each cell inward (drop bleed); negative inset grows
    // each cell outward to recover pixels that spilled into neighbour frames
    return base
      .map((c) => ({
        ...c,
        x: c.x + srcInset,
        y: c.y + srcInset,
        w: c.w - 2 * srcInset,
        h: c.h - 2 * srcInset,
      }))
      .filter((c) => c.w > 0 && c.h > 0)
  }, [staging, mode, cols, rows, cellW, cellH, srcMargin, srcSpacing, srcInset])

  const outLayout = useMemo(
    () =>
      computeLayout(
        frames.map((f) => ({
          // Image scale affects only pixels inside the cell, never the frame
          // dimensions used to pack the exported sheet.
          w: f.w,
          h: f.h,
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

  // latest-value refs so the list callbacks below can stay referentially stable
  // (memo-friendly) without closing over frames/trash/setIndices.
  const framesRef = useRef(frames)
  framesRef.current = frames
  const trashRef = useRef(trash)
  trashRef.current = trash
  const setIndicesRef = useRef(setIndices)
  setIndicesRef.current = setIndices

  function updateFrame(id: number, patch: (f: Frame) => Partial<Frame>) {
    setFrames((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch(f) } : f)))
  }

  // select a frame for editing by its pool index (clicking a thumbnail)
  const selectFrameByPool = useCallback((i: number) => {
    setPlaying(false)
    const pos = setIndicesRef.current.indexOf(i)
    if (pos >= 0) {
      setFrameIdx(pos)
    } else {
      // frame lives outside the current animation set → reveal it in '전체'
      pendingPoolRef.current = i
      setAnimSel('all')
    }
  }, [])

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
      // Untransformed frames already fit their cell. Any scale or nudge can
      // overflow, so it is clipped to keep every exported frame size fixed.
      if (f.scale === 1 && f.dx === 0 && f.dy === 0) {
        ctx.drawImage(f.canvas, p.drawX * scale, p.drawY * scale, p.w * scale, p.h * scale)
        continue
      }
      const cellX = outMargin + p.col * (outLayout.cellW + outPad)
      const cellY = outMargin + p.row * (outLayout.cellH + outPad)
      const fw = Math.max(1, Math.round(f.w * f.scale))
      const fh = Math.max(1, Math.round(f.h * f.scale))
      const [bx, by] = anchorOffset(outAnchor, outLayout.cellW, outLayout.cellH, fw, fh)
      ctx.save()
      ctx.beginPath()
      ctx.rect(cellX * scale, cellY * scale, outLayout.cellW * scale, outLayout.cellH * scale)
      ctx.clip()
      ctx.drawImage(
        f.canvas,
        (cellX + bx + f.dx) * scale,
        (cellY + by + f.dy) * scale,
        fw * scale,
        fh * scale,
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

  // per-frame editor / animation frame render. Reused live while erasing.
  function redrawEditor() {
    const canvas = editRef.current
    if (!canvas || !curFrame || outLayout.cellW < 1) return
    const cw = outLayout.cellW
    const ch = outLayout.cellH
    // A transform changes only the image; the visible frame boundary stays fixed.
    const ds = clamp(Math.min(420 / cw, 420 / ch), 0.5, 16)
    viewRef.current = { ds, cellW: cw, cellH: ch }
    const dw = Math.max(1, Math.round(cw * ds))
    const dh = Math.max(1, Math.round(ch * ds))
    if (canvas.width !== dw) canvas.width = dw
    if (canvas.height !== dh) canvas.height = dh
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
  }

  useEffect(() => {
    redrawEditor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curFrame, frames, outLayout, outAnchor, showGuides, baselineFrac])

  // reset playback position when the selected set changes. If a thumbnail click
  // switched us to '전체' to reveal a frame, jump to that frame instead of 0.
  useEffect(() => {
    const pending = pendingPoolRef.current
    if (pending != null) {
      pendingPoolRef.current = null
      setFrameIdx(pending) // in '전체', frameIdx position === pool index
    } else {
      setFrameIdx(0)
    }
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

  // hide the brush indicator whenever we leave erase mode
  useEffect(() => {
    if (editTool !== 'erase' && brushRef.current) brushRef.current.style.display = 'none'
  }, [editTool])

  // erase a brush dab at the pointer, mapping display px -> source-canvas px
  function eraseAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const f = curFrame
    if (!f) return
    const rect = editRef.current!.getBoundingClientRect()
    const { ds, cellW: cw, cellH: ch } = viewRef.current
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const fw = Math.max(1, Math.round(f.w * f.scale))
    const fh = Math.max(1, Math.round(f.h * f.scale))
    const [bx, by] = anchorOffset(outAnchor, cw, ch, fw, fh)
    const srcX = ((px / ds - (bx + f.dx)) / fw) * f.w
    const srcY = ((py / ds - (by + f.dy)) / fh) * f.h
    const srcR = Math.max(0.5, brush / 2 / (f.scale * ds))
    const ctx = getContext(f.canvas, false)
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    if (brushShape === 'square') {
      ctx.fillRect(srcX - srcR, srcY - srcR, srcR * 2, srcR * 2)
    } else {
      ctx.beginPath()
      ctx.arc(srcX, srcY, srcR, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    redrawEditor()
  }

  // move the round brush-size indicator to follow the cursor (erase mode only)
  function updateBrushCursor(e: React.PointerEvent<HTMLCanvasElement>) {
    const el = brushRef.current
    if (!el) return
    if (editTool !== 'erase') {
      el.style.display = 'none'
      return
    }
    const rect = editRef.current!.getBoundingClientRect()
    el.style.display = 'block'
    el.style.width = `${brush}px`
    el.style.height = `${brush}px`
    el.style.left = `${e.clientX - rect.left}px`
    el.style.top = `${e.clientY - rect.top}px`
  }

  function onEditPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!curFrame) return
    setPlaying(false)
    const canvas = editRef.current!
    canvas.setPointerCapture(e.pointerId)
    if (editTool === 'erase') {
      dragMode.current = 'erase'
      eraseAt(e)
      return
    }
    const rect = canvas.getBoundingClientRect()
    const { ds, cellH: ch } = viewRef.current
    const my = e.clientY - rect.top
    const gy = baselineFrac * ch * ds
    dragMode.current = showGuides && Math.abs(my - gy) <= 6 ? 'guide' : 'sprite'
    lastPt.current = { x: e.clientX, y: e.clientY }
  }
  function onEditPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    updateBrushCursor(e)
    if (!dragMode.current || !curFrame) return
    if (dragMode.current === 'erase') {
      eraseAt(e)
      return
    }
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
    // commit erasing: refresh the thumbnail and let previews repaint
    if (dragMode.current === 'erase' && curFrame) {
      updateFrame(curFrame.id, (f) => ({ url: f.canvas.toDataURL('image/png') }))
    }
    dragMode.current = null
    editRef.current?.releasePointerCapture(e.pointerId)
  }

  function flipFrame(id: number) {
    const f = frames.find((fr) => fr.id === id)
    if (!f) return
    // Mutate the canvas once here — doing it inside the setFrames updater would
    // flip twice under StrictMode's double-invoked updater and cancel out.
    const tmp = createCanvas(f.canvas.width, f.canvas.height)
    const tctx = getContext(tmp, false)
    tctx.translate(f.canvas.width, 0)
    tctx.scale(-1, 1)
    tctx.drawImage(f.canvas, 0, 0)
    const ctx = getContext(f.canvas, false)
    ctx.clearRect(0, 0, f.canvas.width, f.canvas.height)
    ctx.drawImage(tmp, 0, 0)
    updateFrame(id, (fr) => ({ url: fr.canvas.toDataURL('image/png') }))
  }

  // Rotate a frame 90° clockwise per click (4 clicks return to the original).
  // Both the working canvas and the pristine base are rotated so "이 프레임 초기화"
  // keeps the current orientation, and w/h swap for non-square frames. Fresh
  // canvases are built once here (not inside the setFrames updater) so StrictMode's
  // double-invoked updater can't rotate twice.
  function rotateFrame(id: number) {
    const f = frames.find((fr) => fr.id === id)
    if (!f) return
    const canvas = rotate90(f.canvas)
    const base = rotate90(f.base)
    updateFrame(id, () => ({
      canvas,
      base,
      w: canvas.width,
      h: canvas.height,
      url: canvas.toDataURL('image/png'),
    }))
  }

  // Rotate every frame 90° clockwise in a single action (see rotateFrame).
  function rotateAllFrames() {
    if (frames.length === 0) return
    // Precompute rotated canvases once, keyed by id, so StrictMode's
    // double-invoked updater can't rotate twice.
    const rotated = new Map(
      frames.map((f) => [f.id, { canvas: rotate90(f.canvas), base: rotate90(f.base) }]),
    )
    setFrames((prev) =>
      prev.map((f) => {
        const r = rotated.get(f.id)
        if (!r) return f
        return {
          ...f,
          canvas: r.canvas,
          base: r.base,
          w: r.canvas.width,
          h: r.canvas.height,
          url: r.canvas.toDataURL('image/png'),
        }
      }),
    )
  }

  // restore the pristine slice (undoes erasing) and clears the transform
  function resetFrame(id: number) {
    setFrames((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f
        const ctx = getContext(f.canvas, false)
        ctx.clearRect(0, 0, f.canvas.width, f.canvas.height)
        ctx.drawImage(f.base, 0, 0)
        return { ...f, dx: 0, dy: 0, scale: 1, url: f.canvas.toDataURL('image/png') }
      }),
    )
  }

  function addFromStaging() {
    if (!staging || stageCells.length === 0) return
    const iw = staging.width
    const ih = staging.height
    const added: Frame[] = stageCells.map((c) => {
      const cw = Math.max(1, c.w)
      const ch = Math.max(1, c.h)
      const canvas = createCanvas(cw, ch)
      const ctx = getContext(canvas, false)
      // a cell may reach outside the sheet (negative margin/spacing/inset).
      // draw only the part that overlaps the image; the rest stays transparent.
      const sx = Math.max(0, c.x)
      const sy = Math.max(0, c.y)
      const sw = Math.min(iw, c.x + cw) - sx
      const sh = Math.min(ih, c.y + ch) - sy
      if (sw > 0 && sh > 0) {
        ctx.drawImage(staging.el, sx, sy, sw, sh, sx - c.x, sy - c.y, sw, sh)
      }
      const base = createCanvas(cw, ch)
      getContext(base, false).drawImage(canvas, 0, 0)
      return {
        id: nextId++,
        canvas,
        base,
        w: cw,
        h: ch,
        url: canvas.toDataURL('image/png'),
        dx: 0,
        dy: 0,
        scale: 1,
      }
    })
    setFrames((prev) => [...prev, ...added])
    setStaging(null)
  }

  // append a blank frame sized to the current cell (falls back to 32px)
  function addEmptyFrame() {
    const w = Math.max(1, outLayout.cellW || 32)
    const h = Math.max(1, outLayout.cellH || 32)
    const canvas = createCanvas(w, h)
    const base = createCanvas(w, h)
    const frame: Frame = {
      id: nextId++,
      canvas,
      base,
      w,
      h,
      url: canvas.toDataURL('image/png'),
      dx: 0,
      dy: 0,
      scale: 1,
    }
    setFrames((prev) => [...prev, frame])
  }

  // duplicate a frame (pixels, pristine base, and transform) right after it
  function duplicateFrame(id: number) {
    const src = frames.find((f) => f.id === id)
    if (!src) return
    const canvas = createCanvas(src.canvas.width, src.canvas.height)
    getContext(canvas, false).drawImage(src.canvas, 0, 0)
    const base = createCanvas(src.base.width, src.base.height)
    getContext(base, false).drawImage(src.base, 0, 0)
    const copy: Frame = {
      id: nextId++,
      canvas,
      base,
      w: src.w,
      h: src.h,
      url: canvas.toDataURL('image/png'),
      dx: src.dx,
      dy: src.dy,
      scale: src.scale,
    }
    setFrames((prev) => {
      const at = prev.findIndex((f) => f.id === id)
      const next = [...prev]
      next.splice(at < 0 ? next.length : at + 1, 0, copy)
      return next
    })
  }

  const removeFrame = useCallback((id: number) => {
    const cur = framesRef.current
    const idx = cur.findIndex((f) => f.id === id)
    if (idx < 0) return
    // Push to trash OUTSIDE the setFrames updater — running it inside would
    // double-add under StrictMode's double-invoked updater (see flipFrame).
    setTrash((t) => [{ frame: cur[idx], index: idx }, ...t])
    setFrames((prev) => prev.filter((f) => f.id !== id))
  }, [])
  // re-insert a trashed frame at (close to) its original position
  const restoreFrame = useCallback((frameId: number) => {
    const item = trashRef.current.find((t) => t.frame.id === frameId)
    if (!item) return
    setFrames((prev) => {
      const next = [...prev]
      next.splice(Math.min(item.index, next.length), 0, item.frame)
      return next
    })
    setTrash((prev) => prev.filter((t) => t.frame.id !== frameId))
  }, [])
  // permanently drop a trashed frame
  const purgeFrame = useCallback((frameId: number) => {
    setTrash((prev) => prev.filter((t) => t.frame.id !== frameId))
  }, [])
  const reorder = useCallback((from: number, to: number) => {
    setFrames((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length)
        return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])
  // stable drag handlers shared by every (memoised) frame card
  const onCardDragStart = useCallback((i: number) => {
    dragIndex.current = i
  }, [])
  const onCardDrop = useCallback(
    (i: number) => {
      if (dragIndex.current !== null) reorder(dragIndex.current, i)
      dragIndex.current = null
    },
    [reorder],
  )

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

  // GIF export: whole sheet (전체) or a single row (행 N). Pool order is preserved.
  const gifOptions = useMemo(() => {
    const n = frames.length
    const opts = [{ value: 'all', label: `전체 (${n})` }]
    const rowCounts = new Array(outLayout.rows).fill(0)
    for (let i = 0; i < n; i++) rowCounts[Math.floor(i / outCols)]++
    for (let r = 0; r < outLayout.rows; r++) {
      if (rowCounts[r]) opts.push({ value: `row:${r}`, label: `행 ${r + 1} (${rowCounts[r]})` })
    }
    return opts
  }, [frames.length, outCols, outLayout.rows])

  function gifFrameIndices(): number[] {
    const all = frames.map((_, i) => i)
    if (gifTarget.startsWith('row:')) {
      const r = Number(gifTarget.slice(4))
      return all.filter((i) => Math.floor(i / outCols) === r)
    }
    return all
  }

  // render one animation frame (a single cell, with its per-frame transform) at 1:1
  function renderGifCell(f: Frame): HTMLCanvasElement {
    const cw = outLayout.cellW
    const ch = outLayout.cellH
    const canvas = createCanvas(cw, ch)
    const ctx = getContext(canvas, false)
    if (!transparent) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, cw, ch)
    }
    const fw = Math.max(1, Math.round(f.w * f.scale))
    const fh = Math.max(1, Math.round(f.h * f.scale))
    const [bx, by] = anchorOffset(outAnchor, cw, ch, fw, fh)
    ctx.drawImage(f.canvas, bx + f.dx, by + f.dy, fw, fh)
    return canvas
  }

  function exportGif() {
    const idxs = gifFrameIndices()
    if (idxs.length === 0 || outLayout.cellW < 1 || outLayout.cellH < 1) return
    setError(null)
    const cells = idxs.map((i) => renderGifCell(frames[i]))
    const blob = encodeGif(cells, { fps: gifFps, transparent })
    const suffix = gifTarget.startsWith('row:') ? `_row${Number(gifTarget.slice(4)) + 1}` : ''
    downloadBlob(blob, `spritesheet_edited${suffix}.gif`)
  }

  // animation set options for the combobox
  const animOptions = useMemo(() => {
    const n = frames.length
    const opts = [{ value: 'all', label: `전체 (${n})` }]
    const rowCounts = new Array(outLayout.rows).fill(0)
    const colCounts = new Array(outCols).fill(0)
    for (let i = 0; i < n; i++) {
      rowCounts[Math.floor(i / outCols)]++
      colCounts[i % outCols]++
    }
    for (let r = 0; r < outLayout.rows; r++) {
      if (rowCounts[r]) opts.push({ value: `row:${r}`, label: `행 ${r + 1} (${rowCounts[r]})` })
    }
    for (let c = 0; c < outCols; c++) {
      if (colCounts[c]) opts.push({ value: `col:${c}`, label: `열 ${c + 1} (${colCounts[c]})` })
    }
    return opts
  }, [frames.length, outCols, outLayout.rows])

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
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  여백
                  <input type="number" value={srcMargin} onChange={(e) => setSrcMargin(clamp(Number(e.target.value) | 0, -2048, 2048))} className={numInput} />
                </label>
                <label className="text-sm">
                  간격
                  <input type="number" value={srcSpacing} onChange={(e) => setSrcSpacing(clamp(Number(e.target.value) | 0, -2048, 2048))} className={numInput} />
                </label>
              </div>
              <label className="block text-sm">
                가장자리 (음수=확장)
                <input type="number" value={srcInset} onChange={(e) => setSrcInset(clamp(Number(e.target.value) | 0, -2048, 2048))} className={numInput} />
              </label>
              <p className="text-xs text-slate-400">
                양수는 칸을 좁혀 이웃 픽셀을 잘라냅니다. <strong>음수</strong>를 넣으면 칸을 키워 옆 프레임으로 침범한 픽셀까지 되살립니다(프레임이 커지고 서로 겹침 → 겹친 부분은 지우개로 정리).
              </p>
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
                  onClick={rotateAllFrames}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  ↻ 전체 90° 회전
                </button>
                <button
                  type="button"
                  onClick={addEmptyFrame}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  빈 프레임 추가
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
                    onChange={(e) => setGifFps(clamp(Number(e.target.value) | 0, 1, 60))}
                    className="w-16 rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                  />
                </label>
                <DownloadButton onClick={exportGif}>GIF 내보내기</DownloadButton>
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
                    <div className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setEditTool('move')}
                        className={`rounded px-2 py-0.5 text-xs ${editTool === 'move' ? 'bg-indigo-600 text-white' : ''}`}
                      >
                        이동
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTool('erase')}
                        className={`rounded px-2 py-0.5 text-xs ${editTool === 'erase' ? 'bg-indigo-600 text-white' : ''}`}
                      >
                        지우개
                      </button>
                    </div>
                    {editTool === 'erase' && (
                      <>
                        <label className="flex items-center gap-1">
                          굵기
                          <input
                            type="number"
                            min={2}
                            max={64}
                            value={brush}
                            onChange={(e) => setBrush(clamp(Number(e.target.value) | 0, 2, 64))}
                            className="w-14 rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                          />
                        </label>
                        <div className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => setBrushShape('round')}
                            aria-label="원형 지우개"
                            className={`rounded px-2 py-0.5 text-xs ${brushShape === 'round' ? 'bg-indigo-600 text-white' : ''}`}
                          >
                            ● 원
                          </button>
                          <button
                            type="button"
                            onClick={() => setBrushShape('square')}
                            aria-label="사각 지우개"
                            className={`rounded px-2 py-0.5 text-xs ${brushShape === 'square' ? 'bg-indigo-600 text-white' : ''}`}
                          >
                            ■ 사각
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                    <div className="relative w-max">
                      <canvas
                        ref={editRef}
                        onPointerDown={onEditPointerDown}
                        onPointerMove={onEditPointerMove}
                        onPointerUp={onEditPointerUp}
                        onPointerEnter={updateBrushCursor}
                        onPointerLeave={() => { if (brushRef.current) brushRef.current.style.display = 'none' }}
                        className={`block touch-none [image-rendering:pixelated] ${editTool === 'erase' ? 'cursor-crosshair' : 'cursor-move'}`}
                      />
                      <div
                        ref={brushRef}
                        className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] ${brushShape === 'square' ? 'rounded-none' : 'rounded-full'}`}
                        style={{ display: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  {curFrame && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="tabular-nums">
                        크기 {Math.round(curFrame.scale * 100)}% · 위치 {Math.round(curFrame.dx)},{Math.round(curFrame.dy)}
                      </span>
                      <button type="button" onClick={() => flipFrame(curFrame.id)} className={ctrlBtn}>
                        좌우 반전
                      </button>
                      <button type="button" onClick={() => rotateFrame(curFrame.id)} className={ctrlBtn}>
                        ↻ 90° 회전
                      </button>
                      <button type="button" onClick={() => duplicateFrame(curFrame.id)} className={ctrlBtn}>
                        복사
                      </button>
                      <button type="button" onClick={() => resetFrame(curFrame.id)} className={ctrlBtn}>
                        이 프레임 초기화
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    {editTool === 'erase'
                      ? '지우개: 드래그로 군더더기 픽셀 삭제 · "이 프레임 초기화"로 되돌리기'
                      : '드래그로 위치 이동 · 휠로 크기 조정 · 빨간 가로선 드래그로 기준선 이동(모든 프레임 공통)'}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm text-slate-500">
                  프레임 순서 (드래그 또는 ◀▶로 이동)
                </div>
                <div className="flex flex-wrap gap-2">
                  {frames.map((f, i) => (
                    <FrameCard
                      key={f.id}
                      id={f.id}
                      url={f.url}
                      scale={f.scale}
                      index={i}
                      selected={i === curPoolIndex}
                      onSelect={selectFrameByPool}
                      onReorder={reorder}
                      onRemove={removeFrame}
                      onDragStart={onCardDragStart}
                      onDrop={onCardDrop}
                    />
                  ))}
                </div>
              </div>

              {trash.length > 0 && (
                <div>
                  <div className="mb-2 text-sm text-slate-500">휴지통 (삭제된 프레임 · 복원 가능)</div>
                  <div className="flex flex-wrap gap-2">
                    {trash.map((t) => (
                      <TrashCard
                        key={t.frame.id}
                        id={t.frame.id}
                        url={t.frame.url}
                        ctrlBtn={ctrlBtn}
                        onRestore={restoreFrame}
                        onPurge={purgeFrame}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
