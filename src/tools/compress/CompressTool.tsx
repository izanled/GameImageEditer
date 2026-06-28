import { useEffect, useState } from 'react'
import MultiImageDropzone, { type NamedImage } from '../../components/MultiImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import { downloadBlob } from '../../lib/image/export'
import { downloadZip, type ZipEntry } from '../../lib/zip'
import {
  compressImage,
  compressionRatio,
  outputFilename,
  shouldZip,
  type CompressFormat,
} from '../../lib/image/compress'

const tool = getTool('compress')!

interface Result {
  origSize: number
  blob: Blob
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export default function CompressTool() {
  const [images, setImages] = useState<NamedImage[]>([])
  const [origSizes, setOrigSizes] = useState<number[]>([])
  const [format, setFormat] = useState<CompressFormat>('image/jpeg')
  const [jpegQuality, setJpegQuality] = useState(80)
  const [pngColors, setPngColors] = useState(256)
  const [pngLossless, setPngLossless] = useState(false)
  const [background, setBackground] = useState('#ffffff')
  const [results, setResults] = useState<(Result | null)[]>([])
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onImages(next: NamedImage[]) {
    setError(null)
    const merged = [...images, ...next]
    setImages(merged)
    // Original byte sizes come from the object URLs backing each image.
    const sizes = await Promise.all(
      next.map((n) =>
        fetch(n.img.url)
          .then((r) => r.blob())
          .then((b) => b.size)
          .catch(() => 0),
      ),
    )
    setOrigSizes((prev) => [...prev, ...sizes])
  }

  function reset() {
    images.forEach((n) => URL.revokeObjectURL(n.img.url))
    setImages([])
    setOrigSizes([])
    setResults([])
    setSelected(0)
    setError(null)
  }

  // Debounced re-encode whenever inputs or settings change.
  useEffect(() => {
    if (images.length === 0) {
      setResults([])
      return
    }
    let cancelled = false
    const id = setTimeout(async () => {
      setBusy(true)
      try {
        const out: (Result | null)[] = []
        for (let i = 0; i < images.length; i++) {
          if (cancelled) return
          const blob = await compressImage(images[i].img, {
            format,
            jpegQuality,
            pngColors,
            pngLossless,
            background,
          })
          out.push({ origSize: origSizes[i] ?? 0, blob })
          // Yield so a long batch doesn't freeze the UI.
          await new Promise((r) => setTimeout(r, 0))
        }
        if (!cancelled) setResults(out)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [images, origSizes, format, jpegQuality, pngColors, pngLossless, background])

  // Object URL for the selected preview; revoked on change/unmount.
  useEffect(() => {
    const result = results[selected]
    if (!result) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(result.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [results, selected])

  async function download() {
    const ready = results.filter((r): r is Result => r != null)
    if (ready.length === 0) return
    if (shouldZip(images.length)) {
      const entries: ZipEntry[] = images.map((n, i) => ({
        name: outputFilename(n.name, format),
        blob: results[i]!.blob,
      }))
      await downloadZip(entries, 'compressed.zip')
    } else {
      downloadBlob(results[0]!.blob, outputFilename(images[0].name, format))
    }
  }

  const totalOrig = results.reduce((s, r) => s + (r?.origSize ?? 0), 0)
  const totalComp = results.reduce((s, r) => s + (r?.blob.size ?? 0), 0)
  const isJpeg = format === 'image/jpeg'

  return (
    <ToolShell tool={tool}>
      {images.length === 0 ? (
        <MultiImageDropzone onImages={onImages} onError={setError} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="shrink-0 space-y-5 lg:w-72">
            <div className="text-sm text-slate-500">
              이미지 {images.length}장{busy && ' · 압축 중…'}
            </div>

            <div>
              <div className="mb-1 text-sm text-slate-500">출력 포맷</div>
              <div className="flex gap-2">
                {(['image/jpeg', 'image/png'] as CompressFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={`rounded-md border px-4 py-1.5 text-sm ${
                      format === f
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    {f === 'image/jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </div>

            {isJpeg ? (
              <>
                <label className="block text-sm">
                  품질: {jpegQuality}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  배경색
                  <input
                    type="color"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    className="h-7 w-10 rounded border border-slate-300 dark:border-slate-700"
                  />
                  <span className="text-xs text-slate-500">투명 → 이 색으로 채움</span>
                </label>
              </>
            ) : (
              <>
                <label className="block text-sm">
                  색상 수: {pngLossless ? '무손실' : pngColors}
                  <input
                    type="range"
                    min={2}
                    max={256}
                    value={pngColors}
                    disabled={pngLossless}
                    onChange={(e) => setPngColors(Number(e.target.value))}
                    className="mt-1 w-full disabled:opacity-40"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pngLossless}
                    onChange={(e) => setPngLossless(e.target.checked)}
                  />
                  무손실 (색상 보존, 용량 큼)
                </label>
                <p className="text-xs text-slate-500">
                  PNG는 무손실이라 색상 수를 줄여 용량을 조절합니다. 투명도는 유지됩니다.
                </p>
              </>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <DownloadButton onClick={download} disabled={busy || results.length === 0}>
                {shouldZip(images.length) ? 'ZIP 다운로드' : '다운로드'}
              </DownloadButton>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                이미지 변경
              </button>
            </div>
            <div>
              <MultiImageDropzone onImages={onImages} onError={setError} compact />
            </div>
          </div>

          <div className="flex-1 space-y-4">
            {previewUrl && (
              <div>
                <div className="text-sm text-slate-500">
                  미리보기: {images[selected]?.name}
                </div>
                <div className="checkerboard mt-2 inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                  <img
                    src={previewUrl}
                    alt="compressed preview"
                    style={{ maxWidth: '100%', maxHeight: '50vh' }}
                  />
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">파일</th>
                    <th className="px-3 py-2 font-medium">원본</th>
                    <th className="px-3 py-2 font-medium">압축 후</th>
                    <th className="px-3 py-2 font-medium">절감</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((n, i) => {
                    const r = results[i]
                    const ratio = r ? compressionRatio(r.origSize, r.blob.size) : null
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelected(i)}
                        className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${
                          selected === i ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
                        }`}
                      >
                        <td className="max-w-[14rem] truncate px-3 py-2">{n.name}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {formatBytes(origSizes[i] ?? 0)}
                        </td>
                        <td className="px-3 py-2">
                          {r ? formatBytes(r.blob.size) : '…'}
                        </td>
                        <td
                          className={`px-3 py-2 ${
                            ratio != null && ratio < 0 ? 'text-red-500' : 'text-emerald-600'
                          }`}
                        >
                          {ratio != null ? `${ratio}%` : '…'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {results.length > 0 && (
                  <tfoot className="border-t border-slate-200 dark:border-slate-700">
                    <tr className="font-medium">
                      <td className="px-3 py-2">합계</td>
                      <td className="px-3 py-2 text-slate-500">{formatBytes(totalOrig)}</td>
                      <td className="px-3 py-2">{formatBytes(totalComp)}</td>
                      <td className="px-3 py-2 text-emerald-600">
                        {compressionRatio(totalOrig, totalComp)}%
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
