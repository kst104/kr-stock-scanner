#!/usr/bin/env bash
# ── deepflow 실행 (macOS / Linux) ──
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[deepflow] 아직 설치되지 않았습니다. 먼저 ./setup.sh 를 실행하세요."
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[deepflow] .env 를 만들었습니다 — 편집기로 열어 본인 KIS 키를 입력한 뒤 다시 실행하세요."
fi

echo "[deepflow] 서버 시작 — http://127.0.0.1:8077  (종료: Ctrl+C)"
python -m app.main
