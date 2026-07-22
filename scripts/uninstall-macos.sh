#!/bin/zsh
# 장세파악 launchd 등록을 해제한다.
# 실행: zsh scripts/uninstall-macos.sh
LABEL="com.krstock.trend"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "해제 완료: $LABEL"
