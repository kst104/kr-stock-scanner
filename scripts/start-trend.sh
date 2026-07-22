#!/bin/zsh
# 장세파악 서버 기동 스크립트 (launchd에서 호출)
# 사용자 zsh 환경(nvm/homebrew PATH)을 불러온 뒤 저장소 루트에서 실행한다.

source "$HOME/.zshrc" 2>/dev/null

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

exec npm run trend
