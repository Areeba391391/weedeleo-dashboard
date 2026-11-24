from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import db
from .config import settings


def session_events(session_id: str) -> list[dict[str, Any]]:
    return [e for e in db.list_events(limit=5000) if e.get("session_id") == session_id]


def build_csv_report(session_id: str) -> bytes:
    session = db.get_session(session_id)
    if not session:
        raise FileNotFoundError("Session not found")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["WEEDELEO Task Report"])
    w.writerow(["Project", "WEEDELEO — Vision-Guided Weed Detection"])
    w.writerow(["Session ID", session_id])
    w.writerow(["Started", session.get("started_at")])
    w.writerow(["Ended", session.get("ended_at") or ""])
    w.writerow(["Mode", session.get("mode")])
    w.writerow(["Status", session.get("status")])
    w.writerow([])
    w.writerow(["Metric", "Value"])
    stats = session.get("stats") or {}
    for k, v in stats.items():
        w.writerow([k, v])
    w.writerow([])
    w.writerow(["Timestamp", "Severity", "Type", "Description", "Target ID"])
    for e in session_events(session_id):
        w.writerow([e["ts"], e["severity"], e["event_type"], e["description"], e.get("target_id") or ""])
    return buf.getvalue().encode("utf-8")


def build_pdf_report(session_id: str) -> Path:
    session = db.get_session(session_id)
    if not session:
        raise FileNotFoundError("Session not found")
    out = settings.reports_dir / f"{session_id}.pdf"
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(out), pagesize=A4)
    story = []
    story.append(Paragraph("WEEDELEO Task Report", styles["Title"]))
    story.append(Paragraph("Vision-Guided Weed Detection and Precision Laser-Treatment System", styles["Normal"]))
    story.append(Spacer(1, 12))
    stats = session.get("stats") or {}
    meta = [
        ["Session ID", session_id],
        ["Started", str(session.get("started_at"))],
        ["Ended", str(session.get("ended_at") or "—")],
        ["Input mode", str(session.get("mode"))],
        ["Status", str(session.get("status"))],
        ["Total detections", str(stats.get("total", "—"))],
        ["Weed detections", str(stats.get("weeds", "—"))],
        ["Non-weed detections", str(stats.get("non_weeds", "—"))],
        ["Treated (completed only)", str(stats.get("treated", "—"))],
        ["Skipped", str(stats.get("skipped", "—"))],
        ["FPS (last)", str(stats.get("fps", "—"))],
    ]
    t = Table(meta, colWidths=[200, 300])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.Color(0.12, 0.22, 0.16)),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.whitesmoke),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 16))
    story.append(
        Paragraph(
            "Treatment states are recorded as commanded / acknowledged / completed / verified. "
            "A commanded or acknowledged target is not claimed as successfully treated.",
            styles["Italic"],
        )
    )
    story.append(Spacer(1, 12))
    story.append(Paragraph("Session Events", styles["Heading2"]))
    rows = [["Time", "Severity", "Type", "Description"]]
    for e in session_events(session_id)[:80]:
        rows.append([e["ts"][11:19], e["severity"], e["event_type"], e["description"][:80]])
    if len(rows) == 1:
        rows.append(["—", "—", "—", "No events"])
    et = Table(rows, colWidths=[70, 60, 110, 260])
    et.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.18, 0.35, 0.24)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(et)
    doc.build(story)
    return out
