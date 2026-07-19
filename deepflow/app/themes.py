"""테마 그룹 정의 — 테마 자금흐름(테마 종합) 집계에 사용.

종목코드 → 테마 매핑. 사용자가 종목을 추가할 때 자동으로 '기타'에 들어가며,
아래 사전에 코드를 추가하면 해당 테마로 분류됩니다. data/themes.json 이 있으면
그 내용으로 덮어씁니다(사용자 편집 가능).
"""
from __future__ import annotations

import json

from .config import DATA_DIR

_DEFAULT_THEMES: dict[str, list[str]] = {
    "반도체": ["005930", "000660", "042700", "240810", "357780"],
    "2차전지": ["373220", "006400", "247540", "066970", "003670"],
    "자동차": ["005380", "000270", "012330", "011210"],
    "인터넷/플랫폼": ["035420", "035720", "323410", "376300"],
    "바이오": ["207940", "068270", "196170", "302440", "091990"],
    "방산": ["012450", "047810", "064350", "042660"],
    "조선": ["009540", "010140", "042660", "010620"],
    "금융": ["105560", "055550", "086790", "316140", "138040"],
    "엔터/미디어": ["352820", "041510", "035900", "122870"],
}

_THEMES_PATH = DATA_DIR / "themes.json"


def load_themes() -> dict[str, list[str]]:
    if _THEMES_PATH.exists():
        try:
            return json.loads(_THEMES_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return dict(_DEFAULT_THEMES)


def theme_of(code: str, themes: dict[str, list[str]] | None = None) -> str:
    themes = themes or load_themes()
    for name, codes in themes.items():
        if code in codes:
            return name
    return "기타"
