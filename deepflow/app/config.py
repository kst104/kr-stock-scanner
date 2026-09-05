"""환경설정 로딩 (.env 기반, BYOK).

모든 민감정보(KIS 키)는 로컬 .env 에서만 읽습니다. 외부로 전송하지 않습니다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - dotenv 미설치 시에도 기동 가능하게
    def load_dotenv(*_a, **_k):  # type: ignore
        return False

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
WEB_DIR = BASE_DIR / "web"

# 실전 / 모의투자 엔드포인트
REAL_REST = "https://openapi.koreainvestment.com:9443"
DEMO_REST = "https://openapivts.koreainvestment.com:29443"
REAL_WS = "ws://ops.koreainvestment.com:21000"
DEMO_WS = "ws://ops.koreainvestment.com:31000"


def _as_bool(v: str | None, default: bool = False) -> bool:
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass
class Settings:
    app_key: str = ""
    app_secret: str = ""
    trading_env: str = "real"  # real | demo
    host: str = "127.0.0.1"
    port: int = 8077
    demo: bool = False  # 합성 데이터 모드 (KIS 키 없이 UI 확인용)
    open_browser: bool = True

    @property
    def rest_base(self) -> str:
        return DEMO_REST if self.trading_env == "demo" else REAL_REST

    @property
    def ws_base(self) -> str:
        return DEMO_WS if self.trading_env == "demo" else REAL_WS

    @property
    def has_keys(self) -> bool:
        return bool(self.app_key and self.app_secret)

    @property
    def live_enabled(self) -> bool:
        """실제 KIS 수집을 시도할지 여부."""
        return self.has_keys and not self.demo


def load_settings() -> Settings:
    load_dotenv(BASE_DIR / ".env")
    env = (os.getenv("KIS_TRADING_ENV") or "real").strip().lower()
    if env not in {"real", "demo"}:
        env = "real"
    demo = _as_bool(os.getenv("DEEPFLOW_DEMO"), False)
    return Settings(
        app_key=(os.getenv("KIS_APP_KEY") or "").strip(),
        app_secret=(os.getenv("KIS_APP_SECRET") or "").strip(),
        trading_env=env,
        host=(os.getenv("DEEPFLOW_HOST") or "127.0.0.1").strip(),
        port=int(os.getenv("DEEPFLOW_PORT") or "8077"),
        demo=demo,
        open_browser=_as_bool(os.getenv("DEEPFLOW_OPEN_BROWSER"), True),
    )


DATA_DIR.mkdir(parents=True, exist_ok=True)
