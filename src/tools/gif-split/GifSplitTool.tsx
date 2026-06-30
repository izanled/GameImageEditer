import { useEffect, useMemo, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, baseName } from '../../lib/image/export'
import { downloadZip, type ZipEntry } from '../../lib/zip'
import { computeLayout } from '../../lib/image/packSheet'
import {
  decodeGif,
  suggestCols,
  padFrameIndex,
  type DecodedGif,
} from '../../lib/image/gifDecode'

const tool = getTool('gif-split')!
const MAX_SIDE = 16384
const MAX_THUMBS = 120

type Mode = 'sheet' | 'frames'

/** Draws a source canvas scaled into a small thumbnail. */
function FrameThumb({ source, index }: { source: HTMLCanvasElement; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const scale = Math.min(56 / source.width, 56 / source.height, 4)
    c.width = Math.max(1, Math.round(source.width * scale))
    c.height = Math.max(1, Math.round(source.height * scale))
    const ctx = getContext(c, false)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(source, 0, 0, c.width, c.height)
  }, [source])
  return (
    <div className="flex w-16 flex-col items-center gap-1 rounded-lg border border-slate-200 p-1 dark:border-slate-700">
      <div className="checkerboard flex h-14 w-full items-center justify-center overflow-hidden rounded">
        <canvas ref={ref} className="max-h-14 max-w-full [image-rendering:pixelated]" />
      </div>
      <div className="text-[10px] text-slate-400">#{index + 1}</div>
    </div>
  )
}

export default function GifSplitTool() {
  const [gif, setGif] = useState<DecodedGif | null>(null)
  const [name, setName] = useState('animation')
  const [mode, setMode] = useState<Mode>('sheet')
  const [cols, setCols] = useState(4)
  const [padding, setPadding] = useState(0)
  const [margin, setMargin] = useState(0)
  const [transparent, setTransparent] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  async function onImage(loaded: LoadedImage, file: File) {
    // We only need the raw bytes; the dropzone's first-frame decode is unused.
    URL.revokeObjectURL(loaded.url)
    if (file.type !== 'image/gif' && !file.name.toLowerCase().endsWith('.gif')) {
      setError('GIF 파일을 넣어주세요.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const decoded = await decodeGif(file)
      setGif(decoded)
      setName(baseName(file.name))
      setCols(suggestCols(decoded.frames.length))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const layout = useMemo(() => {
    const sizes = gif ? gif.frames.map(() => ({ w: gif.width, h: gif.height })) : []
    return computeLayout(sizes, Math.max(1, cols), padding, margin, 'top-left')
  }, [gif, cols, padding, margin])

  // Sheet preview (scaled to fit).
  useEffect(() => {
    if (mode !== 'sheet' || !gif || !canvasRef.current || layout.sheetW < 1) return
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
      ctx.drawImage(gif.frames[p.index].canvas, p.drawX * scale, p.drawY * scale, p.w * scale, p.h * scale)
    }
  }, [mode, gif, layout, transparent, bg])

  async function downloadSheet() {
    if (!gif) return
    if (layout.sheetW > MAX_SIDE || layout.sheetH > MAX_SIDE) {
      setError(`시트가 너무 큽니다 (최대 ${MAX_SIDE}px). 열 수나 여백을 조정하세요.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const canvas = createCanvas(layout.sheetW, layout.sheetH)
      const ctx = getContext(canvas, false)
      if (!transparent) {
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, layout.sheetW, layout.sheetH)
      }
      for (const p of layout.placements) {
        ctx.drawImage(gif.frames[p.index].canvas, p.drawX, p.drawY)
      }
      const blob = await canvasToBlob(canvas, 'image/png')
      downloadBlob(blob, `${name}_sheet.png`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadFrames() {
    if (!gif) return
    setBusy(true)
    setError(null)
    try {
      const total = gif.frames.length
      const entries: ZipEntry[] = []
      for (let i = 0; i < total; i++) {
        const blob = await canvasToBlob(gif.frames[i].canvas, 'image/png')
        entries.push({ name: `${name}_${padFrameIndex(i + 1, total)}.png`, blob })
      }
      await downloadZip(entries, `${name}_frames.zip`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell tool={tool}>
      {!gif ? (
        <>
          <ImageDropzone onImage={onImage} onError={setError} />
          {busy && <p className="mt-3 text-sm text-slate-500">GIF 프레임을 읽는 중…</p>}
        </>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <div className="text-sm text-slate-500">
              {gif.width} × {gif.height} · 프레임 {gif.frames.length}개
            </div>

            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMode('sheet')}
                className={`rounded-md px-3 py-1 ${mode === 'sheet' ? 'bg-indigo-600 text-white' : ''}`}
              >
                스프라이트 시트
              </button>
              <button
                type="button"
                onClick={() => setMode('frames')}
                className={`rounded-md px-3 py-1 ${mode === 'frames' ? 'bg-indigo-600 text-white' : ''}`}
              >
                개별 이미지
              </button>
            </div>

            {mode === 'sheet' ? (
              <>
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
                  시트: {layout.sheetW} × {layout.sheetH} · {layout.cols} × {layout.rows}
                </div>

                <DownloadButton onClick={downloadSheet} disabled={busy}>
                  {busy ? '생성 중…' : 'PNG 다운로드'}
                </DownloadButton>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  각 프레임을 투명 PNG로 저장해 ZIP으로 묶습니다.
                </p>
                <DownloadButton onClick={downloadFrames} disabled={busy}>
                  {busy ? '생성 중…' : 'ZIP 다운로드'}
                </DownloadButton>
              </>
            )}

            <button
              type="button"
              onClick={() => setGif(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              GIF 변경
            </button>
          </div>

          <div className="min-w-0 flex-1">
            {mode === 'sheet' ? (
              <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                <canvas ref={canvasRef} className="block [image-rendering:pixelated]" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {gif.frames.slice(0, MAX_THUMBS).map((f, i) => (
                  <FrameThumb key={i} source={f.canvas} index={i} />
                ))}
                {gif.frames.length > MAX_THUMBS && (
                  <div className="flex items-center px-2 text-sm text-slate-400">
                    외 {gif.frames.length - MAX_THUMBS}개
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
