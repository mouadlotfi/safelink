import asyncio
import logging
import os
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

COUNTER_KEY = "links_cleaned"
DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "safelink_stats.sqlite3"
DB_PATH = Path(os.environ.get("SAFELINK_STATS_DB", DEFAULT_DB_PATH))

_initialized = False
_init_lock = asyncio.Lock()


def _init_db_sync() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH, timeout=5.0) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stats (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL CHECK (value >= 0)
            )
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO stats (key, value) VALUES (?, 0)",
            (COUNTER_KEY,),
        )
        conn.commit()


def _get_count_sync() -> int:
    with sqlite3.connect(DB_PATH, timeout=5.0) as conn:
        cursor = conn.execute("SELECT value FROM stats WHERE key = ?", (COUNTER_KEY,))
        row = cursor.fetchone()
        return int(row[0]) if row else 0


def _increment_sync(amount: int) -> int:
    with sqlite3.connect(DB_PATH, timeout=5.0) as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "UPDATE stats SET value = value + ? WHERE key = ?",
            (amount, COUNTER_KEY),
        )
        cursor = conn.execute("SELECT value FROM stats WHERE key = ?", (COUNTER_KEY,))
        row = cursor.fetchone()
        conn.commit()
        return int(row[0]) if row else 0


async def init_stats_db() -> None:
    global _initialized
    if _initialized:
        return

    async with _init_lock:
        if _initialized:
            return
        await asyncio.to_thread(_init_db_sync)
        _initialized = True


async def get_links_cleaned_count() -> int:
    await init_stats_db()
    return await asyncio.to_thread(_get_count_sync)


async def increment_links_cleaned(amount: int = 1) -> int:
    if amount <= 0:
        return await get_links_cleaned_count()

    await init_stats_db()
    return await asyncio.to_thread(_increment_sync, amount)
async def record_links_cleaned() -> None:
    try:
        await increment_links_cleaned()
    except Exception:
        logger.exception("Failed to update links-cleaned counter")
