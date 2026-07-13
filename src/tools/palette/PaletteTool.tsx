import { useEffect, useRef, useState } from 'react'
import MultiImageDropzone, { type NamedImage } from '../../components/MultiImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import ZoomablePreview, { DEFAULT_VIEW, type ViewState } from '../../components/ZoomablePreview'
import MultiImageChangeButton from '../../components/MultiImageChangeButton'
import ImageDropzone from '../../components/ImageDropzone'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob, replaceExt } from '../../lib/image/export'
import { hexToRgb, rgbToHex, type RGB } from '../../lib/image/color'
import {
  extractPalette,
  remapToPalette,
  applyDither,
  sortByLuminance,
  buildIndexMap,
} from '../../lib/image/palette'
import { downloadZip, type ZipEntry } from '../../lib/zip'
import { usePaletteStore, type SavedPalette } from '../../store/paletteStore'

const tool = getTool('palette')!

type Source = 'self' | 'reference' | 'manual'
type RefMode = 'nearest' | 'ordered'

function readImageData(img: LoadedImage): ImageData {
  const canvas = createCanvas(img.width, img.height)
  const ctx = getContext(canvas, false)
  ctx.drawImage(img.el, 0, 0)
  return ctx.getImageData(0, 0, img.width, img.height)
}

export default function PaletteTool() {
  const [images, setImages] = useState<NamedImage[]>([])
  const [selected, setSelected] = useState(0)
  const [refImage, setRefImage] = useState<LoadedImage | null>(null)
  const [source, setSource] = useState<Source>('self')
  const [refMode, setRefMode] = useState<RefMode>('nearest')
  const [count, setCount] = useState(16)
  const [selfPalette, setSelfPalette] = useState<RGB[]>([])
  const [refNearest, setRefNearest] = useState<RGB[]>([])
  const [refPalette, setRefPalette] = useState<RGB[]>([])
  const [manualPalette, setManualPalette] = useState<RGB[]>([])
  const [selectedSwatch, setSelectedSwatch] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const [dither, setDither] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const savedPalettes = usePaletteStore((s) => s.palettes)
  const savePalette = usePaletteStore((s) => s.savePalette)
  const removePalette = usePaletteStore((s) => s.removePalette)

  const srcCache = useRef(new Map<string, ImageData>())
  const indexMapCache = useRef(new Map<string, Int32Array>())
  const refData = useRef<ImageData | null>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const current = images[selected] ?? null

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
    indexMapCache.current.clear()
    setError(null)
    setImages(next)
    setSelected(0)
  }

  function onRefImage(img: LoadedImage) {
    refData.current = readImageData(img)
    setRefImage(img)
  }

  function reset() {
    images.forEach((n) => URL.revokeObjectURL(n.img.url))
    srcCache.current.clear()
    indexMapCache.current.clear()
    setImages([])
    setSelected(0)
    setRefImage(null)
    refData.current = null
    setManualPalette([])
    setSelectedSwatch(null)
    setSource('self')
    setError(null)
  }

  // Palette of the selected image (luminance-sorted): drives the self source,
  // the ordered mapping, and the usage highlight.
  useEffect(() => {
    if (!current) {
      setSelfPalette([])
      return
    }
    const src = getSrcData(current.img)
    setSelfPalette(sortByLuminance(extractPalette(src.data, count)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, selected, count])

  // Reference palettes. `refPalette` (ordered mode) is only re-seeded when the
  // reference image or the color count changes, so drag reordering survives
  // tab/source switches.
  useEffect(() => {
    if (!refImage || !refData.current) {
      setRefNearest([])
      setRefPalette([])
      return
    }
    const pal = sortByLuminance(extractPalette(refData.current.data, count))
    setRefNearest(pal)
    setRefPalette(pal.map((c) => ({ ...c })))
  }, [refImage, count])

  // Selecting a different image or changing the palette invalidates the highlight.
  useEffect(() => {
    setSelectedSwatch(null)
  }, [images, selected, count, source])

  /** The palette(s) the remap should use for the current source/mode. */
  function activeMapping(): { from: RGB[]; to?: RGB[] } | null {
    if (source === 'self') return selfPalette.length > 0 ? { from: selfPalette } : null
    if (source === 'manual') return manualPalette.length > 0 ? { from: manualPalette } : null
    if (refMode === 'nearest') return refNearest.length > 0 ? { from: refNearest } : null
    return selfPalette.length > 0 && refPalette.length > 0
      ? { from: selfPalette, to: refPalette }
      : null
  }

  // Debounced remap of the selected image into the active palette.
  useEffect(() => {
    if (!current || !resultRef.current) return
    const mapping = activeMapping()
    if (!mapping) return
    const src = getSrcData(current.img)
    const id = setTimeout(() => {
      const canvas = resultRef.current
      if (!canvas) return
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
      if (dither) applyDither(out.data, src.width, src.height, mapping.from, mapping.to)
      else remapToPalette(out.data, mapping.from, mapping.to)
      canvas.width = src.width
      canvas.height = src.height
      getContext(canvas, false).putImageData(out, 0, 0)
    }, 150)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, selected, source, refMode, selfPalette, refNearest, refPalette, manualPalette, dither])

  // Usage highlight: spotlight pixels of the selected self-palette color by
  // dimming every other opaque pixel on an overlay above the original.
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
    if (selectedSwatch == null || selectedSwatch >= selfPalette.length) return
    const key = `${current.img.url}#${count}`
    let map = indexMapCache.current.get(key)
    if (!map) {
      map = buildIndexMap(src.data, selfPalette)
      if (indexMapCache.current.size > 8) indexMapCache.current.clear()
      indexMapCache.current.set(key, map)
    }
    const overlay = ctx.createImageData(src.width, src.height)
    for (let p = 0; p < map.length; p++) {
      if (map[p] === -1 || map[p] === selectedSwatch) continue
      const i = p * 4
      overlay.data[i] = 15
      overlay.data[i + 1] = 23
      overlay.data[i + 2] = 42
      overlay.data[i + 3] = 175
    }
    ctx.putImageData(overlay, 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, selected, selectedSwatch, selfPalette, count])

  async function download() {
    const mapping = activeMapping()
    if (!mapping || images.length === 0) return
    setBusy(true)
    try {
      const entries: ZipEntry[] = []
      for (const { img, name } of images) {
        const src = getSrcData(img)
        const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
        if (dither) applyDither(out.data, src.width, src.height, mapping.from, mapping.to)
        else remapToPalette(out.data, mapping.from, mapping.to)
        const canvas = createCanvas(src.width, src.height)
        getContext(canvas, false).putImageData(out, 0, 0)
        entries.push({ name: replaceExt(name, 'png'), blob: await canvasToBlob(canvas, 'image/png') })
        // Yield so a long batch doesn't freeze the UI.
        await new Promise((r) => setTimeout(r, 0))
      }
      if (entries.length === 1) downloadBlob(entries[0].blob, entries[0].name)
      else await downloadZip(entries, 'palette.zip')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function switchSource(next: Source) {
    if (next === 'manual' && manualPalette.length === 0) {
      const seed =
        source === 'reference'
          ? refMode === 'nearest'
            ? refNearest
            : refPalette
          : selfPalette
      const colors = seed.length > 0 ? seed : selfPalette
      if (colors.length > 0) setManualPalette(colors.map((c) => ({ ...c })))
    }
    setSource(next)
  }

  function toggleSwatch(i: number) {
    setSelectedSwatch((s) => (s === i ? null : i))
  }

  function moveRefColor(from: number | null, to: number) {
    if (from == null || from === to) return
    setRefPalette((p) => {
      if (from >= p.length || to >= p.length) return p
      const next = [...p]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function editSwatch(i: number, hex: string) {
    setManualPalette((p) => p.map((c, idx) => (idx === i ? hexToRgb(hex) : c)))
  }

  function addSwatch() {
    setManualPalette((p) => [...p, { r: 0, g: 0, b: 0 }])
  }

  function removeSwatch(i: number) {
    setManualPalette((p) => p.filter((_, idx) => idx !== i))
  }

  function saveCurrentPalette() {
    if (manualPalette.length === 0) return
    const name = saveName.trim() || `팔레트 ${savedPalettes.length + 1}`
    savePalette(name, manualPalette)
    setSaveName('')
  }

  function loadSavedPalette(p: SavedPalette) {
    setManualPalette(p.colors.map((c) => ({ ...c })))
  }

  const displayPalette =
    source === 'self'
      ? selfPalette
      : source === 'manual'
        ? manualPalette
        : refMode === 'nearest'
          ? refNearest
          : refPalette

  const srcBtn =
    'rounded-md border px-3 py-1.5 text-sm border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
  const srcOn =
    'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
  const modeBtn =
    'rounded-md border px-2.5 py-1 text-xs border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'

  const swatchClass = (active: boolean) =>
    `h-7 w-7 rounded border ${
      active
        ? 'border-indigo-500 ring-2 ring-indigo-500'
        : 'border-slate-300 dark:border-slate-700'
    }`

  return (
    <ToolShell tool={tool}>
      {images.length === 0 ? (
        <MultiImageDropzone onImages={onImages} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <div>
              <div className="mb-1 text-sm text-slate-500">팔레트 소스</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => switchSource('self')} className={`${srcBtn} ${source === 'self' ? srcOn : ''}`}>
                  현재 이미지
                </button>
                <button type="button" onClick={() => switchSource('reference')} className={`${srcBtn} ${source === 'reference' ? srcOn : ''}`}>
                  레퍼런스
                </button>
                <button type="button" onClick={() => switchSource('manual')} className={`${srcBtn} ${source === 'manual' ? srcOn : ''}`}>
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
                  <div className="space-y-2">
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
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setRefMode('nearest')} className={`${modeBtn} ${refMode === 'nearest' ? srcOn : ''}`}>
                        자동 매칭
                      </button>
                      <button type="button" onClick={() => setRefMode('ordered')} className={`${modeBtn} ${refMode === 'ordered' ? srcOn : ''}`}>
                        순서 매칭
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      {refMode === 'nearest'
                        ? '각 픽셀을 레퍼런스에서 가장 가까운 색으로 바꿉니다.'
                        : '밝기 순으로 짝지은 뒤, 아래 줄을 드래그해서 매핑을 바꿉니다.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {(source === 'manual' || displayPalette.length > 0) && (
              <div>
                <div className="mb-1 text-sm text-slate-500">
                  팔레트 ({displayPalette.length})
                </div>

                {source === 'self' && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {selfPalette.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleSwatch(i)}
                          className={swatchClass(selectedSwatch === i)}
                          style={{ backgroundColor: rgbToHex(c) }}
                          title={rgbToHex(c)}
                          aria-pressed={selectedSwatch === i}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      색을 클릭하면 원본에서 사용 위치를 표시합니다.
                    </p>
                    {images.length > 1 && (
                      <p className="mt-1 text-xs text-slate-500">
                        선택한 이미지에서 추출한 팔레트를 모든 이미지에 적용합니다.
                      </p>
                    )}
                  </>
                )}

                {source === 'reference' && refMode === 'nearest' && (
                  <div className="flex flex-wrap gap-1.5">
                    {refNearest.map((c, i) => (
                      <span
                        key={i}
                        className="h-7 w-7 rounded border border-slate-300 dark:border-slate-700"
                        style={{ backgroundColor: rgbToHex(c) }}
                        title={rgbToHex(c)}
                      />
                    ))}
                  </div>
                )}

                {source === 'reference' && refMode === 'ordered' && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(
                        { length: Math.max(selfPalette.length, refPalette.length) },
                        (_, i) => (
                          <div
                            key={i}
                            className="flex flex-col items-center gap-0.5"
                            onDragOver={(e) => {
                              if (dragIdx != null) e.preventDefault()
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              moveRefColor(dragIdx, i)
                              setDragIdx(null)
                            }}
                          >
                            {selfPalette[i] ? (
                              <button
                                type="button"
                                onClick={() => toggleSwatch(i)}
                                className={swatchClass(selectedSwatch === i)}
                                style={{ backgroundColor: rgbToHex(selfPalette[i]) }}
                                title={rgbToHex(selfPalette[i])}
                                aria-pressed={selectedSwatch === i}
                              />
                            ) : (
                              <span className="h-7 w-7" />
                            )}
                            <span className="text-[10px] leading-none text-slate-400">↓</span>
                            {refPalette[i] ? (
                              <span
                                draggable
                                onDragStart={() => setDragIdx(i)}
                                onDragEnd={() => setDragIdx(null)}
                                className={`h-7 w-7 cursor-move rounded border border-slate-300 dark:border-slate-700 ${
                                  dragIdx === i ? 'opacity-40' : ''
                                }`}
                                style={{ backgroundColor: rgbToHex(refPalette[i]) }}
                                title={rgbToHex(refPalette[i])}
                              />
                            ) : (
                              <span className="h-7 w-7 rounded border border-dashed border-slate-300 dark:border-slate-700" />
                            )}
                          </div>
                        ),
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      위: 현재 이미지 색 (클릭하면 위치 표시) · 아래: 바꿀 색 (드래그로 순서 변경)
                    </p>
                  </>
                )}

                {source === 'manual' && (
                  <div className="flex flex-wrap gap-1.5">
                    {manualPalette.map((c, i) => (
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
                    ))}
                    <button
                      type="button"
                      onClick={addSwatch}
                      className="h-7 w-7 rounded border border-dashed border-slate-400 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                      aria-label="색 추가"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            )}

            {source === 'manual' && (
              <div>
                <div className="mb-1 text-sm text-slate-500">저장된 팔레트</div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="팔레트 이름"
                    className="w-0 min-w-0 flex-1 rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={saveCurrentPalette}
                    disabled={manualPalette.length === 0}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    저장
                  </button>
                </div>
                {savedPalettes.length === 0 ? (
                  <p className="mt-1.5 text-xs text-slate-500">저장된 팔레트가 없습니다.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {savedPalettes.map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => loadSavedPalette(p)}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-left hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                          title="클릭해서 불러오기"
                        >
                          <span className="truncate text-xs">{p.name}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-0.5">
                            {p.colors.slice(0, 8).map((c, i) => (
                              <span
                                key={i}
                                className="h-3 w-3 rounded-sm"
                                style={{ backgroundColor: rgbToHex(c) }}
                              />
                            ))}
                            {p.colors.length > 8 && (
                              <span className="text-[10px] text-slate-400">
                                +{p.colors.length - 8}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removePalette(p.id)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                          aria-label="팔레트 삭제"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} />
              디더링 (그라데이션 부드럽게)
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <DownloadButton onClick={download} disabled={busy || activeMapping() == null}>
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
            <div className="space-y-4">
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
                  <div>
                    <div className="mb-1 text-sm text-slate-500">
                      결과{images.length > 1 ? ` · ${current.name}` : ''}
                    </div>
                    <ZoomablePreview resetKey={current.img.url} view={view} onViewChange={setView}>
                      <canvas ref={resultRef} className="block w-full [image-rendering:pixelated]" style={{ height: 'auto' }} />
                    </ZoomablePreview>
                  </div>
                  <div>
                    <div className="mb-1 text-sm text-slate-500">
                      원본
                      {selectedSwatch != null && (
                        <span className="ml-2 text-xs text-indigo-500">
                          선택한 색 위치 표시 중 — 색을 다시 클릭하면 해제
                        </span>
                      )}
                    </div>
                    <ZoomablePreview resetKey={current.img.url} view={view} onViewChange={setView}>
                      <div className="relative">
                        <img src={current.img.url} alt="원본" className="block w-full [image-rendering:pixelated]" style={{ height: 'auto' }} />
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
