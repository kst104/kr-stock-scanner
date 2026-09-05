"""분석 로직 — CVD, 거래대금 프로파일, 흡수/스탑런 탐지, 테마 자금흐름.

모든 마커는 데이터 기반 추정치(근사)이며 정확성을 보장하지 않습니다.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from .storage import store
from .themes import load_themes, theme_of


def signed_volume(t: dict) -> int:
    v = int(t.get("volume", 0))
    side = t.get("side")
    if side == "buy":
        return v
    if side == "sell":
        return -v
    return 0


def cvd_series(code: str, date: str, bucket_ms: int = 5_000) -> list[dict]:
    """누적 델타 거래량(CVD) 시계열. bucket_ms 간격으로 표본화."""
    ticks = store.ticks(code, date)
    out: list[dict] = []
    cvd = 0
    last_bucket = None
    for t in ticks:
        cvd += signed_volume(t)
        b = (t["ts"] // bucket_ms) * bucket_ms
        if b != last_bucket:
            out.append({"ts": b, "cvd": cvd, "price": t["price"]})
            last_bucket = b
        else:
            out[-1] = {"ts": b, "cvd": cvd, "price": t["price"]}
    return out


def turnover_profile(code: str, date: str, buckets: int = 60) -> dict[str, Any]:
    """거래대금 프로파일 — 가격대별 매수/매도 거래대금 (volume profile)."""
    ticks = store.ticks(code, date)
    if not ticks:
        return {"levels": [], "poc": None, "lo": None, "hi": None}
    prices = [t["price"] for t in ticks]
    lo, hi = min(prices), max(prices)
    if hi <= lo:
        hi = lo + 1
    step = (hi - lo) / buckets
    buy = defaultdict(float)
    sell = defaultdict(float)
    for t in ticks:
        idx = min(int((t["price"] - lo) / step), buckets - 1)
        if t["side"] == "sell":
            sell[idx] += t["amount"]
        else:
            buy[idx] += t["amount"]
    levels = []
    poc_idx, poc_val = None, -1.0
    for i in range(buckets):
        total = buy[i] + sell[i]
        levels.append({
            "price": round(lo + step * (i + 0.5), 2),
            "buy": round(buy[i], 0),
            "sell": round(sell[i], 0),
            "total": round(total, 0),
        })
        if total > poc_val:
            poc_val, poc_idx = total, i
    poc = levels[poc_idx]["price"] if poc_idx is not None else None
    return {"levels": levels, "poc": poc, "lo": lo, "hi": hi}


def theme_flow(date: str, symbols: list[dict]) -> list[dict]:
    """테마별 순매수 자금흐름(거래대금) 집계."""
    themes = load_themes()
    agg: dict[str, dict[str, float]] = defaultdict(
        lambda: {"buy": 0.0, "sell": 0.0, "net": 0.0, "codes": set()})  # type: ignore
    codes = [s["code"] for s in symbols]
    for code in codes:
        name = theme_of(code, themes)
        for t in store.ticks(code, date):
            if t["side"] == "sell":
                agg[name]["sell"] += t["amount"]
                agg[name]["net"] -= t["amount"]
            elif t["side"] == "buy":
                agg[name]["buy"] += t["amount"]
                agg[name]["net"] += t["amount"]
            agg[name]["codes"].add(code)  # type: ignore
    out = []
    for name, v in agg.items():
        out.append({
            "theme": name,
            "buy": round(v["buy"], 0),
            "sell": round(v["sell"], 0),
            "net": round(v["net"], 0),
            "symbols": len(v["codes"]),  # type: ignore
        })
    out.sort(key=lambda x: x["net"], reverse=True)
    return out


def market_flow_series(date: str, symbols: list[dict],
                       bucket_ms: int = 60_000) -> dict[str, Any]:
    """전 종목 합산 매수/매도 거래대금 — 하루 전체를 bucket 간격으로 누적.

    테마 종합 화면의 '하루종일 매수·매도 그래프'용. 각 포인트는 해당 버킷의
    매수/매도 거래대금과, 장 시작부터의 누적(cum_buy/cum_sell)을 함께 담는다.
    """
    codes = [s["code"] for s in symbols]
    buckets: dict[int, dict[str, float]] = {}
    for code in codes:
        for t in store.ticks(code, date):
            b = (int(t["ts"]) // bucket_ms) * bucket_ms
            slot = buckets.setdefault(b, {"buy": 0.0, "sell": 0.0})
            if t["side"] == "sell":
                slot["sell"] += t["amount"]
            elif t["side"] == "buy":
                slot["buy"] += t["amount"]
    points: list[dict] = []
    cum_buy = cum_sell = 0.0
    for b in sorted(buckets):
        cum_buy += buckets[b]["buy"]
        cum_sell += buckets[b]["sell"]
        points.append({
            "ts": b,
            "buy": round(buckets[b]["buy"], 0),
            "sell": round(buckets[b]["sell"], 0),
            "cum_buy": round(cum_buy, 0),
            "cum_sell": round(cum_sell, 0),
        })
    return {"bucket_ms": bucket_ms, "points": points}


# --------------------------------------------------------------------- markers
def detect_events(code: str, date: str, session_date: str | None = None) -> list[dict]:
    """흡수(absorption) / 스탑런(stop-run) / 급증(surge) 근사 탐지.

    - 흡수: 큰 거래량이 체결되는데 가격이 거의 움직이지 않음(벽에서 물량 소화).
    - 스탑런: 직전 고/저를 짧게 돌파한 뒤 되돌림(스탑 사냥 근사).
    - 급증: 짧은 구간 거래대금이 평소 대비 급증.
    """
    ticks = store.ticks(code, date)
    if len(ticks) < 30:
        return []
    session_date = session_date or date
    events: list[dict] = []

    window = 20
    vols = [t["volume"] for t in ticks]
    amts = [t["amount"] for t in ticks]
    avg_amt = (sum(amts) / len(amts)) or 1.0

    for i in range(window, len(ticks)):
        seg = ticks[i - window:i]
        seg_vol = sum(s["volume"] for s in seg)
        p_lo = min(s["price"] for s in seg)
        p_hi = max(s["price"] for s in seg)
        rng = p_hi - p_lo
        mid = (p_hi + p_lo) / 2 or 1.0
        t = ticks[i]

        # 흡수: 큰 물량 + 좁은 가격범위(<0.15%)
        if seg_vol > 6 * (sum(vols) / len(vols)) and rng / mid < 0.0015:
            side = "sell" if sum(signed_volume(s) for s in seg) < 0 else "buy"
            events.append({
                "ts": t["ts"], "session_date": session_date, "code": code,
                "kind": "absorption", "price": t["price"],
                "meta": {"seg_vol": seg_vol, "side": side, "range_bp": round(rng / mid * 1e4, 1)},
            })

        # 스탑런: 직전 20틱 고점 돌파 후 즉시 되돌림
        prev_hi = max(s["price"] for s in ticks[max(0, i - window - 5):i - 1])
        if t["price"] > prev_hi and i + 3 < len(ticks):
            fwd = ticks[i + 1:i + 4]
            if fwd and min(s["price"] for s in fwd) < prev_hi:
                events.append({
                    "ts": t["ts"], "session_date": session_date, "code": code,
                    "kind": "stoprun", "price": t["price"],
                    "meta": {"broke": round(prev_hi, 2), "dir": "up"},
                })

        # 급증: 단일 체결 거래대금이 평균의 25배 이상
        if t["amount"] > 25 * avg_amt:
            events.append({
                "ts": t["ts"], "session_date": session_date, "code": code,
                "kind": "surge", "price": t["price"],
                "meta": {"amount": round(t["amount"], 0), "x": round(t["amount"] / avg_amt, 1)},
            })

    # 근접 중복 제거(같은 종류 5초 이내)
    dedup: list[dict] = []
    seen: dict[tuple[str, str], int] = {}
    for e in sorted(events, key=lambda x: x["ts"]):
        key = (e["code"], e["kind"])
        if key in seen and e["ts"] - seen[key] < 5000:
            continue
        seen[key] = e["ts"]
        dedup.append(e)
    return dedup
