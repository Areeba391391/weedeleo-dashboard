from __future__ import annotations

from .models_schema import SafetyState, SystemMode


def evaluate_safety(
    *,
    mode: SystemMode,
    estop: bool,
    enclosure_closed: bool,
    interlock_ok: bool,
    camera_ok: bool,
    comm_ok: bool,
    calibration_valid: bool,
    working_area_set: bool,
    fault_active: bool,
    last_safety_event: str | None = None,
) -> SafetyState:
    reasons: list[str] = []

    mode_safe = mode == SystemMode.live or mode == SystemMode.running
    # Running in live is ok; test_video must never treat.
    if mode == SystemMode.test_video:
        reasons.append("Test video mode active — treatment hardware isolated")
        mode_safe = False
    elif mode in (SystemMode.idle, SystemMode.stopped):
        reasons.append("System not in live treatment mode")
        mode_safe = False
    elif mode == SystemMode.estop:
        reasons.append("Emergency stop activated")
        mode_safe = False

    if estop:
        reasons.append("Emergency stop activated")
    if not enclosure_closed:
        reasons.append("Enclosure open")
    if not interlock_ok:
        reasons.append("Interlock not satisfied")
    if not camera_ok:
        reasons.append("Camera disconnected")
    if not comm_ok:
        reasons.append("Communication lost")
    if not calibration_valid:
        reasons.append("Calibration invalid")
    if not working_area_set:
        reasons.append("Working area not set")
    if fault_active:
        reasons.append("Hardware fault detected")

    treatment_allowed = (
        not estop
        and enclosure_closed
        and interlock_ok
        and camera_ok
        and comm_ok
        and calibration_valid
        and working_area_set
        and not fault_active
        and mode in (SystemMode.live, SystemMode.running)
    )

    return SafetyState(
        treatment_allowed=treatment_allowed,
        reasons=reasons,
        estop=estop,
        enclosure_closed=enclosure_closed,
        interlock_ok=interlock_ok,
        camera_ok=camera_ok,
        comm_ok=comm_ok,
        calibration_valid=calibration_valid,
        working_area_set=working_area_set,
        mode_safe=mode_safe,
        fault_active=fault_active,
        last_safety_event=last_safety_event,
    )
