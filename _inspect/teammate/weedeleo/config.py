"""All settings in one place."""
import os
BASE = os.path.dirname(os.path.abspath(__file__))
HOST, PORT = "0.0.0.0", 5000
FRAME_W, FRAME_H = 640, 480
TARGET_FPS = 15
CAMERA_INDEX = 0
TEST_VIDEO = os.path.join(BASE, "assets", "test.mp4")   # optional; synthetic feed is used if missing
MODEL_PATH = next((p for p in (os.path.join(BASE, "models", n) for n in ("best.pt", "weed.pt")) if os.path.exists(p)),
                  os.path.join(BASE, "models", "best.pt"))   # put your trained model here (best.pt or weed.pt)
WEED_CLASSES = {"weed"}          # model class names that count as weed (not case sensitive, so "Weed" works)
IMGSZ = 320                      # YOLO input size (smaller = faster on Raspberry Pi)
CONF_THRESHOLD = 0.5             # minimum confidence to treat a weed
HEARTBEAT_TIMEOUT = 3.0          # seconds without dashboard polling -> FAULT
COOLDOWN_S, COOLDOWN_PX = 2.0, 60  # don't treat the same spot repeatedly
LINK_TYPE = "wifi"
LOG_DIR = os.path.join(BASE, "logs")
# Calibration: 4 image points (pixels) -> 4 workspace points (mm). Replace with your measured values.
CAL_PX = [(0, 0), (640, 0), (640, 480), (0, 480)]
CAL_MM = [(0, 0), (300, 0), (300, 225), (0, 225)]
