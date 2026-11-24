from __future__ import annotations

import asyncio
import csv
import io
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from . import db
from .calibration import calibration_engine
from .config import settings
from .detector import detector
from .hardware import hardware
from .models_schema import (
    CalibrationPoint,
    ConfidenceRequest,
    ModeRequest,
    MoveRequest,
    SettingsUpdate,
    SystemMode,
    TargetCommandRequest,
    VideoSelectRequest,
    WorkingArea,
)
from .reports import build_csv_report, build_pdf_report
from .state import app_state
from .video_pipeline import pipeline
from .ws_manager import ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    app_state.bootstrap()
    try:
        detector.load()
        db.log_event("model_loading", f"Loaded model {detector.model_name}", severity="info")
    except Exception as exc:
        db.log_event("model_loading", f"Model load failed: {exc}", severity="error")
    db.log_event("system_startup", "WEEDELEO control service started")
    broadcast_task = asyncio.create_task(_broadcast_loop())
    yield
    broadcast_task.cancel()
    pipeline.close()
    if app_state.session_id:
        app_state.stop_session(status="interrupted")
    db.log_event("system_shutdown", "WEEDELEO control service stopped")


app = FastAPI(title="WEEDELEO API", version=settings.version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _broadcast_loop() -> None:
    while True:
        try:
            app_state.ws_clients = ws_manager.count
            await ws_manager.broadcast(
                {
                    "type": "state",
                    "payload": app_state.snapshot_dict(),
                    "detections": app_state.detections,
                }
            )
        except Exception:
            pass
        await asyncio.sleep(0.2)


# ---------- System ----------
@app.get("/api/system/status")
def system_status():
    return app_state.snapshot_dict()


@app.post("/api/system/mode")
def set_mode(body: ModeRequest):
    mode = SystemMode(body.mode)
    try:
        app_state.set_mode(mode)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc

    if mode == SystemMode.live:
        ok = pipeline.open_camera()
        if not ok:
            db.log_event("camera_disconnection", "Failed to open camera", severity="warning")
            raise HTTPException(503, "Camera unavailable")
        db.log_event("camera_connection", "Live camera opened")
    elif mode == SystemMode.test_video:
        videos = pipeline.list_videos()
        if videos:
            pipeline.open_video(videos[0])
        else:
            pipeline.close()
            app_state.camera_ok = False
        db.log_event("mode_change", "Entered test video mode — treatment isolated", severity="warning")
    else:
        pipeline.close()
    return app_state.snapshot()


@app.post("/api/system/start")
def system_start():
    if app_state.estop:
        raise HTTPException(400, "Clear emergency stop first")
    if app_state.mode not in (SystemMode.live, SystemMode.test_video, SystemMode.running):
        raise HTTPException(400, "Select Live Camera or Test Video mode first")
    if not app_state.camera_ok and app_state.mode != SystemMode.test_video:
        # Allow start in test if video will be selected; live needs camera
        if app_state.mode == SystemMode.live:
            raise HTTPException(400, "Camera not connected")
    sid = app_state.start_session()
    return {"ok": True, "session_id": sid, "state": app_state.snapshot()}


@app.post("/api/system/stop")
def system_stop():
    app_state.stop_session(status="completed")
    return {"ok": True, "state": app_state.snapshot()}


@app.post("/api/system/reset")
def system_reset():
    app_state.reset_operational_view()
    return {"ok": True, "state": app_state.snapshot()}


@app.post("/api/system/estop")
def system_estop():
    app_state.trigger_estop()
    return {"ok": True, "state": app_state.snapshot()}


@app.post("/api/system/estop/clear")
def system_estop_clear():
    app_state.clear_estop()
    return {"ok": True, "state": app_state.snapshot()}


# ---------- Camera ----------
@app.get("/api/camera/status")
def camera_status():
    return {
        "connected": app_state.camera_ok,
        "source": app_state.video_source,
        "kind": pipeline.source_kind,
        "frame_width": app_state.frame_width,
        "frame_height": app_state.frame_height,
    }


@app.get("/api/camera/stream")
def camera_stream():
    boundary = "frame"

    def gen():
        while True:
            jpeg = pipeline.get_jpeg()
            if jpeg:
                yield (
                    b"--" + boundary.encode() + b"\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            else:
                # placeholder dark frame
                import numpy as np
                import cv2

                img = np.zeros((360, 640, 3), dtype=np.uint8)
                cv2.putText(img, "NO SIGNAL", (220, 180), cv2.FONT_HERSHEY_SIMPLEX, 1, (80, 80, 80), 2)
                ok, buf = cv2.imencode(".jpg", img)
                if ok:
                    yield (
                        b"--" + boundary.encode() + b"\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
                    )
            import time

            time.sleep(1 / max(1, settings.target_fps))

    return StreamingResponse(gen(), media_type=f"multipart/x-mixed-replace; boundary={boundary}")


@app.post("/api/detection/image")
async def detect_image(file: UploadFile = File(...)):
    """Run YOLO on an uploaded still image (jpg/png/webp). Logs weeds/crops to SQLite."""
    import base64
    import cv2
    import numpy as np

    if not file.filename:
        raise HTTPException(400, "No filename")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(400, "Could not decode image. Use JPG, PNG, or WEBP.")
    if not detector.loaded:
        raise HTTPException(503, "Model not loaded")

    dets = detector.infer(frame)
    enriched = app_state.apply_workspace_to_detections(dets)
    weeds = [d for d in enriched if d.get("role") == "weed" or d.get("treatable")]
    crops = [d for d in enriched if not (d.get("role") == "weed" or d.get("treatable"))]

    safe_name = Path(file.filename).name
    # Keep a copy so uploaded stills appear in the sample/image library
    try:
        dest = settings.image_upload_dir / safe_name
        dest.write_bytes(raw)
    except OSError:
        pass

    # Persist image detection as a timed log entry
    db.log_event(
        "image_detection",
        f"Image scan: {len(weeds)} weed(s), {len(crops)} crop(s) from {safe_name}",
        session_id=app_state.session_id,
        meta={"filename": safe_name, "weeds": len(weeds), "crops": len(crops)},
    )
    for d in enriched:
        row = dict(d)
        row["status"] = "weed_detected" if (d.get("role") == "weed" or d.get("treatable")) else "crop_detected"
        row["role"] = d.get("role") or ("weed" if d.get("treatable") else "crop")
        db.log_detection_row(app_state.session_id, row)

    annotated = frame.copy()
    for d in enriched:
        x1, y1, x2, y2 = int(d["x1"]), int(d["y1"]), int(d["x2"]), int(d["y2"])
        weed = d.get("role") == "weed" or d.get("treatable")
        color = (40, 90, 220) if weed else (60, 180, 75)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{d.get('class_name')} {d.get('confidence', 0):.0%}"
        cv2.putText(annotated, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

    ok, buf = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise HTTPException(500, "Failed to encode annotated image")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    return {
        "ok": True,
        "filename": safe_name,
        "detections": enriched,
        "weeds": len(weeds),
        "crops": len(crops),
        "inference_ms": detector.inference_ms,
        "annotated_jpeg_base64": b64,
    }


@app.post("/api/camera/video/upload")
async def upload_video(file: UploadFile = File(...), auto_select: bool = True):
    if not file.filename:
        raise HTTPException(400, "No filename")
    safe = Path(file.filename).name
    dest = settings.upload_dir / safe
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    db.log_event("video_upload", f"Uploaded {dest.name}")
    selected = None
    if auto_select:
        app_state.set_mode(SystemMode.test_video)
        if pipeline.open_video(dest.name):
            selected = dest.name
            db.log_event("mode_change", f"Test video selected: {dest.name}", severity="info")
    return {
        "ok": True,
        "filename": dest.name,
        "selected": selected,
        "videos": _video_catalog(),
        "state": app_state.snapshot_dict(),
    }


@app.post("/api/camera/video/upload-many")
async def upload_videos(files: list[UploadFile] = File(...)):
    saved: list[str] = []
    for file in files:
        if not file.filename:
            continue
        safe = Path(file.filename).name
        dest = settings.upload_dir / safe
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        saved.append(dest.name)
        db.log_event("video_upload", f"Uploaded {dest.name}")
    selected = None
    if saved:
        app_state.set_mode(SystemMode.test_video)
        if pipeline.open_video(saved[-1]):
            selected = saved[-1]
    return {
        "ok": True,
        "uploaded": saved,
        "selected": selected,
        "videos": _video_catalog(),
        "state": app_state.snapshot_dict(),
    }


def _video_catalog() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for name in pipeline.list_videos():
        path = settings.upload_dir / name
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        out.append(
            {
                "filename": name,
                "size_bytes": size,
                "active": app_state.video_source == name,
            }
        )
    return out


@app.get("/api/camera/videos")
def list_videos():
    return {
        "videos": pipeline.list_videos(),
        "items": _video_catalog(),
        "active": app_state.video_source if pipeline.source_kind == "video" else None,
    }


def _image_catalog() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    folder = settings.image_upload_dir
    folder.mkdir(parents=True, exist_ok=True)
    for path in sorted(folder.glob("*")):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
            continue
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        out.append({"filename": path.name, "size_bytes": size})
    return out


@app.get("/api/camera/images")
def list_images():
    return {"images": _image_catalog(), "items": _image_catalog()}


@app.get("/api/camera/images/{filename}")
def get_image(filename: str):
    safe = Path(filename).name
    path = settings.image_upload_dir / safe
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(path)


@app.post("/api/detection/image/sample")
def detect_sample_image(body: VideoSelectRequest):
    """Run detection on a packaged sample image by filename."""
    import base64
    import cv2

    filename = Path(body.filename).name
    if not filename:
        raise HTTPException(400, "filename required")
    path = settings.image_upload_dir / filename
    if not path.exists():
        raise HTTPException(404, "Sample image not found")
    frame = cv2.imread(str(path))
    if frame is None:
        raise HTTPException(400, "Could not read sample image")
    if not detector.loaded:
        raise HTTPException(503, "Model not loaded")

    dets = detector.infer(frame)
    enriched = app_state.apply_workspace_to_detections(dets)
    weeds = [d for d in enriched if d.get("role") == "weed" or d.get("treatable")]
    crops = [d for d in enriched if not (d.get("role") == "weed" or d.get("treatable"))]
    db.log_event(
        "image_detection",
        f"Sample image scan: {len(weeds)} weed(s), {len(crops)} crop(s) from {filename}",
        session_id=app_state.session_id,
        meta={"filename": filename, "weeds": len(weeds), "crops": len(crops), "sample": True},
    )
    for d in enriched:
        row = dict(d)
        row["status"] = "weed_detected" if (d.get("role") == "weed" or d.get("treatable")) else "crop_detected"
        row["role"] = d.get("role") or ("weed" if d.get("treatable") else "crop")
        db.log_detection_row(app_state.session_id, row)

    annotated = frame.copy()
    for d in enriched:
        x1, y1, x2, y2 = int(d["x1"]), int(d["y1"]), int(d["x2"]), int(d["y2"])
        weed = d.get("role") == "weed" or d.get("treatable")
        color = (40, 90, 220) if weed else (60, 180, 75)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{d.get('class_name')} {d.get('confidence', 0):.0%}"
        cv2.putText(annotated, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise HTTPException(500, "Failed to encode annotated image")
    return {
        "ok": True,
        "filename": filename,
        "detections": enriched,
        "weeds": len(weeds),
        "crops": len(crops),
        "inference_ms": detector.inference_ms,
        "annotated_jpeg_base64": base64.b64encode(buf.tobytes()).decode("ascii"),
        "preview_url": f"/api/camera/images/{filename}",
    }


@app.post("/api/camera/video/select")
def select_video(body: VideoSelectRequest):
    if app_state.mode not in (SystemMode.test_video, SystemMode.idle):
        app_state.set_mode(SystemMode.test_video)
    else:
        app_state.set_mode(SystemMode.test_video)
    ok = pipeline.open_video(body.filename)
    if not ok:
        raise HTTPException(404, "Video not found or unreadable")
    db.log_event("mode_change", f"Test video selected: {body.filename}", severity="info")
    return {"ok": True, "state": app_state.snapshot_dict(), "videos": _video_catalog()}


# ---------- Detection ----------
@app.get("/api/detection/latest")
def detection_latest():
    return {
        "detections": app_state.detections,
        "fps": detector.fps,
        "frame_width": app_state.frame_width,
        "frame_height": app_state.frame_height,
    }


@app.get("/api/detection/stats")
def detection_stats():
    return {
        **app_state.stats.model_dump(),
        "fps_history": app_state.fps_history[-120:],
    }


@app.post("/api/detection/confidence")
def set_confidence(body: ConfidenceRequest):
    detector.set_confidence(body.threshold)
    db.set_setting("conf_threshold", detector.conf)
    db.log_event("settings_change", f"Confidence threshold set to {detector.conf:.2f}")
    return {"ok": True, "threshold": detector.conf}


# ---------- Workspace ----------
@app.get("/api/workspace/area")
def get_area():
    return {"area": app_state.working_area}


@app.post("/api/workspace/area")
def set_area(area: WorkingArea):
    if area.x + area.w > 1.0001 or area.y + area.h > 1.0001:
        raise HTTPException(400, "Working area exceeds frame bounds")
    app_state.working_area = area
    db.save_working_area(area.model_dump())
    db.log_event("working_area_set", f"Working area set to {area.model_dump()}")
    # Re-tag current detections
    app_state.detections = app_state.apply_workspace_to_detections(app_state.detections)
    return {"ok": True, "area": area}


@app.delete("/api/workspace/area")
def clear_area():
    app_state.working_area = None
    db.save_working_area(None)
    db.log_event("working_area_cleared", "Working area cleared")
    return {"ok": True}


# ---------- Calibration ----------
@app.get("/api/calibration/status")
def calibration_status():
    return calibration_engine.to_state()


@app.post("/api/calibration/points")
def calibration_points(points: list[CalibrationPoint]):
    calibration_engine.set_points(points)
    db.log_event("calibration_points", f"Set {len(points)} calibration points")
    return calibration_engine.to_state()


@app.post("/api/calibration/compute")
def calibration_compute():
    state = calibration_engine.compute()
    db.save_calibration(
        [p.model_dump() for p in state.points],
        state.valid,
        state.rms_error_mm,
        state.note,
    )
    db.log_event(
        "calibration",
        state.note,
        severity="info" if state.valid else "warning",
        meta={"rms_error_mm": state.rms_error_mm, "valid": state.valid},
    )
    return state


@app.delete("/api/calibration")
def calibration_clear():
    calibration_engine.clear()
    db.log_event("calibration", "Calibration cleared", severity="warning")
    return calibration_engine.to_state()


# ---------- Targets ----------
@app.get("/api/targets")
def list_targets():
    return {"targets": app_state.detections, "history": app_state.target_history[-100:]}


@app.get("/api/targets/{target_id}")
def get_target(target_id: int):
    for d in app_state.detections:
        if d["id"] == target_id:
            return d
    for d in app_state.target_history:
        if d.get("id") == target_id:
            return d
    raise HTTPException(404, "Target not found")


@app.post("/api/targets/{target_id}/select")
def select_target(target_id: int):
    found = None
    for d in app_state.detections:
        if d["id"] == target_id:
            d["status"] = "selected"
            found = d
            break
    if not found:
        raise HTTPException(404, "Target not found")
    app_state.selected_target_id = target_id
    db.log_event("target_localisation", f"Selected target #{target_id}", target_id=target_id, session_id=app_state.session_id)
    return found


@app.post("/api/targets/{target_id}/command")
def command_target(target_id: int, body: TargetCommandRequest):
    snap = app_state.snapshot()
    if not snap.safety.treatment_allowed:
        raise HTTPException(
            403,
            {
                "error": "Treatment blocked by safety gate",
                "reasons": snap.safety.reasons,
            },
        )
    if not body.confirm:
        raise HTTPException(400, "confirm=true required")

    target = None
    for d in app_state.detections:
        if d["id"] == target_id:
            target = d
            break
    if not target:
        raise HTTPException(404, "Target not found")
    if not target.get("treatable"):
        target["status"] = "skipped"
        target["skip_reason"] = "Non-weed / not treatable"
        app_state.stats.skipped += 1
        db.log_event("target_skipped", target["skip_reason"], target_id=target_id, session_id=app_state.session_id)
        return target
    if target.get("inside_workspace") is not True:
        target["status"] = "skipped"
        target["skip_reason"] = "Outside working area"
        app_state.stats.skipped += 1
        db.log_event("target_skipped", target["skip_reason"], target_id=target_id, session_id=app_state.session_id)
        return target
    if target.get("workspace_x_mm") is None:
        raise HTTPException(400, "Target not localised — calibration invalid")

    target["status"] = "commanded"
    db.log_event(
        "target_command",
        f"Commanded target #{target_id} → ({target['workspace_x_mm']:.1f}, {target['workspace_y_mm']:.1f}) mm",
        target_id=target_id,
        session_id=app_state.session_id,
    )
    move = hardware.move_to(float(target["workspace_x_mm"]), float(target["workspace_y_mm"]))
    if not move.get("ok"):
        target["status"] = "skipped"
        target["skip_reason"] = f"Move failed: {move.get('error')}"
        app_state.stats.skipped += 1
        db.log_event("target_skipped", target["skip_reason"], severity="error", target_id=target_id, session_id=app_state.session_id)
        return {"target": target, "move": move}

    target["status"] = "acknowledged"
    db.log_event("target_acknowledgement", f"Move acknowledged for #{target_id}", target_id=target_id, session_id=app_state.session_id)

    treat = hardware.treat()
    if treat.get("ok"):
        status = treat.get("status", "acknowledged")
        if status in ("completed", "verified"):
            target["status"] = status
            app_state.record_weed_treated(target, note=status)
        else:
            target["status"] = "acknowledged"
            db.log_event(
                "treatment_completion",
                f"Treatment command acknowledged (not verified) for #{target_id}",
                severity="warning",
                target_id=target_id,
                session_id=app_state.session_id,
            )
            db.log_detection_row(app_state.session_id, target)
    else:
        target["status"] = "skipped"
        target["skip_reason"] = f"Treat failed: {treat.get('error')}"
        app_state.stats.skipped += 1
        db.log_event("target_skipped", target["skip_reason"], severity="error", target_id=target_id, session_id=app_state.session_id)
        db.log_detection_row(app_state.session_id, target)

    app_state.target_history.append(dict(target))
    return {"target": target, "move": move, "treat": treat}


# ---------- Model ----------
@app.get("/api/model")
def model_info():
    return {
        "loaded": detector.loaded,
        "name": detector.model_name,
        "path": str(detector.model_path) if detector.model_path else None,
        "classes": detector.class_names,
        "class_list": list(detector.class_names.values()),
        "weed_classes": sorted(settings.weed_class_names),
        "conf_threshold": detector.conf,
        "imgsz": detector.imgsz,
        "inference_ms": detector.inference_ms,
        "fps": detector.fps,
        "error": detector.load_error,
    }


# ---------- Robot / Laser simulation ----------
@app.get("/api/robot/status")
def robot_status():
    from .devices import robot

    return robot.status()


@app.post("/api/robot/start")
async def robot_start():
    from .devices import robot
    from . import db as _db

    result = await robot.start()
    _db.log_event("robot", "Robot simulation started", severity="info")
    return result


@app.post("/api/robot/stop")
async def robot_stop():
    from .devices import robot
    from . import db as _db

    result = await robot.stop()
    _db.log_event("robot", "Robot simulation stopped", severity="info")
    return result


@app.post("/api/robot/move")
async def robot_move(direction: str):
    from .devices import robot
    from . import db as _db

    if direction not in ("forward", "backward", "left", "right", "stop"):
        raise HTTPException(400, "Invalid direction")
    result = await robot.move(direction)  # type: ignore[arg-type]
    _db.log_event("robot", f"Robot simulation move: {direction}", severity="info")
    return result


@app.get("/api/laser/status")
def laser_status():
    from .devices import laser

    return laser.status()


@app.post("/api/laser/enable")
async def laser_enable():
    from .devices import laser

    return await laser.enable()


@app.post("/api/laser/disable")
async def laser_disable():
    from .devices import laser

    return await laser.disable()


@app.post("/api/laser/test")
async def laser_test():
    """Simulation-only treatment pulse. Never claims physical laser output."""
    from .devices import laser
    from . import db as _db

    snap = app_state.snapshot()
    if snap.mode.value == "test_video":
        raise HTTPException(403, "Test video mode — treatment simulation isolated from live workflow claims")
    result = await laser.fire(100)
    target = next((d for d in app_state.detections if d.get("id") == app_state.selected_target_id), None)
    if target is None:
        target = next((d for d in app_state.detections if d.get("role") == "weed" or d.get("treatable")), None)
    if target:
        app_state.record_weed_treated(dict(target), note="simulated_laser")
    else:
        _db.log_event(
            "laser",
            "SIMULATED TREATMENT event recorded (no weed target in frame)",
            severity="warning",
            session_id=app_state.session_id,
            meta={"simulation": True, "result": result},
        )
    return result


# ---------- Machine (XY / gantry telemetry) ----------
@app.get("/api/machine/status")
def machine_status():
    return hardware.to_state()


@app.post("/api/machine/connect")
def machine_connect():
    return hardware.connect()


@app.post("/api/machine/home")
def machine_home():
    return hardware.home()


@app.post("/api/machine/move")
def machine_move(body: MoveRequest):
    snap = app_state.snapshot()
    if app_state.mode == SystemMode.test_video:
        raise HTTPException(403, "Test video mode — motion/treatment disabled")
    if snap.safety.estop:
        raise HTTPException(403, "Emergency stop active")
    return hardware.move_to(body.x_mm, body.y_mm)


@app.post("/api/machine/simulation")
def machine_simulation(enabled: bool = True):
    hardware.enable_simulation(enabled)
    db.set_setting("hardware_simulation", enabled)
    db.log_event(
        "hardware",
        f"Hardware simulation {'enabled' if enabled else 'disabled'}",
        severity="warning",
    )
    return hardware.to_state()


# ---------- Safety / Pi / Comms ----------
@app.get("/api/safety/status")
def safety_status():
    return app_state.snapshot().safety


@app.post("/api/safety/interlock")
def set_interlock(enclosure_closed: bool = True, interlock_ok: bool = True, fault_active: bool = False):
    """Operator/hardware feedback injection for lab interlocks until GPIO bridge is wired."""
    app_state.enclosure_closed = enclosure_closed
    app_state.interlock_ok = interlock_ok
    app_state.fault_active = fault_active
    db.log_event(
        "interlock_event",
        f"Interlock update enclosure={enclosure_closed} ok={interlock_ok} fault={fault_active}",
        severity="warning" if (not enclosure_closed or not interlock_ok or fault_active) else "info",
    )
    return app_state.snapshot().safety


@app.get("/api/pi/telemetry")
def pi_telemetry():
    return app_state.pi_telemetry()


@app.get("/api/comms/status")
def comms_status():
    return app_state.snapshot().comms


# ---------- Sessions ----------
@app.get("/api/sessions")
def sessions():
    return {"sessions": db.list_sessions()}


@app.get("/api/sessions/{session_id}")
def session_detail(session_id: str):
    s = db.get_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@app.post("/api/sessions/start")
def sessions_start():
    return system_start()


@app.post("/api/sessions/stop")
def sessions_stop():
    return system_stop()


# ---------- Analytics / Logs / Reports / Settings ----------
@app.get("/api/analytics/summary")
def analytics_summary():
    summary = db.analytics_summary()
    summary["fps_history"] = app_state.fps_history[-120:]
    summary["current_fps"] = detector.fps
    summary["session_weeds_seen"] = app_state.session_weeds_seen
    summary["session_crops_seen"] = app_state.session_crops_seen
    summary["session_weeds_treated"] = app_state.session_weeds_treated
    summary["session_id"] = app_state.session_id
    return summary


@app.get("/api/logs")
def get_logs(
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
):
    return {"events": db.list_events(severity=severity, event_type=event_type, q=q, limit=limit)}


@app.get("/api/logs/detections")
def get_detection_logs(
    role: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
):
    return {"detections": db.list_detection_logs(limit=limit, role=role, status=status)}


@app.get("/api/logs/export.csv")
def export_logs_csv(
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    q: Optional[str] = None,
):
    events = db.list_events(severity=severity, event_type=event_type, q=q, limit=5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "ts", "severity", "event_type", "description", "session_id", "target_id"])
    for e in events:
        w.writerow([e["id"], e["ts"], e["severity"], e["event_type"], e["description"], e.get("session_id"), e.get("target_id")])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=weedeleo_events.csv"},
    )


@app.get("/api/reports/{session_id}.csv")
def report_csv(session_id: str):
    try:
        data = build_csv_report(session_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={session_id}.csv"},
    )


@app.get("/api/reports/{session_id}.pdf")
def report_pdf(session_id: str):
    try:
        path = build_pdf_report(session_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(path, media_type="application/pdf", filename=path.name)


@app.get("/api/settings")
def get_settings():
    return {
        "conf_threshold": detector.conf,
        "camera_index": settings.camera_index,
        "mjpeg_quality": settings.mjpeg_quality,
        "workspace_width_mm": settings.workspace_width_mm,
        "workspace_height_mm": settings.workspace_height_mm,
        "pi_base_url": settings.pi_base_url,
        "show_labels": db.get_setting("show_labels", True),
        "show_confidence": db.get_setting("show_confidence", True),
        "show_ids": db.get_setting("show_ids", True),
        "log_detections": db.get_setting("log_detections", True),
        "hardware_simulation": db.get_setting("hardware_simulation", False),
        "theme": db.get_setting("theme", "chlorophyll"),
    }


@app.put("/api/settings")
def put_settings(body: SettingsUpdate):
    if body.conf_threshold is not None:
        detector.set_confidence(body.conf_threshold)
        db.set_setting("conf_threshold", detector.conf)
    if body.camera_index is not None:
        settings.camera_index = body.camera_index
        db.set_setting("camera_index", body.camera_index)
    if body.mjpeg_quality is not None:
        settings.mjpeg_quality = int(body.mjpeg_quality)
    if body.workspace_width_mm is not None:
        settings.workspace_width_mm = float(body.workspace_width_mm)
    if body.workspace_height_mm is not None:
        settings.workspace_height_mm = float(body.workspace_height_mm)
    if body.pi_base_url is not None:
        settings.pi_base_url = body.pi_base_url
        db.set_setting("pi_base_url", body.pi_base_url)
    for key in ("show_labels", "show_confidence", "show_ids", "log_detections", "theme"):
        val = getattr(body, key, None)
        if val is not None:
            db.set_setting(key, val)
    for k, v in (body.extras or {}).items():
        db.set_setting(k, v)
    db.log_event("settings_change", "Settings updated")
    return get_settings()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    app_state.ws_clients = ws_manager.count
    try:
        await websocket.send_json(
            {
                "type": "hello",
                "payload": app_state.snapshot_dict(),
                "detections": app_state.detections,
            }
        )
        while True:
            # Keepalive / client pings
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat", "clients": ws_manager.count})
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket)
        app_state.ws_clients = ws_manager.count


@app.get("/api/health")
def health():
    return {"ok": True, "app": settings.app_name, "model_loaded": detector.loaded}
