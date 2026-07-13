import { useEffect, useRef, useState } from 'react'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import ZoomablePreview from '../../components/ZoomablePreview'
import ImageChangeButton from '../../components/ImageChangeButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import { detectKeyColor, hexToRgb, keyOut, rgbToHex } from '../../lib/image/chromaKey'

const tool = getTool('chroma-key')!

export default function ChromaKeyTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [keyHex, setKeyHex] = useState('#00ffff')
  const [tolerance, setTolerance] = useState(90)
  const [softness, setSoftness] = useState(40)
  const [choke, setChoke] = useState(1)
  const [despill, setDespill] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const srcData = useRef<ImageData | null>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)

  function onImage(img: LoadedImage, file: File) {
    const canvas = createCanvas(img.width, img.height)
    const ctx = getContext(canvas, false)
    ctx.drawImage(img.el, 0, 0)
    const data = ctx.getImageData(0, 0, img.width, img.height)
    srcData.current = data
    setKeyHex(rgbToHex(detectKeyColor(data.data, img.width, img.height)))
    setName(file.name)
    setError(null)
    setImage(img)
  }

  // live recompute whenever the key or parameters change
  useEffect(() => {
    const src = srcData.current
    if (!image || !src || !resultRef.current) return
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
    keyOut(out.data, src.width, src.height, hexToRgb(keyHex), tolerance, softness, choke, despill)
    const canvas = resultRef.current
    canvas.width = src.width
    canvas.height = src.height
    const ctx = getContext(canvas, false)
    ctx.putImageData(out, 0, 0)
  }, [image, keyHex, tolerance, softness, choke, despill])

  async function download() {
    if (!resultRef.current) return
    const blob = await canvasToBlob(resultRef.current, 'image/png')
    downloadBlob(blob, replaceExt(name, 'png'))
  }

  function pickFromCorners() {
    if (srcData.current) {
      setKeyHex(rgbToHex(detectKeyColor(srcData.current.data, srcData.current.width, srcData.current.height)))
    }
  }

  const range = 'w-full accent-indigo-600'

  return (
    <ToolShell tool={tool}>
      {!image ? (
        <ImageDropzone onImage={onImage} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
              단색(크로마키) 배경에 적합합니다. 가장자리 색 번짐은 디프린지와 테두리
              다듬기로 제거됩니다.
            </p>

            <div>
              <div className="mb-1 text-sm text-slate-500">키 색상</div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={keyHex}
                  onChange={(e) => setKeyHex(e.target.value)}
                  className="h-8 w-12 rounded border border-slate-300 dark:border-slate-700"
                />
                <span className="text-sm">{keyHex}</span>
                <button
                  type="button"
                  onClick={pickFromCorners}
                  className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  코너에서 감지
                </button>
              </div>
            </div>

            <label className="block text-sm">
              허용 오차: {tolerance}
              <input type="range" min={0} max={255} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className={range} />
            </label>
            <label className="block text-sm">
              부드러움(가장자리): {softness}
              <input type="range" min={1} max={150} value={softness} onChange={(e) => setSoftness(Number(e.target.value))} className={range} />
            </label>
            <label className="block text-sm">
              테두리 다듬기: {choke}px
              <input type="range" min={0} max={4} value={choke} onChange={(e) => setChoke(Number(e.target.value))} className={range} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={despill} onChange={(e) => setDespill(e.target.checked)} />
              색 번짐 제거 (디프린지)
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <DownloadButton onClick={download}>PNG 다운로드</DownloadButton>
              <ImageChangeButton onClick={() => setImage(null)} onImage={onImage} onError={setError}>
                이미지 변경
              </ImageChangeButton>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-sm text-slate-500">결과 (투명 배경)</div>
                <ZoomablePreview resetKey={image.url}>
                  <canvas ref={resultRef} className="block w-full [image-rendering:pixelated]" style={{ height: 'auto' }} />
                </ZoomablePreview>
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">원본</div>
                <div className="checkerboard block w-full overflow-hidden rounded border border-slate-200 dark:border-slate-700">
                  <img src={image.url} alt="원본" className="block w-full [image-rendering:pixelated]" style={{ height: 'auto' }} />
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
