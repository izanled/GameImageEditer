import { useEffect, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import ImageChangeButton from '../../components/ImageChangeButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import { lockedDimension } from '../../lib/image/resize'

const tool = getTool('resize')!
const SCALES = [2, 3, 4, 8]
const PERCENTS = [90, 80, 70, 60, 50, 40, 30, 20, 10]

export default function ResizeTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [lock, setLock] = useState(true)
  const [smooth, setSmooth] = useState(false) // default: nearest-neighbor for pixel art
  const [percent, setPercent] = useState(50)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function onImage(img: LoadedImage, file: File) {
    setImage(img)
    setName(file.name)
    setWidth(img.width)
    setHeight(img.height)
    setError(null)
  }

  useEffect(() => {
    if (!image || !canvasRef.current || width < 1 || height < 1) return
    const canvas = canvasRef.current
    canvas.width = width
    canvas.height = height
    const ctx = getContext(canvas, smooth)
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(image.el, 0, 0, image.width, image.height, 0, 0, width, height)
  }, [image, width, height, smooth])

  function onWidth(v: number) {
    setWidth(v)
    if (lock && image) setHeight(lockedDimension(image.width, image.height, 'width', v))
  }
  function onHeight(v: number) {
    setHeight(v)
    if (lock && image) setWidth(lockedDimension(image.width, image.height, 'height', v))
  }
  function applyScale(mult: number) {
    if (!image) return
    setWidth(Math.max(1, Math.round(image.width * mult)))
    setHeight(Math.max(1, Math.round(image.height * mult)))
  }

  async function download() {
    if (!canvasRef.current) return
    const blob = await canvasToBlob(canvasRef.current, 'image/png')
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
              <label className="text-sm">
                너비 (px)
                <input
                  type="number"
                  min={1}
                  value={width}
                  onChange={(e) => onWidth(Math.max(1, Number(e.target.value) | 0))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                />
              </label>
              <label className="text-sm">
                높이 (px)
                <input
                  type="number"
                  min={1}
                  value={height}
                  onChange={(e) => onHeight(Math.max(1, Number(e.target.value) | 0))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
              비율 고정
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
              부드럽게 (끄면 픽셀아트용 Nearest)
            </label>

            <div>
              <div className="mb-1 text-sm text-slate-500">정수 배율 (원본 기준)</div>
              <div className="flex flex-wrap gap-2">
                {SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => applyScale(s)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {s}×
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => applyScale(1)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  원본
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm text-slate-500">축소 배율 (원본 기준 %)</div>
              <div className="flex flex-wrap gap-2">
                {PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyScale(p / 100)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={percent}
                  onChange={(e) => setPercent(Math.max(1, Number(e.target.value) | 0))}
                  onKeyDown={(e) => e.key === 'Enter' && applyScale(percent / 100)}
                  className="w-20 rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                />
                <span className="text-sm text-slate-500">%</span>
                <button
                  type="button"
                  onClick={() => applyScale(percent / 100)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  적용
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <DownloadButton onClick={download}>PNG 다운로드</DownloadButton>
              <ImageChangeButton onClick={() => setImage(null)} onImage={onImage} onError={setError}>
                이미지 변경
              </ImageChangeButton>
            </div>
          </div>

          <div className="flex-1">
            <div className="text-sm text-slate-500">
              결과: {width} × {height}
            </div>
            <div className="checkerboard mt-2 inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
              <canvas
                ref={canvasRef}
                className={smooth ? '' : '[image-rendering:pixelated]'}
                style={{ maxWidth: '100%', maxHeight: '70vh' }}
              />
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
