"""Entry point for the standalone (PyInstaller) build of the local BG module.

Double-clicking the built .exe runs this: it starts the FastAPI app with a
bundled uvicorn and keeps a friendly Korean console open. No Python install
needed on the user's machine.
"""

import os
import sys


def _enable_utf8_console() -> None:
    """Make the Windows console show Korean text correctly (cp949 -> UTF-8)."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        ctypes.windll.kernel32.SetConsoleCP(65001)
    except Exception:
        pass
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def main() -> None:
    _enable_utf8_console()
    print("=" * 56)
    print(" 로컬 누끼 모듈 (Game Image Toolkit)")
    print("=" * 56)
    print(" 시작하는 중입니다...")
    print(" 최초 1회 AI 모델(약 170MB)을 내려받습니다. 잠시만요.")
    sys.stdout.flush()

    # Port can be overridden with BG_PORT if 8765 is already in use.
    port = int(os.environ.get("BG_PORT", "8765"))

    # Importing the server triggers rembg's model load/download.
    from server import app
    import uvicorn

    print()
    print(" 준비 완료! 웹앱으로 돌아가 [연결 확인]을 눌러주세요.")
    print(f" 주소: http://localhost:{port}")
    print(" 종료하려면 이 창을 닫으세요.")
    print("=" * 56)
    sys.stdout.flush()

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — keep window open so users can read the error
        print(f"\n[오류] {exc}")
        input("\n엔터 키를 누르면 창이 닫힙니다...")
