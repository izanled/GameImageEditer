# 게임 이미지 툴킷 (Game Image Toolkit)

게임 개발용 이미지 편집 웹 툴킷. **모든 처리는 브라우저에서** 이루어지며 이미지를
서버로 업로드하지 않습니다. 정적 사이트로 무료 배포할 수 있습니다.

## 기능 (MVP)

| 도구 | 설명 |
|------|------|
| 🪄 배경 제거 (누끼) | 브라우저 내 AI(`@imgly/background-removal`, WebGPU) **또는** 로컬 모듈(Python `rembg`)로 배경 제거 → 투명 PNG |
| 🎬 크로마키 제거 | 단색 배경을 색상 기준으로 제거. 가장자리 색 번짐 제거(despill) + 테두리 다듬기(choke)로 깔끔한 외곽선 |
| ✂️ 이미지 자르기 | 드래그 또는 수치 입력으로 픽셀 단위 정확한 크롭 |
| 📐 사이즈 조절 | px 지정 / 비율 고정 / 정수 배율(2·3·4·8×) / 픽셀아트 Nearest-neighbor |
| 🖼️ 캔버스 조절 | 내용 유지 + 캔버스 크기 변경, 9방향 앵커, 투명/색상 여백 |
| 🎞️ 스프라이트 시트 만들기 | 여러 프레임을 균일 격자로 합쳐 한 장의 시트로 (애니메이션 캐릭터용). 열 수·간격·정렬·순서 조절 |
| 🔀 스프라이트 시트 편집 | 시트(여러 장 가능)를 격자로 나눠 프레임을 추출 → 순서를 자유롭게 바꾸거나 섞어 → 미리보기 후 다시 내보내기 |
| 🧩 그리드 분할 | 스프라이트 시트를 균일 격자로 분할, 빈 셀 건너뛰기, ZIP 일괄 저장 |

> 배경 제거는 기본적으로 브라우저에서 처리되며, 더 높은 품질이 필요하면 로컬에서
> [`local-module`](local-module/README.md)(Python `rembg`)을 띄워 연결할 수 있습니다.

## 기술 스택

Vite · React · TypeScript · Tailwind CSS v4 · Zustand · React Router(Hash) ·
JSZip · `@imgly/background-removal`

## 개발 / 빌드

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 타입체크 + 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
npm test           # 단위 테스트 (Vitest)
npm run typecheck  # 타입 검사만
```

## 배포

`dist/`를 정적 호스팅(GitHub Pages, Vercel, Netlify, Cloudflare Pages 등)에 올리면 됩니다.
`base: './'` + HashRouter를 사용하므로 별도의 서버 리라이트 설정이 필요 없습니다.

### GitHub Pages 자동 배포

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)이 포함되어 있어,
`main` 브랜치에 푸시하면 자동으로 빌드 → 배포됩니다.

1. GitHub에서 빈 저장소를 만든다.
2. 로컬에서 푸시:
   ```bash
   git add -A && git commit -m "init"
   git remote add origin https://github.com/<유저>/<레포>.git
   git push -u origin main
   ```
3. GitHub 저장소 → **Settings → Pages → Build and deployment → Source**를
   **GitHub Actions**로 설정.
4. 푸시할 때마다 `https://<유저>.github.io/<레포>/`에 배포됨.

> Cloudflare Pages를 쓰려면 대시보드에서 저장소를 연결하고 빌드 명령 `npm run build`,
> 출력 디렉터리 `dist`만 지정하면 됩니다. (COOP/COEP 헤더는 `public/_headers`로 설정 가능)

### 로컬 누끼 모듈(exe) 배포

로컬 모듈 실행파일(`.exe`, 수백 MB)은 **사이트에 직접 올리지 말고** GitHub Pages 100MB /
Cloudflare Pages 25MB **파일 크기 제한을 넘기므로 GitHub Releases에 올립니다**:

1. `local-module/build-exe.bat` 실행 → `local-module/dist/LocalBGModule.exe` 생성.
2. GitHub 저장소 → **Releases → Draft a new release** → 그 exe를 첨부해 발행.
3. [`src/config.ts`](src/config.ts)의 `LOCAL_MODULE_DOWNLOAD_URL`을 해당 릴리스 주소로 교체.
   - 앱의 **배경 제거 → 로컬 모듈** 패널에 "다운로드" 버튼이 그 주소로 연결됩니다.

**자동 빌드·배포 (권장):** 버전 태그를 푸시하면 [`.github/workflows/release-exe.yml`](.github/workflows/release-exe.yml)이
Windows에서 exe를 빌드해 그 태그의 Release에 자동 첨부합니다. 위 1~2단계가 필요 없습니다.

```bash
git tag v0.2.0
git push origin v0.2.0
```

> `LOCAL_MODULE_DOWNLOAD_URL`은 `releases/latest`를 가리키므로 새 태그를 올릴 때마다
> 버튼이 자동으로 최신 exe를 받습니다.

### 배경 제거 성능 (선택) — COOP/COEP 헤더

배경 제거의 멀티스레드 WASM 가속을 켜려면 호스트에서 아래 헤더를 설정하세요
(WebGPU 환경에서는 없어도 동작하며, 자동으로 단일 스레드로 폴백합니다):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

> AI 모델 가중치는 최초 1회 `staticimgly.com` CDN에서 내려받습니다.
> 이미지 자체는 업로드되지 않고 브라우저에서만 처리됩니다.

## 프로젝트 구조

```
src/
  pages/           Home, ToolPlaceholder
  components/       ImageDropzone, DownloadButton, ToolShell, layout/
  tools/           registry.ts + 도구별 폴더(5개)
  lib/image/       load·draw·export·resize·canvasResize·crop·gridSlice (+ *.test.ts)
  lib/zip.ts       JSZip 래퍼
  store/           themeStore (다크모드)
```

## 로컬 누끼 모듈

상세 설치/실행은 [`local-module/README.md`](local-module/README.md) 참고. 요약:

```bash
cd local-module
./run.sh        # Windows: run.bat  (최초 1회 의존성 자동 설치)
```

서버가 뜨면 웹앱 → 배경 제거 → 처리 방식 **로컬 모듈** → 주소 입력 → 연결 확인.

## 로드맵 (이후)

- B군: 여백 자동 트림, 배치 처리, 포맷 변환(PNG/JPG/WebP)
- C군: 회전/뒤집기, 색상 보정, 팔레트 스왑, 외곽선/그림자, 애니메이션 프리뷰, GIF/APNG
- 공통: 한/영 다국어, Undo/Redo
