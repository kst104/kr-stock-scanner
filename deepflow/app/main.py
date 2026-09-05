"""deepflow FastAPI 앱 — UI 서빙 + REST/WS API + 실시간 캡처 구동.

기동:  python -m app.main   (start.bat / start.sh 가 호출)
접속:  http://127.0.0.1:8077
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import threading
import webbrowser

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import analytics, kis, symbols as symbols_mod
from .capture import CaptureManager
from .config import WEB_DIR, load_settings
from .storage import store

cfg = load_settings()
app = FastAPI(title="deepflow", version="1.0.0")


class Hub:
    """브라우저 웹소켓 브로드캐스트 허브."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def add(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.add(ws)

    async def remove(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, msg: dict) -> None:
        if not self._clients:
            return
        payload = json.dumps(msg, ensure_ascii=False)
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.remove(ws)


hub = Hub()
capture = CaptureManager(cfg, hub.broadcast)


@app.on_event("startup")
async def _startup() -> None:
    capture.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await capture.stop()
    store.close()


# --------------------------------------------------------------------- REST
@app.get("/api/config")
async def api_config():
    return {
        "capture": capture.state(),
        "has_keys": cfg.has_keys,
        "slots": symbols_mod.slot_usage(),
        "version": "1.0.0",
    }


@app.get("/api/symbols")
async def api_symbols():
    return {"symbols": symbols_mod.load(), "slots": symbols_mod.slot_usage()}


@app.post("/api/symbols")
async def api_set_symbols(payload: dict):
    items = payload.get("symbols", [])
    if not isinstance(items, list):
        return JSONResponse({"error": "symbols must be a list"}, status_code=400)
    symbols_mod.save(items)
    return {"ok": True, "symbols": symbols_mod.load(), "slots": symbols_mod.slot_usage()}


@app.post("/api/capture/restart")
async def api_restart():
    capture.restart()
    return {"ok": True, "capture": capture.state()}


@app.get("/api/sessions")
async def api_sessions():
    sessions = store.sessions()
    if not sessions:
        sessions = [kis.session_date_now()]
    return {"sessions": sessions, "today": kis.session_date_now()}


@app.get("/api/ticks")
async def api_ticks(code: str | None = None, date: str | None = None,
                    start: int | None = None, end: int | None = None,
                    limit: int = 20000):
    date = date or kis.session_date_now()
    return {"ticks": store.ticks(code, date, start, end, limit)}


@app.get("/api/deep-trades")
async def api_deep_trades(date: str | None = None, code: str | None = None,
                          min_amount: float = 30_000_000, limit: int = 300):
    date = date or kis.session_date_now()
    return {"trades": store.large_trades(date, min_amount, code, limit)}


@app.get("/api/cvd")
async def api_cvd(code: str, date: str | None = None, bucket_ms: int = 5000):
    date = date or kis.session_date_now()
    return {"cvd": analytics.cvd_series(code, date, bucket_ms)}


@app.get("/api/profile")
async def api_profile(code: str, date: str | None = None, buckets: int = 60):
    date = date or kis.session_date_now()
    return analytics.turnover_profile(code, date, buckets)


@app.get("/api/dom")
async def api_dom(code: str, date: str | None = None, at: int | None = None):
    date = date or kis.session_date_now()
    q = store.quote_at(code, date, at)
    return {"quote": q}


@app.get("/api/dom/series")
async def api_dom_series(code: str, date: str | None = None, limit: int = 3000):
    date = date or kis.session_date_now()
    return {"quotes": store.quotes(code, date, limit)}


@app.get("/api/themes")
async def api_themes(date: str | None = None):
    date = date or kis.session_date_now()
    syms = symbols_mod.load()
    return {
        "themes": analytics.theme_flow(date, syms),
        "series": analytics.market_flow_series(date, syms),
    }


@app.get("/api/events")
async def api_events(date: str | None = None, code: str | None = None,
                     limit: int = 500):
    date = date or kis.session_date_now()
    return {"events": store.events(date, code, limit)}


# ---------------------------------------------------------------------- WS
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    await hub.add(ws)
    try:
        while True:
            await ws.receive_text()  # 클라이언트 keepalive; 무시
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.remove(ws)


# --------------------------------------------------------------- static / UI
app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


@app.get("/")
async def index():
    return FileResponse(str(WEB_DIR / "index.html"))


def _open_browser_later(url: str) -> None:
    import time
    time.sleep(1.5)
    with contextlib.suppress(Exception):
        webbrowser.open(url)


def main() -> None:
    import uvicorn

    url = f"http://{cfg.host}:{cfg.port}"
    print(f"[deepflow] 시작 — {url}  (mode={'demo' if not cfg.live_enabled else 'live/'+cfg.trading_env})")
    if cfg.open_browser:
        threading.Thread(target=_open_browser_later, args=(url,), daemon=True).start()
    uvicorn.run(app, host=cfg.host, port=cfg.port, log_level="info")


if __name__ == "__main__":
    main()
