import { Link } from 'react-router-dom'
import { LOCAL_MODULE_DOWNLOAD_URL } from '../config'

export default function BackgroundRemovalGuide() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/background-removal" className="text-sm text-indigo-500 hover:underline">
        ← 배경 제거 도구로
      </Link>

      <header className="mt-2 flex items-center gap-3">
        <span className="text-3xl">🪄</span>
        <div>
          <h1 className="text-2xl font-bold">배경 제거(누끼) 사용 가이드</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            두 가지 처리 방식과 로컬 모듈 설치까지, 천천히 따라 하면 됩니다.
          </p>
        </div>
      </header>

      {/* 두 방식 비교 */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">어떤 방식을 쓸까?</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 font-medium"> </th>
                <th className="px-3 py-2 font-medium">브라우저 (기본)</th>
                <th className="px-3 py-2 font-medium">로컬 모듈</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr>
                <td className="px-3 py-2 text-slate-500">설치</td>
                <td className="px-3 py-2">필요 없음 (바로 사용)</td>
                <td className="px-3 py-2">실행파일 1개 다운로드</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-500">품질</td>
                <td className="px-3 py-2">좋음</td>
                <td className="px-3 py-2">더 좋음 (큰 모델)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-500">속도</td>
                <td className="px-3 py-2">기기 성능에 따라 다름</td>
                <td className="px-3 py-2">PC CPU/GPU 사용, 일정함</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-500">개인정보</td>
                <td className="px-3 py-2">업로드 없음 (브라우저 내)</td>
                <td className="px-3 py-2">업로드 없음 (내 PC)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          대부분은 <strong>브라우저(기본)</strong>로 충분합니다. 더 깔끔한 결과가 필요하면
          로컬 모듈을 쓰세요.
        </p>
      </section>

      {/* 방법 1 */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">방법 1 · 브라우저 (설치 없이)</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>
            <Link to="/background-removal" className="text-indigo-500 underline">
              배경 제거 도구
            </Link>
            에서 처리 방식을 <strong>브라우저 (기본)</strong>로 둡니다.
          </li>
          <li>이미지를 끌어다 놓거나 클릭해서 올립니다.</li>
          <li>
            <strong>배경 제거 실행</strong>을 누릅니다. 처음 한 번은 AI 모델(수십 MB)을
            내려받느라 잠시 걸립니다(다음부터는 빠름).
          </li>
          <li>결과가 나오면 <strong>PNG 다운로드</strong>로 저장합니다.</li>
        </ol>
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          모델 가중치만 외부 CDN에서 받고, <strong>이미지는 절대 업로드되지 않습니다.</strong>
          최신 크롬·엣지에서 가장 빠릅니다(WebGPU 가속).
        </p>
      </section>

      {/* 방법 2 */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">방법 2 · 로컬 모듈 (고품질)</h2>
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            설치·파이썬 지식 없이 <strong>실행파일 하나만 받아 더블클릭</strong>하면 됩니다.
          </p>
          <a
            href={LOCAL_MODULE_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            ⬇ 로컬 누끼 모듈 받기 (Windows)
          </a>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>위 버튼에서 <code>LocalBGModule.exe</code>를 받습니다.</li>
          <li>
            받은 파일을 더블클릭합니다.{' '}
            <strong>“Windows의 PC 보호”</strong> 경고가 뜨면{' '}
            <strong>추가 정보 → 실행</strong>을 누르세요. (서명만 안 된 정상 파일입니다.)
          </li>
          <li>검은 창이 뜨고 <strong>“준비 완료!”</strong>가 보일 때까지 둡니다(첫 실행은 모델 다운로드로 시간이 걸립니다).</li>
          <li>
            <Link to="/background-removal" className="text-indigo-500 underline">
              배경 제거 도구
            </Link>
            로 가서 처리 방식을 <strong>로컬 모듈</strong>로 바꾸고{' '}
            <strong>연결 확인</strong> → “연결됨”이면 준비 끝.
          </li>
          <li>이미지를 올리고 <strong>배경 제거 실행</strong>.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          검은 창은 서버입니다. 누끼를 쓰는 동안 <strong>닫지 마세요.</strong> 다 쓰면 창을 닫으면 종료됩니다.
        </p>
      </section>

      {/* 팁 */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">픽셀아트·단색 배경 팁</h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          시안·마젠타처럼 <strong>단색(크로마키) 배경</strong>이라면 AI 누끼보다{' '}
          <Link to="/chroma-key" className="text-indigo-500 underline">
            크로마키 제거
          </Link>{' '}
          도구가 가장자리 색 번짐까지 더 깔끔하게 처리합니다. AI 누끼 후 외곽선에 옅은
          테두리가 남으면 크로마키 도구로 한 번 더 다듬어도 좋습니다.
        </p>
      </section>

      {/* 문제 해결 */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">문제 해결</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium">로컬 모듈 “연결 확인”이 실패해요</dt>
            <dd className="mt-0.5 text-slate-600 dark:text-slate-400">
              검은 창에 “준비 완료!”가 떴는지 확인하세요. 크롬·엣지를 쓰고, 주소가{' '}
              <code>http://localhost:8765</code>인지 확인하세요. 방화벽 허용 창이 뜨면 허용합니다.
            </dd>
          </div>
          <div>
            <dt className="font-medium">8765 포트가 이미 쓰인다고 나와요</dt>
            <dd className="mt-0.5 text-slate-600 dark:text-slate-400">
              실행 전 환경변수 <code>BG_PORT</code>로 포트를 바꿀 수 있습니다(예{' '}
              <code>8770</code>). 그 경우 도구의 주소도 <code>http://localhost:8770</code>으로 바꿔 입력하세요.
            </dd>
          </div>
          <div>
            <dt className="font-medium">브라우저 방식이 너무 느려요</dt>
            <dd className="mt-0.5 text-slate-600 dark:text-slate-400">
              첫 실행은 모델 다운로드 때문입니다(이후 빨라짐). 최신 크롬·엣지를 쓰면 WebGPU
              가속이 켜집니다. 그래도 느리면 로컬 모듈을 쓰세요.
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-10">
        <Link
          to="/background-removal"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          배경 제거 도구 열기 →
        </Link>
      </div>
    </div>
  )
}
