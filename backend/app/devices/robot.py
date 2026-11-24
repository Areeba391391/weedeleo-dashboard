from __future__ import annotations

import time
from typing import Any, Literal


MoveDir = Literal["forward", "backward", "left", "right", "stop"]


class RobotController:
    """Hardware abstraction for future Raspberry Pi motor control."""

    async def start(self) -> dict[str, Any]:
        raise NotImplementedError

    async def stop(self) -> dict[str, Any]:
        raise NotImplementedError

    async def move(self, direction: MoveDir) -> dict[str, Any]:
        raise NotImplementedError

    def status(self) -> dict[str, Any]:
        raise NotImplementedError


class SimulatedRobotController(RobotController):
    def __init__(self) -> None:
        self.mode = "simulation"
        self.state = "IDLE"
        self.x = 0.0  # field metres (simulated)
        self.y = 0.0
        self.heading_deg = 0.0
        self.path: list[dict[str, float]] = [{"x": 0.0, "y": 0.0}]
        self.last_command: str | None = None
        self.updated_at = time.time()

    def _step(self, dx: float, dy: float, heading: float | None = None) -> None:
        self.x = max(-5.0, min(5.0, self.x + dx))
        self.y = max(-5.0, min(5.0, self.y + dy))
        if heading is not None:
            self.heading_deg = heading % 360
        self.path.append({"x": round(self.x, 3), "y": round(self.y, 3)})
        if len(self.path) > 200:
            self.path = self.path[-200:]
        self.updated_at = time.time()

    async def start(self) -> dict[str, Any]:
        self.state = "READY"
        self.last_command = "start"
        return self.status()

    async def stop(self) -> dict[str, Any]:
        self.state = "STOPPED"
        self.last_command = "stop"
        return self.status()

    async def move(self, direction: MoveDir) -> dict[str, Any]:
        step = 0.25
        self.state = "MOVING"
        self.last_command = direction
        if direction == "forward":
            self._step(0, step, 0)
        elif direction == "backward":
            self._step(0, -step, 180)
        elif direction == "left":
            self._step(-step, 0, 270)
        elif direction == "right":
            self._step(step, 0, 90)
        else:
            self.state = "STOPPED"
        if direction != "stop":
            self.state = "READY"
        return self.status()

    def status(self) -> dict[str, Any]:
        return {
            "mode": "simulation",
            "connected": False,
            "is_simulation": True,
            "state": self.state,
            "x_m": round(self.x, 3),
            "y_m": round(self.y, 3),
            "heading_deg": self.heading_deg,
            "path": self.path[-50:],
            "last_command": self.last_command,
            "note": "Simulated robot — physical chassis not connected.",
        }


class RaspberryPiRobotController(RobotController):
    """Stub for future GPIO / motor-driver integration."""

    def status(self) -> dict[str, Any]:
        return {
            "mode": "raspberry_pi",
            "connected": False,
            "is_simulation": False,
            "state": "NOT_CONNECTED",
            "note": "Raspberry Pi robot controller not wired yet.",
        }

    async def start(self) -> dict[str, Any]:
        return {"ok": False, "error": "Raspberry Pi robot not available"}

    async def stop(self) -> dict[str, Any]:
        return {"ok": False, "error": "Raspberry Pi robot not available"}

    async def move(self, direction: MoveDir) -> dict[str, Any]:
        return {"ok": False, "error": "Raspberry Pi robot not available"}


robot = SimulatedRobotController()
