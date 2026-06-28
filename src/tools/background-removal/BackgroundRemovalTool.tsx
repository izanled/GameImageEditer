import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Config } from '@imgly/background-removal'
import ImageDropzone from '../../components/ImageDropzone'
import ToolShell from '../../components/ToolShell'
import DownloadButton from '../../components/DownloadButton'
import { getTool } from '../registry'
import type { LoadedImage } from '../../lib/image/load'
import { downloadBlob, replaceExt } from '../../lib/image/export'
import { useSettings } from '../../store/settingsStore'
import { checkLocalHealth, removeBackgroundLocal } from '../../lib/localBgClient'
import { LOCAL_MODULE_DOWNLOAD_URL } from '../../config'

const tool = getTool('background-removal')!

type Status = 'idle' | 'processing' | 'done' | 'error'
type HealthState = 'unknown' | 'checking' | 'ok' | 'fail'

export default function BackgroundRemovalTool() {
  const bgBackend = useSettings((s) => s.bgBackend)
  const setBgBackend = useSettings((s) => s.setBgBackend)
  const localUrl = useSettings((s) => s.localBgUrl)
  const setLocalUrl = useSettings((s) => s.setLocalBgUrl)

  const [image, setImage] = useState<LoadedImage | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('image.png')
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState('')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthState>('unknown')
  const [healthMsg, setHealthMsg] = useState('')

  function onImage(img: LoadedImage, f: File) {
    setImage(img)
    setFile(f)
    setName(f.name)
    setStatus('idle')
    setResultUrl(null)
    setResultBlob(null)
    setError(null)
  }

  async function checkConnection() {
    setHealth('checking')
    setHealthMsg('')
    const res = await checkLocalHealth(localUrl)
    if (res.ok) {
      setHealth('ok')
      setHealthMsg(
        typeof res.info?.model === 'string' ? `모델: ${res.info.model}` : '연결됨',
      )
    } else {
      setHealth('fail')
      setHealthMsg(res.error ?? '연결 실패')
    }
  }

  async function runBrowser(input: File): Promise<Blob> {
    const { removeBackground } = await import('@imgly/background-removal')
    const config: Config = {
      device: 'gpu',
      output: { format: 'image/png' },
      progress: (key, current, total) => {
        if (key.startsWith('fetch')) {
          const pct = total ? Math.round((current / total) * 100) : 0
          setProgress(`모델 다운로드 중… ${pct}%`)
        } else {
          setProgress('배경 제거 처리 중…')
        }
      },
    }
    return removeBackground(input, config)
  }

  async function run() {
    if (!file) return
    setStatus('processing')
    setError(null)
    setResultUrl(null)
    setResultBlob(null)
    setProgress(bgBackend === 'local' ? '로컬 모듈 처리 중…' : '모델 준비 중…')
    try {
      const blob =
        bgBackend === 'local'
          ? await removeBackgroundLocal(localUrl, file)
          : await runBrowser(file)
      setResultBlob(blob)
      setResultUrl(URL.createObjectURL(blob))
      setStatus('done')
    } catch (e) {
      setError((e as Error).message || '배경 제거에 실패했습니다.')
      setStatus('error')
    }
  }

  function download() {
    if (resultBlob) downloadBlob(resultBlob, replaceExt(name, 'png'))
  }

  return (
    <ToolShell tool={tool}>
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
        💡 시안·마젠타 같은 <strong>단색(크로마키) 배경</strong>이라면{' '}
        <Link to="/chroma-key" className="font-medium underline">
          크로마키 제거
        </Link>{' '}
        도구가 가장자리 색 번짐까지 깔끔하게 처리합니다.
      </p>
      <div className="mb-5 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <div className="text-sm font-medium">처리 방식</div>
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm dark:border-slate-700">
          <button
            type="button"
            onClick={() => setBgBackend('browser')}
            className={`rounded-md px-3 py-1 ${bgBackend === 'browser' ? 'bg-indigo-600 text-white' : ''}`}
          >
            브라우저 (기본)
          </button>
          <button
            type="button"
            onClick={() => setBgBackend('local')}
            className={`rounded-md px-3 py-1 ${bgBackend === 'local' ? 'bg-indigo-600 text-white' : ''}`}
          >
            로컬 모듈
          </button>
        </div>

        {bgBackend === 'browser' ? (
          <p className="text-xs text-slate-500">
            브라우저 내 AI로 처리합니다. 최초 1회 모델(수십 MB)을 내려받으며, 이미지는
            업로드되지 않습니다.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <p className="mb-2 text-xs text-emerald-800 dark:text-emerald-300">
                <strong>처음이세요?</strong> 아래 파일을 받아 더블클릭만 하면 됩니다. (설치·파이썬 불필요)
              </p>
              <a
                href={LOCAL_MODULE_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                ⬇ 로컬 누끼 모듈 받기 (Windows)
              </a>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-emerald-800/90 dark:text-emerald-300/90">
                <li>받은 파일을 더블클릭 → 검은 창이 뜨면 그대로 두세요.</li>
                <li>아래 <strong>연결 확인</strong>이 “연결됨”이 되면 준비 끝.</li>
                <li>크롬 또는 엣지 브라우저를 권장합니다.</li>
              </ol>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="http://localhost:8765"
                className="w-64 rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
              />
              <button
                type="button"
                onClick={checkConnection}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                연결 확인
              </button>
              {health === 'checking' && <span className="text-xs text-slate-400">확인 중…</span>}
              {health === 'ok' && <span className="text-xs text-emerald-500">● 연결됨 {healthMsg}</span>}
              {health === 'fail' && <span className="text-xs text-red-500">● 실패: {healthMsg}</span>}
            </div>
            <p className="text-xs text-slate-500">
              고급: 모델 변경·소스 실행 방법은 <code>local-module/README.md</code> 참고
              (Python <code>rembg</code> 기반).
            </p>
          </div>
        )}
      </div>

      {!image ? (
        <ImageDropzone onImage={onImage} onError={setError} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={status === 'processing'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {status === 'processing' ? '처리 중…' : '배경 제거 실행'}
            </button>
            {status === 'done' && (
              <DownloadButton onClick={download}>PNG 다운로드</DownloadButton>
            )}
            <button
              type="button"
              onClick={() => setImage(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              이미지 변경
            </button>
          </div>

          {status === 'processing' && (
            <p className="text-sm text-indigo-500">{progress}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-sm text-slate-500">원본</div>
              <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                <img
                  src={image.url}
                  alt="원본"
                  className="block max-w-full"
                  style={{ maxHeight: '60vh' }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">결과 (투명 배경)</div>
              <div className="checkerboard inline-block max-w-full overflow-auto rounded border border-slate-200 dark:border-slate-700">
                {resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="결과"
                    className="block max-w-full"
                    style={{ maxHeight: '60vh' }}
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center text-sm text-slate-400">
                    아직 없음
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </ToolShell>
  )
}
