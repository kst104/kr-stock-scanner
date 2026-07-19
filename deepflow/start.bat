@echo off
REM ── deepflow 실행 (Windows) ──
cd /d "%~dp0"
if not exist .venv (
  echo [deepflow] 아직 설치되지 않았습니다. 먼저 setup.bat 을 실행하세요.
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
if not exist .env (
  copy .env.example .env >nul
  echo [deepflow] .env 를 만들었습니다 — 메모장으로 열어 본인 KIS 키를 입력한 뒤 다시 실행하세요.
)
echo [deepflow] 서버 시작 — http://127.0.0.1:8077  (종료: 이 창을 닫으세요)
python -m app.main
pause
