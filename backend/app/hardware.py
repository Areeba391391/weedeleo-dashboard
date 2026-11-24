from __future__ import annotations

import time
from typing import Any, Optional

import httpx

from .config import settings
from .models_schema import MachineState


class HardwareController:
    """
    Interface to the laser module / XY gantry via the Raspberry Pi control unit.

    Browser never fires the laser directly. Commands are validated here and
    forwarded only when a real Pi endpoint is configured and connected.
    Simulation mode is explicitly labelled and never pretends to be real hardware.
    """

    def __init__(self) -> None:
        self.is_simulation = False
        self.connected = False
        self.state = "disconnected"
        self.x_mm: Optional[float] = None
        self.y_mm: Optional[float] = None
        self.positioning = False
        self.treatment_head = "unknown"
        self.fault: Optional[str] = None
        self.last_ack: Optional[str] = None
        self.last_heartbeat: Optional[float] = None
        self._sim_x = 0.0
        self._sim_y = 0.0

    def enable_simulation(self, enabled: bool = True) -> None:
        self.is_simulation = enabled
        if enabled:
            self.connected = True
            self.state = "sim_ready"
            self.x_mm = self._sim_x
            self.y_mm = self._sim_y
            self.treatment_head = "indicator_sim"
            self.last_ack = "simulation_enabled"
            self.last_heartbeat = time.time()
        else:
            self.connected = False
            self.state = "disconnected"
            self.x_mm = None
            self.y_mm = None
            self.treatment_head = "unknown"

    def connect(self) -> dict[str, Any]:
        if settings.pi_base_url:
            try:
                r = httpx.get(f"{settings.pi_base_url.rstrip('/')}/health", timeout=2.0)
                if r.status_code == 200:
                    self.connected = True
                    self.is_simulation = False
                    self.state = "connected"
                    self.last_heartbeat = time.time()
                    self.last_ack = "pi_health_ok"
                    return {"ok": True, "mode": "remote_pi"}
            except Exception as exc:
                self.connected = False
                self.state = "error"
                self.fault = str(exc)
                return {"ok": False, "error": str(exc)}
        # No Pi configured — stay disconnected unless simulation explicitly enabled.
        return {
            "ok": False,
            "error": "Raspberry Pi base URL not configured. Set pi_base_url in settings or enable simulation for UI demos.",
        }

    def heartbeat(self) -> bool:
        if self.is_simulation:
            self.last_heartbeat = time.time()
            return True
        if not settings.pi_base_url:
            self.connected = False
            return False
        try:
            r = httpx.get(f"{settings.pi_base_url.rstrip('/')}/health", timeout=1.5)
            ok = r.status_code == 200
            self.connected = ok
            if ok:
                self.last_heartbeat = time.time()
                self.state = "connected"
            else:
                self.state = "heartbeat_fail"
            return ok
        except Exception:
            self.connected = False
            self.state = "offline"
            return False

    def emergency_stop(self) -> dict[str, Any]:
        self.state = "estop"
        self.positioning = False
        if self.is_simulation:
            self.last_ack = "sim_estop"
            return {"ok": True, "simulation": True}
        if settings.pi_base_url and self.connected:
            try:
                r = httpx.post(f"{settings.pi_base_url.rstrip('/')}/estop", timeout=2.0)
                self.last_ack = f"estop_{r.status_code}"
                return {"ok": r.status_code < 300}
            except Exception as exc:
                return {"ok": False, "error": str(exc)}
        return {"ok": True, "note": "Local estop latch set; Pi unreachable — hardware interlock must hold."}

    def home(self) -> dict[str, Any]:
        if self.is_simulation:
            self._sim_x = 0.0
            self._sim_y = 0.0
            self.x_mm = 0.0
            self.y_mm = 0.0
            self.state = "sim_homed"
            self.last_ack = "sim_home"
            return {"ok": True, "simulation": True, "x_mm": 0.0, "y_mm": 0.0}
        if not self.connected or not settings.pi_base_url:
            return {"ok": False, "error": "Hardware not connected"}
        try:
            r = httpx.post(f"{settings.pi_base_url.rstrip('/')}/home", timeout=10.0)
            data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            self.x_mm = data.get("x_mm")
            self.y_mm = data.get("y_mm")
            self.last_ack = "home_ok" if r.status_code < 300 else "home_fail"
            return {"ok": r.status_code < 300, "data": data}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def move_to(self, x_mm: float, y_mm: float) -> dict[str, Any]:
        if self.is_simulation:
            self.positioning = True
            self._sim_x = float(x_mm)
            self._sim_y = float(y_mm)
            self.x_mm = self._sim_x
            self.y_mm = self._sim_y
            self.positioning = False
            self.state = "sim_positioned"
            self.last_ack = "sim_move"
            return {
                "ok": True,
                "simulation": True,
                "x_mm": self.x_mm,
                "y_mm": self.y_mm,
                "status": "acknowledged",
            }
        if not self.connected or not settings.pi_base_url:
            return {"ok": False, "error": "Hardware not connected"}
        try:
            r = httpx.post(
                f"{settings.pi_base_url.rstrip('/')}/move",
                json={"x_mm": x_mm, "y_mm": y_mm},
                timeout=10.0,
            )
            data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            if r.status_code < 300:
                self.x_mm = data.get("x_mm", x_mm)
                self.y_mm = data.get("y_mm", y_mm)
                self.last_ack = "move_ack"
                return {"ok": True, "status": "acknowledged", "data": data}
            return {"ok": False, "error": data or r.text}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def treat(self) -> dict[str, Any]:
        """Fire / indicator pulse — only after external safety gate passes."""
        if self.is_simulation:
            self.last_ack = "sim_indicator_pulse"
            return {
                "ok": True,
                "simulation": True,
                "status": "acknowledged",
                "note": "Simulation indicator only — not a verified laser treatment.",
            }
        if not self.connected or not settings.pi_base_url:
            return {"ok": False, "error": "Hardware not connected"}
        try:
            r = httpx.post(f"{settings.pi_base_url.rstrip('/')}/treat", timeout=10.0)
            data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            if r.status_code < 300:
                self.last_ack = "treat_ack"
                # Completion/verification must come from hardware feedback fields if present.
                status = data.get("status", "acknowledged")
                return {"ok": True, "status": status, "data": data}
            return {"ok": False, "error": data or r.text}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def to_state(self) -> MachineState:
        note = (
            "Visual simulation — not real hardware telemetry."
            if self.is_simulation
            else (
                "Connected to Raspberry Pi control unit."
                if self.connected
                else "Position feedback unavailable until hardware link is established."
            )
        )
        return MachineState(
            connected=self.connected,
            is_simulation=self.is_simulation,
            state=self.state,
            x_mm=self.x_mm,
            y_mm=self.y_mm,
            positioning=self.positioning,
            treatment_head=self.treatment_head,
            fault=self.fault,
            last_ack=self.last_ack,
            note=note,
        )


hardware = HardwareController()
