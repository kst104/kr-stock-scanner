"""종목 관리 — data/symbols.json 에 저장.

각 항목: {code, name, quotes} — quotes=True 면 호가(DOM)도 구독.
KIS 실시간 등록 한계(계정당 ~41건: 체결1+호가1 = 각 1칸)를 고려해
기본 체결 다수 + 호가 소수 구성으로 운영합니다.
"""
from __future__ import annotations

import json
import threading

from .config import DATA_DIR

_PATH = DATA_DIR / "symbols.json"
_lock = threading.RLock()

_DEFAULT = [
    {"code": "005930", "name": "삼성전자", "quotes": True},
    {"code": "000660", "name": "SK하이닉스", "quotes": True},
    {"code": "373220", "name": "LG에너지솔루션", "quotes": False},
]

# KIS 등록 한계 (계정/키당). 체결 1칸 + 호가 1칸 합산.
KIS_SLOT_LIMIT = 41


def load() -> list[dict]:
    with _lock:
        if _PATH.exists():
            try:
                return json.loads(_PATH.read_text(encoding="utf-8"))
            except Exception:
                pass
        _PATH.write_text(json.dumps(_DEFAULT, ensure_ascii=False, indent=2),
                         encoding="utf-8")
        return list(_DEFAULT)


def save(items: list[dict]) -> None:
    with _lock:
        norm = []
        seen = set()
        for it in items:
            code = str(it.get("code", "")).strip()
            if not code or code in seen:
                continue
            seen.add(code)
            norm.append({
                "code": code,
                "name": str(it.get("name", "") or code).strip(),
                "quotes": bool(it.get("quotes", False)),
            })
        _PATH.write_text(json.dumps(norm, ensure_ascii=False, indent=2),
                         encoding="utf-8")


def slot_usage(items: list[dict] | None = None) -> dict:
    items = items or load()
    trades = len(items)
    quotes = sum(1 for s in items if s.get("quotes"))
    used = trades + quotes
    return {
        "trades": trades,
        "quotes": quotes,
        "used": used,
        "limit": KIS_SLOT_LIMIT,
        "over": used > KIS_SLOT_LIMIT,
    }
