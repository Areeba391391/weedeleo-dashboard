import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
import app as appmod
from core.engine import Err

E = appmod.engine
C = appmod.app.test_client()
AREA = {"x": .1, "y": .1, "w": .8, "h": .8}


@pytest.fixture(autouse=True)
def fresh():
    E.state, E.fault, E.estop_on, E.area, E.interlock = "IDLE", None, False, None, True
    E.mode = "video"; E.laser_count = 0; E.touch()


def test_start_needs_area():
    assert C.post("/api/start").status_code == 409


def test_area_validation():
    assert C.post("/api/area", json={"x": 2, "y": 0, "w": .5, "h": .5}).status_code == 400
    assert C.post("/api/area", json={"x": .1}).status_code == 400
    assert C.post("/api/area", json=AREA).status_code == 200


def test_mode_blocked_while_running():
    C.post("/api/area", json=AREA); C.post("/api/start")
    assert C.post("/api/mode", json={"mode": "live"}).status_code == 409


def test_estop_and_reset():
    C.post("/api/estop"); assert E.state == "ESTOP"
    assert C.post("/api/start").status_code == 409
    C.post("/api/reset"); assert E.state == "IDLE"


@pytest.mark.parametrize("setup,reason", [
    (lambda: setattr(E, "mode", "video"), "mode=video (laser disabled)"),
    (lambda: (setattr(E, "mode", "live"), setattr(E, "interlock", False)), "interlock open"),
])
def test_gate_reasons(setup, reason):
    E.state = "RUNNING"; setup(); E.touch()
    assert E.gate(dict(conf=.9)) == reason


def test_gate_allows_and_low_conf():
    E.state, E.mode = "RUNNING", "live"; E.touch()
    assert E.gate(dict(conf=.9)) is None
    assert E.gate(dict(conf=.1)) == "low confidence"


def test_video_mode_never_fires_laser():
    E.start_thread(); C.post("/api/area", json=AREA); C.post("/api/start")
    for _ in range(8):
        C.get("/api/state"); time.sleep(.5)
    assert E.laser_count == 0 and E.stats["skipped"] > 0
    C.post("/api/stop")


def test_calibration_corners():
    x, y = E.pixel_to_mm(640, 480)
    assert abs(x - 300) < .01 and abs(y - 225) < .01
