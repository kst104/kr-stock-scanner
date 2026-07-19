"""실시간 캡처 매니저 — KIS 웹소켓 수집 또는 데모(합성) 피드.

- live: KIS approval → 웹소켓 접속 → 체결/호가 구독 → 저장/브로드캐스트.
- demo: KIS 키 없이 UI 를 확인할 수 있도록 합성 오더플로우를 생성.
장 마감/휴장 시에도 죽지 않고 재접속을 시도합니다.
"""
from __future__ import annotations

import asyncio
import contextlib
import math
import random
from typing import Awaitable, Callable

from . import kis, symbols as symbols_mod
from .analytics import detect_events
from .config import Settings
from .storage import store

Broadcast = Callable[[dict], Awaitable[None]]


class CaptureManager:
    def __init__(self, cfg: Settings, broadcast: Broadcast):
        self.cfg = cfg
        self.broadcast = broadcast
        self._task: asyncio.Task | None = None
        self._events_task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._restart = asyncio.Event()
        self.status = "stopped"
        self.detail = ""
        self._last_event_ts: dict[tuple, int] = {}

    # ------------------------------------------------------------- lifecycle
    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run())
        self._events_task = asyncio.create_task(self._event_loop())

    async def stop(self) -> None:
        self._stop.set()
        for t in (self._task, self._events_task):
            if t:
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await t
        self.status = "stopped"

    def restart(self) -> None:
        """종목 관리 변경 후 '캡처 재시작(적용)'."""
        self._restart.set()

    def state(self) -> dict:
        return {
            "status": self.status,
            "detail": self.detail,
            "mode": "demo" if not self.cfg.live_enabled else "live",
            "env": self.cfg.trading_env,
        }

    # ------------------------------------------------------------- main loop
    async def _run(self) -> None:
        backoff = 2
        while not self._stop.is_set():
            self._restart.clear()
            try:
                if self.cfg.live_enabled:
                    await self._run_live()
                else:
                    await self._run_demo()
                backoff = 2
            except asyncio.CancelledError:
                raise
            except Exception as e:  # 재접속
                self.status = "error"
                self.detail = str(e)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    # ------------------------------------------------------------------- live
    async def _run_live(self) -> None:
        import websockets  # 지연 임포트 (데모 전용 환경 대비)

        self.status = "connecting"
        self.detail = "approval 발급 중"
        approval = await kis.fetch_approval_key(self.cfg)
        subs = symbols_mod.load()

        self.detail = f"{self.cfg.ws_base} 접속"
        async with websockets.connect(
            self.cfg.ws_base, ping_interval=None, max_size=None
        ) as ws:
            for s in subs:
                await ws.send(kis.build_subscribe(approval, kis.TR_TRADE, s["code"]))
                if s.get("quotes"):
                    await ws.send(kis.build_subscribe(approval, kis.TR_QUOTE, s["code"]))
                await asyncio.sleep(0.03)
            self.status = "live"
            self.detail = f"{len(subs)}종목 구독"

            while not self._stop.is_set() and not self._restart.is_set():
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30)
                except asyncio.TimeoutError:
                    continue
                await self._handle_frame(ws, raw)

    async def _handle_frame(self, ws, raw: str) -> None:
        if raw and raw[0] == "{":  # JSON: 구독 응답 또는 PINGPONG
            try:
                msg = kis.json.loads(raw)  # type: ignore[attr-defined]
            except Exception:
                return
            if msg.get("header", {}).get("tr_id") == "PINGPONG":
                await ws.send(raw)
            return

        kind, records = kis.parse_realtime(raw)
        sd = kis.session_date_now()
        for rec in records:
            rec["session_date"] = sd
            if kind == "trade":
                store.insert_tick(rec)
                await self.broadcast({"type": "trade", "data": rec})
            elif kind == "quote":
                store.insert_quote(rec)
                await self.broadcast({"type": "quote", "data": rec})

    # ------------------------------------------------------------------- demo
    async def _run_demo(self) -> None:
        self.status = "demo"
        self.detail = "합성 데이터 생성 중 (KIS 키 미설정)"
        subs = symbols_mod.load()
        state = {
            s["code"]: {
                "name": s["name"],
                "quotes": s.get("quotes", False),
                "price": 10000 + random.randint(0, 90000),
                "acc_vol": 0,
                "acc_amount": 0.0,
                "t": random.random() * 6.28,
            } for s in subs
        }
        while not self._stop.is_set() and not self._restart.is_set():
            sd = kis.session_date_now()
            now = kis.kst_now_ms()
            for code, st in state.items():
                st["t"] += 0.05
                drift = math.sin(st["t"]) * st["price"] * 0.0008
                st["price"] = max(100, st["price"] + drift + random.uniform(-1, 1) * st["price"] * 0.0004)
                price = round(st["price"], 0)
                # 매수/매도 편향
                bias = 0.5 + 0.25 * math.sin(st["t"] * 0.7)
                side = "buy" if random.random() < bias else "sell"
                # 가끔 대형 체결
                volume = random.randint(1, 60)
                if random.random() < 0.04:
                    volume *= random.randint(20, 120)
                st["acc_vol"] += volume
                st["acc_amount"] += price * volume
                rec = {
                    "ts": now, "session_date": sd, "code": code, "price": price,
                    "volume": volume, "side": side, "amount": price * volume,
                    "acc_vol": st["acc_vol"], "acc_amount": st["acc_amount"],
                    "strength": round(80 + 40 * (bias - 0.5), 1),
                }
                store.insert_tick(rec)
                await self.broadcast({"type": "trade", "data": rec})

                if st["quotes"] and random.random() < 0.5:
                    tick = max(10, round(price * 0.0005))
                    ask_p = [price + tick * (i + 1) for i in range(10)]
                    bid_p = [price - tick * (i + 1) for i in range(10)]
                    ask_s = [random.randint(50, 5000) for _ in range(10)]
                    bid_s = [random.randint(50, 5000) for _ in range(10)]
                    q = {
                        "ts": now, "session_date": sd, "code": code,
                        "ask_prices": ask_p, "ask_sizes": ask_s,
                        "bid_prices": bid_p, "bid_sizes": bid_s,
                        "total_ask": sum(ask_s), "total_bid": sum(bid_s),
                    }
                    store.insert_quote(q)
                    await self.broadcast({"type": "quote", "data": q})
            await asyncio.sleep(0.5)

    # ---------------------------------------------------------- event detect
    async def _event_loop(self) -> None:
        while not self._stop.is_set():
            await asyncio.sleep(15)
            try:
                sd = kis.session_date_now()
                for s in symbols_mod.load():
                    code = s["code"]
                    for e in detect_events(code, sd, sd):
                        key = (code, e["kind"])
                        if e["ts"] <= self._last_event_ts.get(key, 0):
                            continue
                        self._last_event_ts[key] = e["ts"]
                        store.insert_event(e)
                        await self.broadcast({"type": "event", "data": e})
            except asyncio.CancelledError:
                raise
            except Exception:
                continue
