from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class SystemMode(str, Enum):
    idle = "idle"
    live = "live"
    test_video = "test_video"
    running = "running"
    stopped = "stopped"
    estop = "estop"


class TargetStatus(str, Enum):
    detected = "detected"
    selected = "selected"
    localised = "localised"
    commanded = "commanded"
    acknowledged = "acknowledged"
    completed = "completed"
    verified = "verified"
    skipped = "skipped"


class Detection(BaseModel):
    id: int
    class_name: str
    class_id: int
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float
    cx: float
    cy: float
    treatable: bool = False
    inside_workspace: Optional[bool] = None
    workspace_x_mm: Optional[float] = None
    workspace_y_mm: Optional[float] = None
    status: TargetStatus = TargetStatus.detected
    skip_reason: Optional[str] = None


class BBoxNorm(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class WorkingArea(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    active: bool = True


class CalibrationPoint(BaseModel):
    image_x: float
    image_y: float
    workspace_x_mm: float
    workspace_y_mm: float
    label: str = ""


class CalibrationState(BaseModel):
    valid: bool = False
    points: list[CalibrationPoint] = []
    rms_error_mm: Optional[float] = None
    method: Optional[str] = None
    created_at: Optional[str] = None
    note: str = ""


class SafetyState(BaseModel):
    treatment_allowed: bool = False
    reasons: list[str] = []
    estop: bool = False
    enclosure_closed: bool = True
    interlock_ok: bool = True
    camera_ok: bool = False
    comm_ok: bool = True
    calibration_valid: bool = False
    working_area_set: bool = False
    mode_safe: bool = False
    fault_active: bool = False
    last_safety_event: Optional[str] = None


class CommState(BaseModel):
    active_link: Literal["wifi", "bluetooth", "none"] = "none"
    wifi_connected: bool = False
    bluetooth_connected: bool = False
    last_heartbeat_s: Optional[float] = None
    last_ack_s: Optional[float] = None
    timeout_s: float = 3.0
    reconnecting: bool = False
    failures: int = 0
    quality: Optional[float] = None
    note: str = "Dashboard talks to the control unit over HTTP/WebSocket. Pi Wi-Fi/Bluetooth failover is managed on-device."


class MachineState(BaseModel):
    connected: bool = False
    is_simulation: bool = False
    state: str = "disconnected"
    x_mm: Optional[float] = None
    y_mm: Optional[float] = None
    positioning: bool = False
    limit_x_min: Optional[bool] = None
    limit_x_max: Optional[bool] = None
    limit_y_min: Optional[bool] = None
    limit_y_max: Optional[bool] = None
    treatment_head: str = "unknown"
    fault: Optional[str] = None
    last_ack: Optional[str] = None
    note: str = "Position feedback unavailable until hardware link is established."


class PiTelemetry(BaseModel):
    remote_pi_connected: bool = False
    source: Literal["local_host", "remote_pi", "unavailable"] = "unavailable"
    online: bool = False
    cpu_percent: Optional[float] = None
    ram_percent: Optional[float] = None
    cpu_temp_c: Optional[float] = None
    uptime_s: Optional[float] = None
    camera_status: str = "unknown"
    model_status: str = "unknown"
    inference_fps: Optional[float] = None
    last_response_s: Optional[float] = None
    note: str = ""


class DetectionStats(BaseModel):
    total: int = 0
    weeds: int = 0
    non_weeds: int = 0
    inside_workspace: int = 0
    treated: int = 0
    skipped: int = 0
    fps: float = 0.0
    session_detections: int = 0


class SystemState(BaseModel):
    app_name: str = "WEEDELEO"
    version: str = "1.0.0"
    mode: SystemMode = SystemMode.idle
    running: bool = False
    session_id: Optional[str] = None
    session_duration_s: float = 0.0
    model_loaded: bool = False
    model_name: str = ""
    model_classes: list[str] = []
    conf_threshold: float = 0.35
    frame_width: int = 0
    frame_height: int = 0
    camera_connected: bool = False
    video_source: Optional[str] = None
    fps: float = 0.0
    stats: DetectionStats = Field(default_factory=DetectionStats)
    safety: SafetyState = Field(default_factory=SafetyState)
    calibration: CalibrationState = Field(default_factory=CalibrationState)
    working_area: Optional[WorkingArea] = None
    machine: MachineState = Field(default_factory=MachineState)
    comms: CommState = Field(default_factory=CommState)
    pi: PiTelemetry = Field(default_factory=PiTelemetry)
    selected_target_id: Optional[int] = None


class ModeRequest(BaseModel):
    mode: Literal["idle", "live", "test_video"]


class ConfidenceRequest(BaseModel):
    threshold: float = Field(ge=0.05, le=0.95)


class VideoSelectRequest(BaseModel):
    filename: str


class ControlCommand(BaseModel):
    action: Literal["start", "stop", "reset", "estop", "estop_clear"]


class MoveRequest(BaseModel):
    x_mm: float
    y_mm: float


class TargetCommandRequest(BaseModel):
    confirm: bool = False


class SettingsUpdate(BaseModel):
    conf_threshold: Optional[float] = None
    camera_index: Optional[int] = None
    show_labels: Optional[bool] = None
    show_confidence: Optional[bool] = None
    show_ids: Optional[bool] = None
    mjpeg_quality: Optional[int] = None
    log_detections: Optional[bool] = None
    workspace_width_mm: Optional[float] = None
    workspace_height_mm: Optional[float] = None
    pi_base_url: Optional[str] = None
    theme: Optional[str] = None
    extras: dict[str, Any] = Field(default_factory=dict)


class EventOut(BaseModel):
    id: int
    ts: str
    severity: str
    event_type: str
    description: str
    session_id: Optional[str] = None
    target_id: Optional[int] = None
    meta: Optional[dict[str, Any]] = None


class SessionOut(BaseModel):
    id: str
    started_at: str
    ended_at: Optional[str] = None
    mode: str
    status: str
    stats: dict[str, Any] = Field(default_factory=dict)
