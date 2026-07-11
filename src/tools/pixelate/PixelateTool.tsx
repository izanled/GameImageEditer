import { useEffect, useRef, useState } from 'react'
import DownloadButton from '../../components/DownloadButton'
import ImageChangeButton from '../../components/ImageChangeButton'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import ZoomablePreview from '../../components/ZoomablePreview'
import { getContext, createCanvas } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import type { LoadedImage } from '../../lib/image/load'
import { pixelateRgba } from '../../lib/image/pixelate'
import { getTool } from '../registry'

const tool = getTool('pixelate')!
const QUICK_STRENGTHS = [1, 4, 8, 16, 32]

export default function PixelateTool() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [name, setName] = useState('image.png')
  const [strength, setStrength] = useState(8)
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef<ImageData | null>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)

  function onImage(img: LoadedImage, file: File) {
    const canvas = createCanvas(img.width, img.height)
    const ctx = getContext(canvas, false)
    ctx.drawImage(img.el, 0, 0)
    sourceRef.current = ctx.getImageData(0, 0, img.width, img.height)
    setImage(img)
    setName(file.name)
    setStrength(8)
    setError(null)
  }

  useEffect(() => {
    const source = sourceRef.current
    const canvas = resultRef.current
    if (!image || !source || !canvas) return

    canvas.width = source.width
    canvas.height = source.height
    const pixels = pixelateRgba(source.data, source.width, source.height, strength)
    const output = new ImageData(source.width, source.height)
    output.data.set(pixels)
    getContext(canvas, false).putImageData(output, 0, 0)
  }, [image, strength])

  async function download() {
    if (!resultRef.current) return
    const blob = await canvasToBlob(resultRef.current, 'image/png')
    downloadBlob(blob, replaceExt(name, 'png'))
  }

  return (
    <ToolShell tool={tool}>
      {!image ? (
        <ImageDropzone onImage={onImage} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <p className="rounded-md bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              픽셀 블록 크기를 키울수록 효과가 강해집니다. 투명도(알파)도 색상과 함께 픽셀화해 PNG로 보존합니다.
            </p>

            <label className="block text-sm">
              픽셀화 강도: {strength}px
              <input
                type="range"
                min={1}
                max={64}
                value={strength}
                onChange={(event) => setStrength(Number(event.target.value))}
                className="mt-1 w-full accent-indigo-600"
              />
            </label>

            <div>
              <div className="mb-1 text-sm text-slate-500">빠른 설정</div>
              <div className="flex flex-wrap gap-2">
                {QUICK_STRENGTHS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStrength(value)}
                    className={`rounded-md border px-3 py-1 text-sm transition ${
                      strength === value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    {value === 1 ? '원본' : `${value}px`}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-sm text-slate-500">
              원본: {image.width} × {image.height}
              <br />
              블록 격자: 약 {Math.ceil(image.width / strength)} × {Math.ceil(image.height / strength)}
            </div>

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
                <ZoomablePreview resetKey={`${image.url}-${strength}`}>
                  <canvas
                    ref={resultRef}
                    className="block w-full [image-rendering:pixelated]"
                    style={{ height: 'auto' }}
                  />
                </ZoomablePreview>
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">원본</div>
                <div className="checkerboard block w-full overflow-hidden rounded border border-slate-200 dark:border-slate-700">
                  <img src={image.url} alt="원본" className="block w-full" style={{ height: 'auto' }} />
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
