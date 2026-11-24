from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Optional

import psutil

from . import db
from .calibration import calibration_engine
from .config import settings
from .detector import detector
from .hardware import hardware
from .models_schema import (
    DetectionStats,
    PiTelemetry,
    SystemMode,
    SystemState,
    WorkingArea,
)
from .safety import evaluate_safety


class AppState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.mode = SystemMode.idle
        self.running = False
        self.session_id: Optional[str] = None
        self.session_started_at: Optional[float] = None
        self.estop = False
        self.enclosure_closed = True
        self.interlock_ok = True
        self.fault_active = False
        self.last_safety_event: Optional[str] = None
        self.working_area: Optional[WorkingArea] = None
        self.detections: list[dict[str, Any]] = []
        self.selected_target_id: Optional[int] = None
        self.target_history: list[dict[str, Any]] = []
        self.frame_width = 0
        self.frame_height = 0
        self.camera_ok = False
        self.video_source: Optional[str] = None
        self.stats = DetectionStats()
        self.fps_history: list[dict[str, Any]] = []
        self._process_start = time.time()
        self.ws_clients = 0
        self._last_fps_log = 0.0
        self._last_detection_persist = 0.0
        self.session_weeds_seen = 0
        self.session_crops_seen = 0
        self.session_weeds_treated = 0

    def bootstrap(self) -> None:
        area = db.load_working_area()
        if area:
            self.working_area = WorkingArea(**area)
        conf = db.get_setting("conf_threshold")
        if conf is not None:
            detector.set_confidence(float(conf))
        sim = db.get_setting("hardware_simulation", False)
        if sim:
            hardware.enable_simulation(True)
        pi_url = db.get_setting("pi_base_url")
        if pi_url:
            settings.pi_base_url = str(pi_url)

    def session_duration(self) -> float:
        if not self.session_started_at:
            return 0.0
        return max(0.0, time.time() - self.session_started_at)

    def start_session(self) -> str:
        with self.lock:
            if self.session_id and self.running:
                return self.session_id
            sid = f"SES-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
            self.session_id = sid
            self.session_started_at = time.time()
            self.running = True
            self.session_weeds_seen = 0
            self.session_crops_seen = 0
            self.session_weeds_treated = 0
            if self.mode == SystemMode.live:
                self.mode = SystemMode.running
            db.create_session(sid, self.mode.value)
            db.log_event("session_started", f"Session {sid} started", session_id=sid)
            return sid

    def stop_session(self, status: str = "completed") -> None:
        with self.lock:
            if not self.session_id:
                self.running = False
                return
            stats = self.stats.model_dump()
            db.end_session(self.session_id, stats, status=status)
            db.log_event(
                "session_stopped",
                f"Session {self.session_id} stopped ({status})",
                session_id=self.session_id,
            )
            self.running = False
            if self.mode == SystemMode.running:
                self.mode = SystemMode.live
            self.session_id = None
            self.session_started_at = None

    def reset_operational_view(self) -> None:
        with self.lock:
            self.detections = []
            self.selected_target_id = None
            self.stats = DetectionStats(fps=detector.fps)
            detector.reset_ids()
            db.log_event(
                "system_reset",
                "Operational view reset (history preserved)",
                session_id=self.session_id,
            )

    def trigger_estop(self) -> None:
        with self.lock:
            self.estop = True
            self.mode = SystemMode.estop
            self.running = False
            self.last_safety_event = "Emergency stop activated"
            hardware.emergency_stop()
            db.log_event(
                "emergency_stop",
                "Emergency stop activated",
                severity="critical",
                session_id=self.session_id,
            )

    def clear_estop(self) -> None:
        with self.lock:
            self.estop = False
            self.mode = SystemMode.idle
            self.last_safety_event = "Emergency stop cleared"
            db.log_event(
                "emergency_stop_cleared",
                "Emergency stop cleared by operator",
                severity="warning",
                session_id=self.session_id,
            )

    def set_mode(self, mode: SystemMode) -> None:
        with self.lock:
            if self.estop and mode != SystemMode.idle:
                raise RuntimeError("Clear emergency stop before changing mode")
            prev = self.mode
            self.mode = mode
            db.log_event(
                "mode_change",
                f"Mode changed {prev.value} → {mode.value}",
                session_id=self.session_id,
                meta={"from": prev.value, "to": mode.value},
            )

    def apply_workspace_to_detections(self, dets: list[dict[str, Any]]) -> list[dict[str, Any]]:
        area = self.working_area
        fw, fh = max(1, self.frame_width), max(1, self.frame_height)
        out = []
        for d in dets:
            item = dict(d)
            if area and area.active:
                ax1, ay1 = area.x * fw, area.y * fh
                ax2, ay2 = (area.x + area.w) * fw, (area.y + area.h) * fh
                inside = ax1 <= item["cx"] <= ax2 and ay1 <= item["cy"] <= ay2
                item["inside_workspace"] = inside
            else:
                item["inside_workspace"] = None
            mapped = calibration_engine.transform(item["cx"], item["cy"])
            if mapped is None:
                item["workspace_x_mm"] = None
                item["workspace_y_mm"] = None
            else:
                item["workspace_x_mm"], item["workspace_y_mm"] = mapped
                if item.get("status") == "detected" and item.get("treatable"):
                    item["status"] = "localised" if calibration_engine.valid else item["status"]
            out.append(item)
        return out

    def update_detections(self, dets: list[dict[str, Any]]) -> None:
        with self.lock:
            enriched = self.apply_workspace_to_detections(dets)
            self.detections = enriched
            weeds = sum(1 for d in enriched if d.get("role") == "weed" or d.get("treatable"))
            crops = sum(1 for d in enriched if d.get("role") == "crop" or not d.get("treatable"))
            inside = sum(1 for d in enriched if d.get("inside_workspace") is True and (d.get("role") == "weed" or d.get("treatable")))
            self.stats.total += len(enriched)
            self.stats.weeds += weeds
            self.stats.non_weeds += crops
            self.stats.inside_workspace += inside
            self.stats.fps = detector.fps
            self.stats.session_detections += len(enriched)
            self.session_weeds_seen += weeds
            self.session_crops_seen += crops
            now = time.time()
            if now - self._last_fps_log >= 1.0:
                self.fps_history.append({"t": now, "fps": float(detector.fps)})
                if len(self.fps_history) > 300:
                    self.fps_history = self.fps_history[-300:]
                self._last_fps_log = now
            # Persist timed detection logs (not every frame — keeps SQLite healthy)
            if db.get_setting("log_detections", True) and now - self._last_detection_persist >= 2.0:
                self._last_detection_persist = now
                db.log_event(
                    "detection_summary",
                    f"Detected {weeds} weed(s) and {crops} crop(s) in frame",
                    session_id=self.session_id,
                    meta={
                        "weeds": weeds,
                        "crops": crops,
                        "total": len(enriched),
                        "session_weeds_seen": self.session_weeds_seen,
                        "session_crops_seen": self.session_crops_seen,
                        "session_weeds_treated": self.session_weeds_treated,
                    },
                )
                for d in enriched:
                    row = dict(d)
                    row["status"] = "weed_detected" if (d.get("role") == "weed" or d.get("treatable")) else "crop_detected"
                    row["role"] = d.get("role") or ("weed" if d.get("treatable") else "crop")
                    db.log_detection_row(self.session_id, row)

    def record_weed_treated(self, target: dict[str, Any], note: str = "treated") -> None:
        with self.lock:
            self.session_weeds_treated += 1
            self.stats.treated += 1
        row = dict(target)
        row["status"] = "weed_treated"
        row["role"] = "weed"
        db.log_detection_row(self.session_id, row)
        db.log_event(
            "weed_treated",
            f"Weed treated ({note}): {target.get('class_name', 'weed')} #{target.get('id')} — "
            f"session total treated={self.session_weeds_treated}",
            severity="warning",
            session_id=self.session_id,
            target_id=target.get("id"),
            meta={
                "class_name": target.get("class_name"),
                "session_weeds_treated": self.session_weeds_treated,
                "session_weeds_seen": self.session_weeds_seen,
            },
        )

    def pi_telemetry(self) -> PiTelemetry:
        # Local host metrics for the machine running this control service.
        # Remote Pi fields remain unavailable until pi_base_url is reachable.
        remote = hardware.connected and not hardware.is_simulation and bool(settings.pi_base_url)
        try:
            cpu = psutil.cpu_percent(interval=None)
            ram = psutil.virtual_memory().percent
            uptime = time.time() - self._process_start
            temp = None
            try:
                temps = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
                if temps:
                    for entries in temps.values():
                        if entries:
                            temp = float(entries[0].current)
                            break
            except Exception:
                temp = None
            return PiTelemetry(
                remote_pi_connected=remote,
                source="remote_pi" if remote else "local_host",
                online=True,
                cpu_percent=cpu,
                ram_percent=ram,
                cpu_temp_c=temp,
                uptime_s=uptime,
                camera_status="connected" if self.camera_ok else "disconnected",
                model_status="loaded" if detector.loaded else "not_loaded",
                inference_fps=detector.fps,
                last_response_s=hardware.last_heartbeat,
                note=(
                    "Telemetry from Raspberry Pi control unit."
                    if remote
                    else "Showing local control-host metrics. Configure pi_base_url for remote Pi telemetry."
                ),
            )
        except Exception as exc:
            return PiTelemetry(
                remote_pi_connected=False,
                source="unavailable",
                online=False,
                note=f"Telemetry unavailable: {exc}",
            )

    def snapshot(self) -> SystemState:
        with self.lock:
            safety = evaluate_safety(
                mode=self.mode,
                estop=self.estop,
                enclosure_closed=self.enclosure_closed,
                interlock_ok=self.interlock_ok,
                camera_ok=self.camera_ok,
                comm_ok=True if self.ws_clients >= 0 else False,  # dashboard link; Pi link separate
                calibration_valid=calibration_engine.valid,
                working_area_set=bool(self.working_area and self.working_area.active),
                fault_active=self.fault_active,
                last_safety_event=self.last_safety_event,
            )
            # Comm to Pi:
            pi_ok = hardware.connected or hardware.is_simulation
            if not pi_ok and self.mode in (SystemMode.live, SystemMode.running):
                # Live treatment needs hardware link; test video does not.
                safety = evaluate_safety(
                    mode=self.mode,
                    estop=self.estop,
                    enclosure_closed=self.enclosure_closed,
                    interlock_ok=self.interlock_ok,
                    camera_ok=self.camera_ok,
                    comm_ok=False,
                    calibration_valid=calibration_engine.valid,
                    working_area_set=bool(self.working_area and self.working_area.active),
                    fault_active=self.fault_active,
                    last_safety_event=self.last_safety_event,
                )

            from .models_schema import CommState

            comms = CommState(
                active_link="wifi" if (hardware.connected and not hardware.is_simulation) else (
                    "none" if not hardware.is_simulation else "wifi"
                ),
                wifi_connected=hardware.connected or hardware.is_simulation,
                bluetooth_connected=False,
                last_heartbeat_s=hardware.last_heartbeat,
                last_ack_s=None,
                timeout_s=settings.heartbeat_timeout_s,
                failures=0,
                quality=None,
                note=(
                    "Simulation link"
                    if hardware.is_simulation
                    else (
                        "Wi-Fi link to Raspberry Pi"
                        if hardware.connected
                        else "No active Pi link. Bluetooth failover is handled on the Raspberry Pi, not in the browser."
                    )
                ),
            )

            return SystemState(
                app_name=settings.app_name,
                version=settings.version,
                mode=self.mode,
                running=self.running,
                session_id=self.session_id,
                session_duration_s=self.session_duration(),
                model_loaded=detector.loaded,
                model_name=detector.model_name,
                model_classes=list(detector.class_names.values()),
                conf_threshold=detector.conf,
                frame_width=self.frame_width,
                frame_height=self.frame_height,
                camera_connected=self.camera_ok,
                video_source=self.video_source,
                fps=detector.fps,
                stats=self.stats.model_copy(),
                safety=safety,
                calibration=calibration_engine.to_state(),
                working_area=self.working_area,
                machine=hardware.to_state(),
                comms=comms,
                pi=self.pi_telemetry(),
                selected_target_id=self.selected_target_id,
            )

    def snapshot_dict(self) -> dict[str, Any]:
        data = self.snapshot().model_dump()
        data["inference_ms"] = detector.inference_ms
        data["model_error"] = detector.load_error
        try:
            from .devices import laser, robot

            data["robot"] = robot.status()
            data["laser"] = laser.status()
        except Exception:
            data["robot"] = {"mode": "simulation", "state": "unavailable", "is_simulation": True}
            data["laser"] = {"mode": "simulation", "enabled": False, "is_simulation": True}
        return data


app_state = AppState()
