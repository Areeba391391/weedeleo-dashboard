from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from .config import settings

_lock = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(settings.db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


@contextmanager
def db_cursor() -> Iterator[sqlite3.Cursor]:
    with _lock:
        conn = get_connection()
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db() -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    with db_cursor() as cur:
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                stats TEXT DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                severity TEXT NOT NULL,
                event_type TEXT NOT NULL,
                description TEXT NOT NULL,
                session_id TEXT,
                target_id INTEGER,
                meta TEXT
            );

            CREATE TABLE IF NOT EXISTS detections_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                session_id TEXT,
                detection_id INTEGER,
                class_name TEXT,
                confidence REAL,
                x1 REAL, y1 REAL, x2 REAL, y2 REAL,
                cx REAL, cy REAL,
                inside_workspace INTEGER,
                status TEXT
            );

            CREATE TABLE IF NOT EXISTS calibration (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                points TEXT NOT NULL,
                valid INTEGER NOT NULL,
                rms_error REAL,
                note TEXT
            );

            CREATE TABLE IF NOT EXISTS settings_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS working_area (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                x REAL, y REAL, w REAL, h REAL,
                active INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
            CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
            CREATE INDEX IF NOT EXISTS idx_detections_ts ON detections_log(ts);
            """
        )
        # Soft migrations for richer weed/crop logging
        for stmt in (
            "ALTER TABLE detections_log ADD COLUMN role TEXT",
            "ALTER TABLE detections_log ADD COLUMN action TEXT",
        ):
            try:
                cur.execute(stmt)
            except sqlite3.OperationalError:
                pass


def log_event(
    event_type: str,
    description: str,
    severity: str = "info",
    session_id: Optional[str] = None,
    target_id: Optional[int] = None,
    meta: Optional[dict[str, Any]] = None,
) -> int:
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO events (ts, severity, event_type, description, session_id, target_id, meta)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _utc_now(),
                severity,
                event_type,
                description,
                session_id,
                target_id,
                json.dumps(meta or {}),
            ),
        )
        return int(cur.lastrowid)


def get_setting(key: str, default: Any = None) -> Any:
    with db_cursor() as cur:
        cur.execute("SELECT value FROM settings_kv WHERE key = ?", (key,))
        row = cur.fetchone()
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return row["value"]


def set_setting(key: str, value: Any) -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO settings_kv (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, json.dumps(value)),
        )


def save_working_area(area: Optional[dict[str, Any]]) -> None:
    with db_cursor() as cur:
        if not area:
            cur.execute("DELETE FROM working_area WHERE id = 1")
            return
        cur.execute(
            """
            INSERT INTO working_area (id, x, y, w, h, active)
            VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              x=excluded.x, y=excluded.y, w=excluded.w, h=excluded.h, active=excluded.active
            """,
            (
                area["x"],
                area["y"],
                area["w"],
                area["h"],
                1 if area.get("active", True) else 0,
            ),
        )


def load_working_area() -> Optional[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT * FROM working_area WHERE id = 1")
        row = cur.fetchone()
        if not row or not row["active"]:
            return None
        return {
            "x": row["x"],
            "y": row["y"],
            "w": row["w"],
            "h": row["h"],
            "active": bool(row["active"]),
        }


def save_calibration(points: list[dict], valid: bool, rms: Optional[float], note: str = "") -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO calibration (created_at, points, valid, rms_error, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (_utc_now(), json.dumps(points), 1 if valid else 0, rms, note),
        )


def list_events(
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if severity:
        clauses.append("severity = ?")
        params.append(severity)
    if event_type:
        clauses.append("event_type = ?")
        params.append(event_type)
    if q:
        clauses.append("(description LIKE ? OR event_type LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with db_cursor() as cur:
        cur.execute(
            f"""
            SELECT * FROM events {where}
            ORDER BY id DESC LIMIT ?
            """,
            (*params, limit),
        )
        rows = cur.fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "ts": r["ts"],
                "severity": r["severity"],
                "event_type": r["event_type"],
                "description": r["description"],
                "session_id": r["session_id"],
                "target_id": r["target_id"],
                "meta": json.loads(r["meta"] or "{}"),
            }
        )
    return out


def create_session(session_id: str, mode: str) -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO sessions (id, started_at, mode, status, stats)
            VALUES (?, ?, ?, 'active', '{}')
            """,
            (session_id, _utc_now(), mode),
        )


def end_session(session_id: str, stats: dict[str, Any], status: str = "completed") -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE sessions SET ended_at = ?, status = ?, stats = ? WHERE id = ?
            """,
            (_utc_now(), status, json.dumps(stats), session_id),
        )


def list_sessions(limit: int = 50) -> list[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?", (limit,))
        rows = cur.fetchall()
    return [
        {
            "id": r["id"],
            "started_at": r["started_at"],
            "ended_at": r["ended_at"],
            "mode": r["mode"],
            "status": r["status"],
            "stats": json.loads(r["stats"] or "{}"),
        }
        for r in rows
    ]


def get_session(session_id: str) -> Optional[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        r = cur.fetchone()
    if not r:
        return None
    return {
        "id": r["id"],
        "started_at": r["started_at"],
        "ended_at": r["ended_at"],
        "mode": r["mode"],
        "status": r["status"],
        "stats": json.loads(r["stats"] or "{}"),
    }


def log_detection_row(session_id: Optional[str], det: dict[str, Any]) -> None:
    role = det.get("role")
    if not role:
        role = "weed" if det.get("treatable") or str(det.get("class_name", "")).lower().find("weed") >= 0 else "crop"
    status = det.get("status", "detected")
    action = det.get("action") or status
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO detections_log
            (ts, session_id, detection_id, class_name, confidence, x1, y1, x2, y2, cx, cy, inside_workspace, status, role, action)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _utc_now(),
                session_id,
                det.get("id"),
                det.get("class_name"),
                det.get("confidence"),
                det.get("x1"),
                det.get("y1"),
                det.get("x2"),
                det.get("y2"),
                det.get("cx"),
                det.get("cy"),
                1 if det.get("inside_workspace") else 0 if det.get("inside_workspace") is not None else None,
                status,
                role,
                action,
            ),
        )


def list_detection_logs(limit: int = 200, role: Optional[str] = None, status: Optional[str] = None) -> list[dict[str, Any]]:
    q = "SELECT * FROM detections_log WHERE 1=1"
    params: list[Any] = []
    if role:
        q += " AND role = ?"
        params.append(role)
    if status:
        q += " AND status = ?"
        params.append(status)
    q += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with db_cursor() as cur:
        cur.execute(q, params)
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def analytics_summary(limit_days: int = 30) -> dict[str, Any]:
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS c FROM detections_log")
        total = cur.fetchone()["c"]
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM detections_log
            WHERE role = 'weed'
               OR status IN ('weed_detected','weed_treated','completed')
               OR lower(class_name) LIKE '%weed%'
               OR lower(class_name) IN ('grass','horseweed','small weed')
            """
        )
        weeds = cur.fetchone()["c"]
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM detections_log
            WHERE role = 'crop' OR status = 'crop_detected'
            """
        )
        non_weeds = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) AS c FROM detections_log WHERE inside_workspace = 1")
        inside = cur.fetchone()["c"]
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM detections_log
            WHERE status IN ('completed','weed_treated') OR action = 'weed_treated'
            """
        )
        treated = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) AS c FROM detections_log WHERE status = 'skipped'")
        skipped = cur.fetchone()["c"]
        cur.execute(
            """
            SELECT substr(ts, 1, 10) AS day,
                   SUM(CASE WHEN role = 'weed' OR status LIKE 'weed%' OR lower(class_name) LIKE '%weed%'
                                 OR lower(class_name) IN ('grass','horseweed','small weed') THEN 1 ELSE 0 END) AS weeds,
                   SUM(CASE WHEN status IN ('completed','weed_treated') OR action = 'weed_treated' THEN 1 ELSE 0 END) AS treated,
                   COUNT(*) AS total
            FROM detections_log
            GROUP BY day
            ORDER BY day DESC
            LIMIT ?
            """,
            (limit_days,),
        )
        trend = [
            {"day": r["day"], "count": r["total"], "weeds": r["weeds"], "treated": r["treated"]}
            for r in cur.fetchall()
        ][::-1]
        cur.execute(
            """
            SELECT
              CASE
                WHEN confidence < 0.4 THEN '0.05-0.40'
                WHEN confidence < 0.6 THEN '0.40-0.60'
                WHEN confidence < 0.8 THEN '0.60-0.80'
                ELSE '0.80-1.00'
              END AS bucket,
              COUNT(*) AS c
            FROM detections_log
            WHERE confidence IS NOT NULL
            GROUP BY bucket
            """
        )
        conf_dist = {r["bucket"]: r["c"] for r in cur.fetchall()}
        cur.execute("SELECT COUNT(*) AS c FROM events WHERE severity IN ('warning','error','critical')")
        safety_events = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) AS c FROM sessions")
        sessions = cur.fetchone()["c"]
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM events
            WHERE event_type IN ('detection_summary','weed_treated','treatment_completion')
            """
        )
        activity_events = cur.fetchone()["c"]
    return {
        "total_detections": total,
        "weed_detections": weeds,
        "non_weed_detections": non_weeds,
        "crop_detections": non_weeds,
        "inside_workspace": inside,
        "treated": treated,
        "weeds_treated": treated,
        "skipped": skipped,
        "sessions": sessions,
        "safety_events": safety_events,
        "activity_events": activity_events,
        "detection_trend": trend,
        "confidence_distribution": conf_dist,
    }
