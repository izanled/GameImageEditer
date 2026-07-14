import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import MultiImageDropzone, { type NamedImage } from '../../components/MultiImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import ZoomablePreview, { DEFAULT_VIEW, type ViewState } from '../../components/ZoomablePreview'
import MultiImageChangeButton from '../../components/MultiImageChangeButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import { hexToRgb, rgbToHex, type RGB } from '../../lib/image/color'
import {
  applyReplaceColor,
  buildReplaceMask,
  deltasForTarget,
  previewColor,
} from '../../lib/image/replaceColor'
import { downloadZip, type ZipEntry } from '../../lib/zip'
import PreviewControls from '../../components/PreviewControls'
import { useUndoRedo } from '../../hooks/useUndoRedo'

const tool = getTool('replace-color')!

function readImageData(img: LoadedImage): ImageData {
  const canvas = createCanvas(img.width, img.height)
  const ctx = getContext(canvas, false)
  ctx.drawImage(img.el, 0, 0)
  return ctx.getImageData(0, 0, img.width, img.height)
}

export default function ReplaceColorTool() {
  const [images, setImages] = useState<NamedImage[]>([])
  const [selected, setSelected] = useState(0)
  const [samples, setSamples] = useState<RGB[]>([])
  const [fuzziness, setFuzziness] = useState(40)
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(0)
  const [lightness, setLightness] = useState(0)
  const [showMask, setShowMask] = useState(true)
  const [swapped, setSwapped] = useState(false)
  const [hover, setHover] = useState<{ color: RGB; x: number; y: number } | null>(null)
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const srcCache = useRef(new Map<string, ImageData>())
  const resultRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const originalImgRef = useRef<HTMLImageElement>(null)

  const current = images[selected] ?? null

  const history = useUndoRedo(
    { samples, fuzziness, hue, saturation, lightness },
    (v) => {
      setSamples(v.samples)
      setFuzziness(v.fuzziness)
      setHue(v.hue)
      setSaturation(v.saturation)
      setLightness(v.lightness)
    },
  )

  function getSrcData(img: LoadedImage): ImageData {
    let data = srcCache.current.get(img.url)
    if (!data) {
      data = readImageData(img)
      srcCache.current.set(img.url, data)
    }
    return data
  }

  function onImages(next: NamedImage[]) {
    setError(null)
    setImages((prev) => [...prev, ...next])
  }

  function replaceImages(next: NamedImage[]) {
    images.forEach((n) => URL.revokeObjectURL(n.img.url))
    srcCache.current.clear()
    setError(null)
    setImages(next)
    setSelected(0)
    history.clear()
  }

  function reset() {
    images.forEach((n) => URL.revokeObjectURL(n.img.url))
    srcCache.current.clear()
    setImages([])
    setSelected(0)
    setSamples([])
    setHue(0)
    setSaturation(0)
    setLightness(0)
    setError(null)
    history.clear()
  }

  // Eyedropper: left-click on the original picks the pixel color under the
  // cursor. Works at any zoom because the rect scales with the transform.
  /** Pixel color of the original under a mouse position, or null. */
  function colorAtPointer(clientX: number, clientY: number): RGB | null {
    const img = originalImgRef.current
    if (!img || !current) return null
    const rect = img.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const x = Math.floor(((clientX - rect.left) / rect.width) * current.img.width)
    const y = Math.floor(((clientY - rect.top) / rect.height) * current.img.height)
    if (x < 0 || y < 0 || x >= current.img.width || y >= current.img.height) return null
    const src = getSrcData(current.img)
    const i = (y * src.width + x) * 4
    if (src.data[i + 3] === 0) return null
    return { r: src.data[i], g: src.data[i + 1], b: src.data[i + 2] }
  }

  function addSample(c: RGB) {
    setSamples((prev) =>
      prev.some((s) => s.r === c.r && s.g === c.g && s.b === c.b) ? prev : [...prev, c],
    )
  }

  function sampleAt(e: ReactMouseEvent<HTMLDivElement>) {
    const c = colorAtPointer(e.clientX, e.clientY)
    if (c) addSample(c)
  }

  // Eyedropper-style hover preview: the color under the cursor follows the
  // mouse in a floating badge. Rendered outside ZoomablePreview because its
  // transform would break position:fixed.
  function onHoverMove(e: ReactMouseEvent<HTMLDivElement>) {
    const c = colorAtPointer(e.clientX, e.clientY)
    setHover(c ? { color: c, x: e.clientX, y: e.clientY } : null)
  }

  const eyeDropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window

  // Native EyeDropper (Chromium): magnified, pixel-precise picking anywhere on
  // screen. The preview renders pixelated, so picked colors are exact.
  async function pickWithEyeDropper() {
    interface EyeDropperResult {
      sRGBHex: string
    }
    const Ctor = (
      window as unknown as {
        EyeDropper?: new () => { open: () => Promise<EyeDropperResult> }
      }
    ).EyeDropper
    if (!Ctor) return
    try {
      const result = await new Ctor().open()
      addSample(hexToRgb(result.sRGBHex))
    } catch {
      // user cancelled the eyedropper
    }
  }

  function removeSample(i: number) {
    setSamples((p) => p.filter((_, idx) => idx !== i))
  }

  // Result-color picker: derive slider values that turn the first sample into
  // the chosen color.
  function onTargetColor(hex: string) {
    if (samples.length === 0) return
    const d = deltasForTarget(samples[0], hexToRgb(hex))
    setHue(d.hue)
    setSaturation(d.saturation)
    setLightness(d.lightness)
  }

  const resultSwatch =
    samples.length > 0 ? previewColor(samples[0], hue, saturation, lightness) : null

  // Debounced replace-color preview of the selected image.
  useEffect(() => {
    if (!current || !resultRef.current) return
    const src = getSrcData(current.img)
    const id = setTimeout(() => {
      const canvas = resultRef.current
      if (!canvas) return
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
      applyReplaceColor(out.data, { samples, fuzziness, hue, saturation, lightness })
      canvas.width = src.width
      canvas.height = src.height
      getContext(canvas, false).putImageData(out, 0, 0)
    }, 150)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, selected, samples, fuzziness, hue, saturation, lightness])

  // Selection overlay on the original: unselected pixels are dimmed in
  // proportion to how far outside the selection they fall.
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas || !current) return
    const src = getSrcData(current.img)
    if (canvas.width !== src.width || canvas.height !== src.height) {
      canvas.width = src.width
      canvas.height = src.height
    }
    const ctx = getContext(canvas, false)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!showMask || samples.length === 0) return
    const mask = buildReplaceMask(src.data, samples, fuzziness)
    const overlay = ctx.createImageData(src.width, src.height)
    for (let p = 0; p < mask.length; p++) {
      const i = p * 4
      if (src.data[i + 3] === 0) continue
      const dim = Math.round((1 - mask[p]) * 175)
      if (dim === 0) continue
      overlay.data[i] = 15
      overlay.data[i + 1] = 23
      overlay.data[i + 2] = 42
      overlay.data[i + 3] = dim
    }
    ctx.putImageData(overlay, 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, selected, samples, fuzziness, showMask])

  async function download() {
    if (images.length === 0 || samples.length === 0) return
    setBusy(true)
    try {
      const entries: ZipEntry[] = []
      for (const { img, name } of images) {
        const src = getSrcData(img)
        const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
        applyReplaceColor(out.data, { samples, fuzziness, hue, saturation, lightness })
        const canvas = createCanvas(src.width, src.height)
        getContext(canvas, false).putImageData(out, 0, 0)
        entries.push({ name: replaceExt(name, 'png'), blob: await canvasToBlob(canvas, 'image/png') })
        // Yield so a long batch doesn't freeze the UI.
        await new Promise((r) => setTimeout(r, 0))
      }
      if (entries.length === 1) downloadBlob(entries[0].blob, entries[0].name)
      else await downloadZip(entries, 'replace-color.zip')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const slider = 'w-full accent-indigo-600'

  return (
    <ToolShell tool={tool}>
      {images.length === 0 ? (
        <MultiImageDropzone onImages={onImages} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm text-slate-500">바꿀 색 ({samples.length})</span>
                {eyeDropperSupported && (
                  <button
                    type="button"
                    onClick={pickWithEyeDropper}
                    className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    title="화면 확대경으로 픽셀을 정밀하게 선택합니다"
                  >
                    💧 스포이드
                  </button>
                )}
              </div>
              {samples.length === 0 ? (
                <p className="text-xs text-slate-500">
                  원본 이미지를 클릭하면 그 위치의 색이 선택됩니다.
                  {eyeDropperSupported && ' 스포이드 버튼을 누르면 확대경으로 정밀하게 고를 수 있습니다.'}{' '}
                  여러 번 선택해 비슷한 색을 추가할 수 있습니다.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {samples.map((c, i) => (
                    <div key={i} className="group relative">
                      <span
                        className="block h-7 w-7 rounded border border-slate-300 dark:border-slate-700"
                        style={{ backgroundColor: rgbToHex(c) }}
                        title={rgbToHex(c)}
                      />
                      <button
                        type="button"
                        onClick={() => removeSample(i)}
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] leading-none text-white group-hover:flex"
                        aria-label="샘플 제거"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSamples([])}
                    className="rounded-md border border-slate-300 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    모두 지우기
                  </button>
                </div>
              )}
            </div>

            <label className="block text-sm">
              허용치: {fuzziness}
              <input
                type="range"
                min={0}
                max={200}
                value={fuzziness}
                onChange={(e) => setFuzziness(Number(e.target.value))}
                className={slider}
              />
              <span className="text-xs text-slate-500">
                샘플과 비슷한 색을 어디까지 포함할지 정합니다.
              </span>
            </label>

            <div>
              <div className="mb-1 text-sm text-slate-500">결과 색</div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={resultSwatch ? rgbToHex(resultSwatch) : '#000000'}
                  disabled={samples.length === 0}
                  onChange={(e) => onTargetColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                  title="결과 색 선택"
                />
                {samples.length > 0 && resultSwatch && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span
                      className="h-5 w-5 rounded border border-slate-300 dark:border-slate-700"
                      style={{ backgroundColor: rgbToHex(samples[0]) }}
                    />
                    →
                    <span
                      className="h-5 w-5 rounded border border-slate-300 dark:border-slate-700"
                      style={{ backgroundColor: rgbToHex(resultSwatch) }}
                    />
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                색을 고르면 아래 슬라이더가 자동으로 맞춰집니다.
              </p>
            </div>

            <label className="block text-sm">
              색조: {hue > 0 ? `+${hue}` : hue}°
              <input
                type="range"
                min={-180}
                max={180}
                value={hue}
                onChange={(e) => setHue(Number(e.target.value))}
                className={slider}
              />
            </label>
            <label className="block text-sm">
              채도: {saturation > 0 ? `+${saturation}` : saturation}
              <input
                type="range"
                min={-100}
                max={100}
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className={slider}
              />
            </label>
            <label className="block text-sm">
              명도: {lightness > 0 ? `+${lightness}` : lightness}
              <input
                type="range"
                min={-100}
                max={100}
                value={lightness}
                onChange={(e) => setLightness(Number(e.target.value))}
                className={slider}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showMask}
                onChange={(e) => setShowMask(e.target.checked)}
              />
              선택 영역 표시 (원본에서 선택 밖을 어둡게)
            </label>

            {images.length > 1 && (
              <p className="text-xs text-slate-500">
                같은 설정이 모든 이미지에 한 번에 적용됩니다.
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <DownloadButton onClick={download} disabled={busy || samples.length === 0}>
                {busy ? '변환 중…' : images.length > 1 ? 'ZIP 다운로드' : 'PNG 다운로드'}
              </DownloadButton>
              <MultiImageChangeButton onClick={reset} onImages={replaceImages} onError={setError}>
                이미지 변경
              </MultiImageChangeButton>
            </div>
            <div>
              <MultiImageDropzone onImages={onImages} onError={setError} compact />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4">
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((n, i) => (
                    <button
                      key={n.img.url}
                      type="button"
                      onClick={() => setSelected(i)}
                      className={`shrink-0 rounded border p-0.5 ${
                        i === selected
                          ? 'border-indigo-500 ring-1 ring-indigo-500'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                      title={n.name}
                    >
                      <img
                        src={n.img.url}
                        alt={n.name}
                        className="checkerboard h-14 w-14 object-contain [image-rendering:pixelated]"
                      />
                    </button>
                  ))}
                </div>
              )}
              {current && (
                <>
                  <PreviewControls onSwap={() => setSwapped((s) => !s)} history={history} />
                  <div className={swapped ? 'order-2' : 'order-1'}>
                    <div className="mb-1 text-sm text-slate-500">
                      결과{images.length > 1 ? ` · ${current.name}` : ''}
                    </div>
                    <ZoomablePreview resetKey={current.img.url} view={view} onViewChange={setView}>
                      <canvas ref={resultRef} className="block w-full [image-rendering:pixelated]" style={{ height: 'auto' }} />
                    </ZoomablePreview>
                  </div>
                  <div className={swapped ? 'order-1' : 'order-2'}>
                    <div className="mb-1 text-sm text-slate-500">
                      원본
                      <span className="ml-2 text-xs text-indigo-500">
                        클릭 = 스포이드 (바꿀 색 선택)
                      </span>
                    </div>
                    <ZoomablePreview resetKey={current.img.url} view={view} onViewChange={setView}>
                      <div
                        className="relative cursor-crosshair"
                        onClick={sampleAt}
                        onMouseMove={onHoverMove}
                        onMouseLeave={() => setHover(null)}
                      >
                        <img
                          ref={originalImgRef}
                          src={current.img.url}
                          alt="원본"
                          className="block w-full [image-rendering:pixelated]"
                          style={{ height: 'auto' }}
                        />
                        <canvas
                          ref={overlayRef}
                          className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]"
                        />
                      </div>
                    </ZoomablePreview>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow dark:border-slate-600 dark:bg-slate-800"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <span
            className="h-4 w-4 rounded-sm border border-slate-300 dark:border-slate-600"
            style={{ backgroundColor: rgbToHex(hover.color) }}
          />
          <span className="font-mono">{rgbToHex(hover.color)}</span>
        </div>
      )}
    </ToolShell>
  )
}
