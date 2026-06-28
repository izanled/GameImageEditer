import { useEffect, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import {
  applyAdjustments,
  DEFAULT_ADJUSTMENTS,
  type AdjustOptions,
} from '../../lib/image/colorAdjust'

const tool = getTool('color-adjust')!

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-600"
      />
    </label>
  )
}

export default function ColorAdjustTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [opts, setOpts] = useState<AdjustOptions>(DEFAULT_ADJUSTMENTS)
  const [error, setError] = useState<string | null>(null)

  const srcData = useRef<ImageData | null>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)

  function onImage(img: LoadedImage, file: File) {
    const canvas = createCanvas(img.width, img.height)
    const ctx = getContext(canvas, false)
    ctx.drawImage(img.el, 0, 0)
    srcData.current = ctx.getImageData(0, 0, img.width, img.height)
    setName(file.name)
    setOpts(DEFAULT_ADJUSTMENTS)
    setError(null)
    setImage(img)
  }

  // Recompute the result whenever any adjustment changes.
  useEffect(() => {
    const src = srcData.current
    if (!image || !src || !resultRef.current) return
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
    applyAdjustments(out.data, opts)
    const canvas = resultRef.current
    canvas.width = src.width
    canvas.height = src.height
    getContext(canvas, false).putImageData(out, 0, 0)
  }, [image, opts])

  async function download() {
    if (!resultRef.current) return
    const blob = await canvasToBlob(resultRef.current, 'image/png')
    downloadBlob(blob, replaceExt(name, 'png'))
  }

  const set = <K extends keyof AdjustOptions>(k: K, v: AdjustOptions[K]) =>
    setOpts((o) => ({ ...o, [k]: v }))

  const toggleBtn =
    'rounded-md border px-3 py-1.5 text-sm border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
  const toggleOn =
    'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'

  return (
    <ToolShell tool={tool}>
      {!image ? (
        <ImageDropzone onImage={onImage} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-4 lg:w-72">
            <Slider label={`밝기: ${opts.brightness}`} min={-100} max={100} value={opts.brightness} onChange={(v) => set('brightness', v)} />
            <Slider label={`대비: ${opts.contrast}`} min={-100} max={100} value={opts.contrast} onChange={(v) => set('contrast', v)} />
            <Slider label={`채도: ${opts.saturation}`} min={-100} max={100} value={opts.saturation} onChange={(v) => set('saturation', v)} />
            <Slider label={`색조: ${opts.hue}°`} min={-180} max={180} value={opts.hue} onChange={(v) => set('hue', v)} />
            <Slider label={`색온도: ${opts.temperature}`} min={-100} max={100} value={opts.temperature} onChange={(v) => set('temperature', v)} />
            <Slider label={`감마: ${opts.gamma.toFixed(2)}`} min={0.2} max={3} step={0.05} value={opts.gamma} onChange={(v) => set('gamma', v)} />
            <Slider
              label={`포스터화: ${opts.posterize < 2 ? '끄기' : `${opts.posterize}단계`}`}
              min={0}
              max={32}
              value={opts.posterize}
              onChange={(v) => set('posterize', v)}
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => set('invert', !opts.invert)} className={`${toggleBtn} ${opts.invert ? toggleOn : ''}`}>
                반전
              </button>
              <button type="button" onClick={() => set('grayscale', !opts.grayscale)} className={`${toggleBtn} ${opts.grayscale ? toggleOn : ''}`}>
                흑백
              </button>
              <button type="button" onClick={() => set('sepia', !opts.sepia)} className={`${toggleBtn} ${opts.sepia ? toggleOn : ''}`}>
                세피아
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <DownloadButton onClick={download}>PNG 다운로드</DownloadButton>
              <button
                type="button"
                onClick={() => setOpts(DEFAULT_ADJUSTMENTS)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                초기화
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

          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-sm text-slate-500">원본</div>
                <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                  <img src={image.url} alt="원본" className="block max-w-full [image-rendering:pixelated]" style={{ maxHeight: '60vh' }} />
                </div>
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">결과</div>
                <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                  <canvas ref={resultRef} className="block max-w-full [image-rendering:pixelated]" style={{ maxHeight: '60vh' }} />
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
