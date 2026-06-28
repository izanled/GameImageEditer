import { useEffect, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import { ANCHORS, anchorOffset, type Anchor } from '../../lib/image/canvasResize'

const tool = getTool('canvas-resize')!

export default function CanvasResizeTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [cw, setCw] = useState(0)
  const [ch, setCh] = useState(0)
  const [anchor, setAnchor] = useState<Anchor>('center')
  const [transparent, setTransparent] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function onImage(img: LoadedImage, file: File) {
    setImage(img)
    setName(file.name)
    setCw(img.width)
    setCh(img.height)
    setError(null)
  }

  useEffect(() => {
    if (!image || !canvasRef.current || cw < 1 || ch < 1) return
    const canvas = canvasRef.current
    canvas.width = cw
    canvas.height = ch
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, cw, ch)
    if (!transparent) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, cw, ch)
    }
    const [ox, oy] = anchorOffset(anchor, cw, ch, image.width, image.height)
    ctx.drawImage(image.el, ox, oy)
  }, [image, cw, ch, anchor, transparent, bg])

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
                캔버스 너비
                <input
                  type="number"
                  min={1}
                  value={cw}
                  onChange={(e) => setCw(Math.max(1, Number(e.target.value) | 0))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                />
              </label>
              <label className="text-sm">
                캔버스 높이
                <input
                  type="number"
                  min={1}
                  value={ch}
                  onChange={(e) => setCh(Math.max(1, Number(e.target.value) | 0))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"
                />
              </label>
            </div>

            <div>
              <div className="mb-1 text-sm text-slate-500">앵커 (정렬 기준)</div>
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

            <div className="flex flex-wrap gap-2 pt-2">
              <DownloadButton onClick={download}>PNG 다운로드</DownloadButton>
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
            <div className="text-sm text-slate-500">
              캔버스: {cw} × {ch}
            </div>
            <div className="checkerboard mt-2 inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
              <canvas
                ref={canvasRef}
                className="[image-rendering:pixelated]"
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
