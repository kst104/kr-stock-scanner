@echo off
REM ── deepflow 최초 설치 (Windows) ── 더블클릭하거나 명령창에서 실행
cd /d "%~dp0"
echo [deepflow] Python 확인...
where python >nul 2>nul
if errorlevel 1 (
  echo [오류] Python 이 설치되어 있지 않습니다.
  echo        https://www.python.org/downloads/ 에서 Python 3.10 이상을 설치하세요.
  echo        설치 시 "Add Python to PATH" 체크 필수.
  pause
  exit /b 1
)
echo [deepflow] 가상환경 생성...
if not exist .venv (
  python -m venv .venv
)
echo [deepflow] 패키지 설치...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if not exist .env (
  copy .env.example .env >nul
  echo [deepflow] .env 파일을 만들었습니다 — 메모장으로 열어 본인 KIS 키를 입력하세요.
)
echo.
echo [완료] 설치가 끝났습니다. 이제 start.bat 을 실행하세요.
pause
