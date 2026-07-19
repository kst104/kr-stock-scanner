"""KIS Open API 클라이언트 — 실시간 approval_key 발급 + 웹소켓 파싱.

실시간 TR:
  - H0STCNT0 : 주식 체결
  - H0STASP0 : 주식 호가(10단계)

수집/저장은 전적으로 로컬에서만 이뤄지며 KIS 이외 외부로 전송되지 않습니다.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

from .config import Settings

KST = timezone(timedelta(hours=9))

TR_TRADE = "H0STCNT0"
TR_QUOTE = "H0STASP0"


def kst_now_ms() -> int:
    return int(datetime.now(KST).timestamp() * 1000)


def session_date_now() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def _ts_from_hhmmss(hhmmss: str) -> int:
    """장중 HHMMSS(KST) → epoch millis. 파싱 실패 시 현재시각."""
    try:
        now = datetime.now(KST)
        h, m, s = int(hhmmss[0:2]), int(hhmmss[2:4]), int(hhmmss[4:6])
        dt = now.replace(hour=h, minute=m, second=s, microsecond=0)
        return int(dt.timestamp() * 1000)
    except Exception:
        return kst_now_ms()


async def fetch_approval_key(cfg: Settings) -> str:
    """웹소켓 접속용 approval_key 발급."""
    url = f"{cfg.rest_base}/oauth2/Approval"
    payload = {
        "grant_type": "client_credentials",
        "appkey": cfg.app_key,
        "secretkey": cfg.app_secret,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
    key = data.get("approval_key")
    if not key:
        raise RuntimeError(f"KIS approval 실패: {data}")
    return key


def build_subscribe(approval_key: str, tr_id: str, tr_key: str,
                    register: bool = True) -> str:
    return json.dumps({
        "header": {
            "approval_key": approval_key,
            "custtype": "P",
            "tr_type": "1" if register else "2",
            "content-type": "utf-8",
        },
        "body": {"input": {"tr_id": tr_id, "tr_key": tr_key}},
    })


# --------------------------------------------------------------- realtime parse
def parse_trade(fields: list[str]) -> dict[str, Any] | None:
    """H0STCNT0 한 레코드 파싱 → tick dict (session_date 제외)."""
    try:
        code = fields[0]
        hhmmss = fields[1]
        price = float(fields[2])
        volume = int(fields[12])          # CNTG_VOL 체결 거래량
        acc_vol = int(fields[13])         # ACML_VOL 누적 거래량
        acc_amount = float(fields[14])    # ACML_TR_PBMN 누적 거래대금
        strength = float(fields[18] or 0)  # CTTR 체결강도
        ccld = fields[21] if len(fields) > 21 else ""  # CCLD_DVSN
        side = "buy" if ccld == "1" else "sell" if ccld == "5" else "neutral"
        return {
            "ts": _ts_from_hhmmss(hhmmss),
            "code": code,
            "price": price,
            "volume": volume,
            "side": side,
            "amount": price * volume,
            "acc_vol": acc_vol,
            "acc_amount": acc_amount,
            "strength": strength,
        }
    except (IndexError, ValueError):
        return None


def parse_quote(fields: list[str]) -> dict[str, Any] | None:
    """H0STASP0 한 레코드 파싱 → quote dict (session_date 제외)."""
    try:
        code = fields[0]
        hhmmss = fields[1]
        # idx 3..12 매도호가1..10, 13..22 매수호가1..10
        ask_p = [float(fields[3 + i] or 0) for i in range(10)]
        bid_p = [float(fields[13 + i] or 0) for i in range(10)]
        # idx 23..32 매도잔량, 33..42 매수잔량
        ask_s = [int(float(fields[23 + i] or 0)) for i in range(10)]
        bid_s = [int(float(fields[33 + i] or 0)) for i in range(10)]
        total_ask = int(float(fields[43] or 0)) if len(fields) > 43 else sum(ask_s)
        total_bid = int(float(fields[44] or 0)) if len(fields) > 44 else sum(bid_s)
        return {
            "ts": _ts_from_hhmmss(hhmmss),
            "code": code,
            "ask_prices": ask_p,
            "ask_sizes": ask_s,
            "bid_prices": bid_p,
            "bid_sizes": bid_s,
            "total_ask": total_ask,
            "total_bid": total_bid,
        }
    except (IndexError, ValueError):
        return None


# 각 TR 레코드의 필드 수 (다중 레코드 분리에 사용)
_FIELD_COUNT = {TR_TRADE: 46, TR_QUOTE: 59}


def parse_realtime(raw: str):
    """웹소켓 실시간 프레임 파싱.

    반환: (kind, [record dict...]) — kind 는 'trade' | 'quote' | None
    형식: `{encrypt}|{tr_id}|{count}|{data}` , data 필드는 '^' 구분.
    """
    parts = raw.split("|", 3)
    if len(parts) < 4:
        return None, []
    tr_id = parts[1]
    try:
        count = int(parts[2])
    except ValueError:
        count = 1
    body = parts[3]
    fields = body.split("^")
    fc = _FIELD_COUNT.get(tr_id)
    records: list[dict] = []
    if tr_id == TR_TRADE:
        n = fc or (len(fields) // max(count, 1))
        for i in range(count):
            rec = parse_trade(fields[i * n:(i + 1) * n])
            if rec:
                records.append(rec)
        return "trade", records
    if tr_id == TR_QUOTE:
        n = fc or len(fields)
        for i in range(max(count, 1)):
            rec = parse_quote(fields[i * n:(i + 1) * n])
            if rec:
                records.append(rec)
        return "quote", records
    return None, []
