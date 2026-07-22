#!/bin/zsh
# 장세파악 서버를 macOS launchd에 등록한다.
# - 로그인 시 자동 실행 (RunAtLoad)
# - 꺼지면 자동 재시작 (KeepAlive)
# 실행: zsh scripts/install-macos.sh
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.krstock.trend"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

chmod +x "$REPO_DIR/scripts/start-trend.sh"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$REPO_DIR/scripts/start-trend.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/krstock-trend.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/krstock-trend.err</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "설치 완료: $LABEL"
echo "서버 주소: http://localhost:3100"
echo "로그: /tmp/krstock-trend.log (오류는 /tmp/krstock-trend.err)"
echo "해제: zsh scripts/uninstall-macos.sh"
