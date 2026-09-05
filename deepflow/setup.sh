#!/usr/bin/env bash
# ── deepflow 최초 설치 (macOS / Linux) ──
set -e
cd "$(dirname "$0")"

echo "[deepflow] Python 확인..."
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "[오류] Python 이 설치되어 있지 않습니다. Python 3.10 이상을 설치하세요."
  exit 1
fi

echo "[deepflow] 가상환경 생성..."
if [ ! -d .venv ]; then
  "$PY" -m venv .venv
fi

echo "[deepflow] 패키지 설치..."
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
pip install -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[deepflow] .env 파일을 만들었습니다 — 편집기로 열어 본인 KIS 키를 입력하세요."
fi

echo
echo "[완료] 설치가 끝났습니다. 이제 ./start.sh 를 실행하세요."
