from __future__ import annotations

import time
from typing import Any


class LaserController:
    async def enable(self) -> dict[str, Any]:
        raise NotImplementedError

    async def disable(self) -> dict[str, Any]:
        raise NotImplementedError

    async def fire(self, duration_ms: float = 100) -> dict[str, Any]:
        raise NotImplementedError

    def status(self) -> dict[str, Any]:
        raise NotImplementedError


class SimulatedLaserController(LaserController):
    def __init__(self) -> None:
        self.enabled = False
        self.events = 0
        self.last_event: dict[str, Any] | None = None

    async def enable(self) -> dict[str, Any]:
        self.enabled = True
        return self.status()

    async def disable(self) -> dict[str, Any]:
        self.enabled = False
        return self.status()

    async def fire(self, duration_ms: float = 100) -> dict[str, Any]:
        """Simulation only — never claims a physical laser fired."""
        if not self.enabled:
            return {"ok": False, "error": "Laser simulation not enabled", "simulation": True}
        self.events += 1
        self.last_event = {
            "ts": time.time(),
            "duration_ms": duration_ms,
            "status": "SIMULATED_TREATMENT",
        }
        return {
            "ok": True,
            "simulation": True,
            "status": "SIMULATED_TREATMENT",
            "note": "Simulated treatment event only — no physical laser output.",
            "event": self.last_event,
        }

    def status(self) -> dict[str, Any]:
        return {
            "mode": "simulation",
            "connected": False,
            "is_simulation": True,
            "enabled": self.enabled,
            "events": self.events,
            "last_event": self.last_event,
            "note": "Simulated laser — physical module not connected.",
        }


laser = SimulatedLaserController()
