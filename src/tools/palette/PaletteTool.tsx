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
import { hexToRgb, rgbToHex, type RGB } from '../../lib/image/color'
import { extractPalette, remapToPalette, applyDither } from '../../lib/image/palette'

const tool = getTool('palette')!

type Source = 'self' | 'reference' | 'manual'

function readImageData(img: LoadedImage): ImageData {
  const canvas = createCanvas(img.width, img.height)
  const ctx = getContext(canvas, false)
  ctx.drawImage(img.el, 0, 0)
  return ctx.getImageData(0, 0, img.width, img.height)
}

export default function PaletteTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [refImage, setRefImage] = useState<LoadedImage | null>(null)
  const [source, setSource] = useState<Source>('self')
  const [count, setCount] = useState(16)
  const [palette, setPalette] = useState<RGB[]>([])
  const [dither, setDither] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const srcData = useRef<ImageData | null>(null)
  const refData = useRef<ImageData | null>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)

  function onImage(img: LoadedImage, file: File) {
    srcData.current = readImageData(img)
    setName(file.name)
    setError(null)
    setImage(img)
  }

  function onRefImage(img: LoadedImage) {
    refData.current = readImageData(img)
    setRefImage(img)
  }

  // Auto-extract the palette for self/reference sources. Manual keeps the
  // current swatches so the user can edit them freely.
  useEffect(() => {
    if (source === 'manual') return
    const src = source === 'self' ? srcData.current : refData.current
    if (!src) {
      setPalette([])
      return
    }
    setPalette(extractPalette(src.data, count))
  }, [source, count, image, refImage])

  // Debounced remap of the target into the active palette.
  useEffect(() => {
    const src = srcData.current
    if (!image || !src || !resultRef.current || palette.length === 0) return
    const id = setTimeout(() => {
      const canvas = resultRef.current
      if (!canvas) return
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
      if (dither) applyDither(out.data, src.width, src.height, palette)
      else remapToPalette(out.data, palette)
      canvas.width = src.width
      canvas.height = src.height
      getContext(canvas, false).putImageData(out, 0, 0)
    }, 150)
    return () => clearTimeout(id)
  }, [image, palette, dither])

  async function download() {
    if (!resultRef.current) return
    const blob = await canvasToBlob(resultRef.current, 'image/png')
    downloadBlob(blob, replaceExt(name, 'png'))
  }

  function reset() {
    setImage(null)
    setRefImage(null)
    srcData.current = null
    refData.current = null
    setPalette([])
    setSource('self')
  }

  function editSwatch(i: number, hex: string) {
    setPalette((p) => p.map((c, idx) => (idx === i ? hexToRgb(hex) : c)))
  }

  function addSwatch() {
    setPalette((p) => [...p, { r: 0, g: 0, b: 0 }])
  }

  function removeSwatch(i: number) {
    setPalette((p) => p.filter((_, idx) => idx !== i))
  }

  const srcBtn =
    'rounded-md border px-3 py-1.5 text-sm border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
  const srcOn =
    'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'

  return (
    <ToolShell tool={tool}>
      {!image ? (
        <ImageDropzone onImage={onImage} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <div>
              <div className="mb-1 text-sm text-slate-500">팔레트 소스</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSource('self')} className={`${srcBtn} ${source === 'self' ? srcOn : ''}`}>
                  현재 이미지
                </button>
                <button type="button" onClick={() => setSource('reference')} className={`${srcBtn} ${source === 'reference' ? srcOn : ''}`}>
                  레퍼런스
                </button>
                <button type="button" onClick={() => setSource('manual')} className={`${srcBtn} ${source === 'manual' ? srcOn : ''}`}>
                  직접 편집
                </button>
              </div>
            </div>

            {source !== 'manual' && (
              <label className="block text-sm">
                색상 수: {count}
                <input
                  type="range"
                  min={2}
                  max={32}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </label>
            )}

            {source === 'reference' && (
              <div>
                <div className="mb-1 text-sm text-slate-500">레퍼런스 이미지</div>
                {!refImage ? (
                  <ImageDropzone onImage={onRefImage} onError={setError} />
                ) : (
                  <div className="flex items-center gap-2">
                    <img src={refImage.url} alt="레퍼런스" className="h-12 w-12 rounded border border-slate-300 object-contain dark:border-slate-700 [image-rendering:pixelated]" />
                    <button
                      type="button"
                      onClick={() => {
                        setRefImage(null)
                        refData.current = null
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      레퍼런스 변경
                    </button>
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  레퍼런스에서 추출한 색으로 현재 이미지를 다시 칠합니다.
                </p>
              </div>
            )}

            {palette.length > 0 && (
              <div>
                <div className="mb-1 text-sm text-slate-500">
                  팔레트 ({palette.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {palette.map((c, i) =>
                    source === 'manual' ? (
                      <div key={i} className="group relative">
                        <input
                          type="color"
                          value={rgbToHex(c)}
                          onChange={(e) => editSwatch(i, e.target.value)}
                          className="h-7 w-7 cursor-pointer rounded border border-slate-300 dark:border-slate-700"
                          title={rgbToHex(c)}
                        />
                        <button
                          type="button"
                          onClick={() => removeSwatch(i)}
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] leading-none text-white group-hover:flex"
                          aria-label="색 제거"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <span
                        key={i}
                        className="h-7 w-7 rounded border border-slate-300 dark:border-slate-700"
                        style={{ backgroundColor: rgbToHex(c) }}
                        title={rgbToHex(c)}
                      />
                    ),
                  )}
                  {source === 'manual' && (
                    <button
                      type="button"
                      onClick={addSwatch}
                      className="h-7 w-7 rounded border border-dashed border-slate-400 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                      aria-label="색 추가"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} />
              디더링 (그라데이션 부드럽게)
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <DownloadButton onClick={download} disabled={palette.length === 0}>
                PNG 다운로드
              </DownloadButton>
              <ImageChangeButton onClick={reset} onImage={onImage} onError={setError}>
                이미지 변경
              </ImageChangeButton>
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
                <ZoomablePreview resetKey={image.url}>
                  <canvas ref={resultRef} className="block max-w-full [image-rendering:pixelated]" style={{ maxHeight: '60vh' }} />
                </ZoomablePreview>
              </div>
            </div>
            {source === 'reference' && !refImage && (
              <p className="mt-3 text-sm text-slate-500">
                레퍼런스 이미지를 올리면 그 색감으로 다시 칠해집니다.
              </p>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
