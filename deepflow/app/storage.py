"""SQLite 저장소 — 체결 tick, 호가 snapshot, 이벤트.

로컬 단일 사용자 도구라 단일 커넥션 + Lock 으로 충분합니다. WAL 모드 사용.
데이터는 data/orderflow_ticks.db 에 보존됩니다.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any, Iterable

from .config import DATA_DIR

DB_PATH = DATA_DIR / "orderflow_ticks.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ticks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,          -- epoch millis
    session_date TEXT    NOT NULL,          -- YYYY-MM-DD (KST)
    code         TEXT    NOT NULL,
    price        REAL    NOT NULL,
    volume       INTEGER NOT NULL,          -- 체결 거래량 (주)
    side         TEXT    NOT NULL,          -- buy | sell | neutral
    amount       REAL    NOT NULL,          -- price * volume (거래대금)
    acc_vol      INTEGER DEFAULT 0,
    acc_amount   REAL    DEFAULT 0,
    strength     REAL    DEFAULT 0          -- 체결강도
);
CREATE INDEX IF NOT EXISTS ix_ticks_lookup ON ticks(code, session_date, ts);
CREATE INDEX IF NOT EXISTS ix_ticks_date   ON ticks(session_date, ts);

CREATE TABLE IF NOT EXISTS quotes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    session_date TEXT    NOT NULL,
    code         TEXT    NOT NULL,
    ask_prices   TEXT    NOT NULL,          -- JSON array (호가1..10)
    ask_sizes    TEXT    NOT NULL,
    bid_prices   TEXT    NOT NULL,
    bid_sizes    TEXT    NOT NULL,
    total_ask    INTEGER DEFAULT 0,
    total_bid    INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_quotes_lookup ON quotes(code, session_date, ts);

CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    session_date TEXT    NOT NULL,
    code         TEXT    NOT NULL,
    kind         TEXT    NOT NULL,          -- absorption | stoprun | surge | ...
    price        REAL    DEFAULT 0,
    meta         TEXT    DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_events_lookup ON events(session_date, ts);
"""


class Store:
    def __init__(self, path=DB_PATH):
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA synchronous=NORMAL;")
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # ------------------------------------------------------------------ write
    def insert_tick(self, t: dict[str, Any]) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO ticks(ts,session_date,code,price,volume,side,amount,"
                "acc_vol,acc_amount,strength) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (
                    t["ts"], t["session_date"], t["code"], t["price"], t["volume"],
                    t["side"], t["amount"], t.get("acc_vol", 0),
                    t.get("acc_amount", 0), t.get("strength", 0),
                ),
            )
            self._conn.commit()

    def insert_quote(self, q: dict[str, Any]) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO quotes(ts,session_date,code,ask_prices,ask_sizes,"
                "bid_prices,bid_sizes,total_ask,total_bid) VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    q["ts"], q["session_date"], q["code"],
                    json.dumps(q["ask_prices"]), json.dumps(q["ask_sizes"]),
                    json.dumps(q["bid_prices"]), json.dumps(q["bid_sizes"]),
                    q.get("total_ask", 0), q.get("total_bid", 0),
                ),
            )
            self._conn.commit()

    def insert_event(self, e: dict[str, Any]) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO events(ts,session_date,code,kind,price,meta) "
                "VALUES(?,?,?,?,?,?)",
                (
                    e["ts"], e["session_date"], e["code"], e["kind"],
                    e.get("price", 0), json.dumps(e.get("meta", {})),
                ),
            )
            self._conn.commit()

    # ------------------------------------------------------------------- read
    def _q(self, sql: str, params: Iterable = ()) -> list[dict]:
        with self._lock:
            cur = self._conn.execute(sql, tuple(params))
            return [dict(r) for r in cur.fetchall()]

    def sessions(self) -> list[str]:
        rows = self._q(
            "SELECT DISTINCT session_date FROM ticks ORDER BY session_date DESC"
        )
        return [r["session_date"] for r in rows]

    def ticks(self, code: str | None, date: str, start: int | None = None,
              end: int | None = None, limit: int = 20000) -> list[dict]:
        sql = "SELECT * FROM ticks WHERE session_date=?"
        p: list[Any] = [date]
        if code:
            sql += " AND code=?"
            p.append(code)
        if start is not None:
            sql += " AND ts>=?"
            p.append(start)
        if end is not None:
            sql += " AND ts<=?"
            p.append(end)
        sql += " ORDER BY ts ASC LIMIT ?"
        p.append(limit)
        return self._q(sql, p)

    def large_trades(self, date: str, min_amount: float, code: str | None = None,
                     limit: int = 500) -> list[dict]:
        sql = "SELECT * FROM ticks WHERE session_date=? AND amount>=?"
        p: list[Any] = [date, min_amount]
        if code:
            sql += " AND code=?"
            p.append(code)
        sql += " ORDER BY amount DESC LIMIT ?"
        p.append(limit)
        return self._q(sql, p)

    def quote_at(self, code: str, date: str, at: int | None = None) -> dict | None:
        if at is None:
            rows = self._q(
                "SELECT * FROM quotes WHERE code=? AND session_date=? "
                "ORDER BY ts DESC LIMIT 1", (code, date))
        else:
            rows = self._q(
                "SELECT * FROM quotes WHERE code=? AND session_date=? AND ts<=? "
                "ORDER BY ts DESC LIMIT 1", (code, date, at))
        if not rows:
            return None
        r = rows[0]
        for k in ("ask_prices", "ask_sizes", "bid_prices", "bid_sizes"):
            r[k] = json.loads(r[k])
        return r

    def quotes(self, code: str, date: str, limit: int = 6000) -> list[dict]:
        rows = self._q(
            "SELECT * FROM quotes WHERE code=? AND session_date=? "
            "ORDER BY ts ASC LIMIT ?", (code, date, limit))
        for r in rows:
            for k in ("ask_prices", "ask_sizes", "bid_prices", "bid_sizes"):
                r[k] = json.loads(r[k])
        return rows

    def events(self, date: str, code: str | None = None,
               limit: int = 1000) -> list[dict]:
        sql = "SELECT * FROM events WHERE session_date=?"
        p: list[Any] = [date]
        if code:
            sql += " AND code=?"
            p.append(code)
        sql += " ORDER BY ts DESC LIMIT ?"
        p.append(limit)
        rows = self._q(sql, p)
        for r in rows:
            r["meta"] = json.loads(r["meta"])
        return rows

    def close(self) -> None:
        with self._lock:
            self._conn.close()


store = Store()
