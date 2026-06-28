# 로컬 누끼 모듈 (Local Background-Removal Module)

웹앱의 **배경 제거**를 브라우저 대신 로컬에서 처리하는 작은 HTTP 서버입니다.
Python [`rembg`](https://github.com/danielgatis/rembg) 기반이며, 이미지는 이
컴퓨터를 벗어나지 않습니다.

## 요구 사항
- Python 3.9+ (권장 3.10~3.12)

## 실행

**Windows**
```bat
run.bat
```

**macOS / Linux**
```bash
chmod +x run.sh
./run.sh
```

최초 실행 시 가상환경을 만들고 의존성을 설치합니다(수 분 소요, 모델은 첫 요청 때
자동 다운로드). 이후에는 바로 서버만 뜹니다.

수동 실행:
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   /  macOS·Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8765
```

## 웹앱과 연결
1. 위 서버를 실행한다 (`http://localhost:8765`).
2. 웹앱 → **배경 제거** 도구 → 처리 방식 **로컬 모듈** 선택.
3. 주소(기본 `http://localhost:8765`) 입력 후 **연결 확인** → "연결됨" 표시.
4. 이미지를 올리고 **배경 제거 실행**.

## 단독 실행파일(.exe) 빌드 — 배포용

비개발자 사용자에게는 Python 설치 없이 **더블클릭 한 번**으로 쓰게 하는 게 좋습니다.
`build-exe.bat`를 실행하면 PyInstaller로 단일 실행파일을 만듭니다:

```bat
build-exe.bat
```

- 결과: `dist\LocalBGModule.exe` (수백 MB). 이걸 **GitHub Releases**에 올리세요.
- 실행파일은 진입점 [`app_entry.py`](app_entry.py)로 동작하며, 더블클릭하면
  `http://localhost:8765`에 서버가 뜨고 친절한 콘솔 안내가 표시됩니다.
- ⚠️ 서명되지 않은 exe라 Windows가 **"Windows의 PC 보호 / 알 수 없는 게시자"**
  (SmartScreen) 경고를 띄울 수 있습니다. 사용자에게 *추가 정보 → 실행*을 안내하거나,
  배포 규모가 커지면 코드 서명 인증서 사용을 권장합니다.
- 첫 실행 시 AI 모델(약 170MB)을 한 번 자동 다운로드합니다.

## API
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | `{"status":"ok","model":"..."}` |
| POST | `/remove-bg` | multipart `file` 업로드 → 투명 PNG(`image/png`) 반환 |

## 참고
- 모델은 `server.py`의 `MODEL` 변수로 변경할 수 있습니다
  (예: `u2net`, `isnet-general-use`, `isnet-anime` 등).
- HTTPS로 배포된 웹앱에서 `http://localhost`로 호출 시 브라우저의 혼합 콘텐츠
  정책이 막을 수 있습니다. 로컬 개발(`http://localhost:5173`)에서는 문제없이 동작합니다.
