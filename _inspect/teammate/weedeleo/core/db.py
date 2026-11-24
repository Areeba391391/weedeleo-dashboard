"""SQLite + log-file storage (thread safe)."""
import csv, io, json, logging, os, sqlite3, threading, time
import config

os.makedirs(config.LOG_DIR, exist_ok=True)
_lock = threading.Lock()
_conn = sqlite3.connect(os.path.join(config.LOG_DIR, "weedeleo.db"), check_same_thread=False)
_conn.executescript("""
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, run_id INTEGER,
  level TEXT, type TEXT, message TEXT, data_json TEXT);
CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY AUTOINCREMENT, started_at REAL, ended_at REAL,
  mode TEXT, area_json TEXT);""")
_log = logging.getLogger("weedeleo")
_log.setLevel(logging.INFO)
if not _log.handlers:
    _h = logging.FileHandler(os.path.join(config.LOG_DIR, time.strftime("weedeleo-%Y%m%d-%H%M%S.log")))
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    _log.addHandler(_h)


def log(level, typ, msg, data=None, run_id=None):
    with _lock:
        _conn.execute("INSERT INTO events(ts,run_id,level,type,message,data_json) VALUES(?,?,?,?,?,?)",
                      (time.time(), run_id, level, typ, msg, json.dumps(data or {})))
        _conn.commit()
    _log.log(getattr(logging, level.upper(), logging.INFO), "[%s] %s", typ, msg)


def recent(limit=200, level="", q=""):
    sql, args = "SELECT ts,level,type,message FROM events WHERE 1=1", []
    if level:
        sql += " AND level=?"; args.append(level)
    if q:
        sql += " AND (message LIKE ? OR type LIKE ?)"; args += [f"%{q}%"] * 2
    try:
        lim = max(1, min(int(limit), 1000))
    except (TypeError, ValueError):
        lim = 200
    sql += " ORDER BY id DESC LIMIT ?"; args.append(lim)
    with _lock:
        rows = _conn.execute(sql, args).fetchall()
    return [dict(ts=r[0], level=r[1], type=r[2], message=r[3]) for r in rows]


def export_csv():
    with _lock:
        rows = _conn.execute("SELECT id,ts,run_id,level,type,message FROM events ORDER BY id").fetchall()
    out = io.StringIO(); w = csv.writer(out)
    w.writerow(["id", "timestamp", "run_id", "level", "type", "message"])
    for r in rows:
        w.writerow([r[0], time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r[1])), *r[2:]])
    return out.getvalue()


def start_run(mode, area):
    with _lock:
        cur = _conn.execute("INSERT INTO runs(started_at,mode,area_json) VALUES(?,?,?)",
                            (time.time(), mode, json.dumps(area)))
        _conn.commit(); return cur.lastrowid


def end_run(run_id):
    if run_id:
        with _lock:
            _conn.execute("UPDATE runs SET ended_at=? WHERE id=?", (time.time(), run_id)); _conn.commit()
