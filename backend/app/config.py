from __future__ import annotations

from pathlib import Path
from pydantic import BaseModel


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
MODELS_DIR = ROOT / "models"
DATA_DIR = ROOT / "data"
UPLOAD_DIR = ROOT / "uploads" / "videos"
IMAGE_UPLOAD_DIR = ROOT / "uploads" / "images"
REPORTS_DIR = DATA_DIR / "reports"

for d in (DATA_DIR, UPLOAD_DIR, IMAGE_UPLOAD_DIR, REPORTS_DIR, MODELS_DIR):
    d.mkdir(parents=True, exist_ok=True)


# Classes treated as weeds for precision treatment (verified against data.yaml / best.pt).
# All other model classes are treated as crops to protect.
DEFAULT_WEED_CLASS_NAMES = {
    "small weed",
    "grass",
    "horseweed",
    "herb paris",  # Paris quadrifolia — dataset class 0, treat as weed
}


class Settings(BaseModel):
    app_name: str = "WEEDELEO"
    version: str = "2.0.0"
    host: str = "0.0.0.0"
    port: int = 8000

    model_path: Path = MODELS_DIR / "best.pt"
    fallback_model_path: Path = MODELS_DIR / "Weedeleo_Best_Weed_Detector.pt"
    conf_threshold: float = 0.35
    iou_threshold: float = 0.45
    imgsz: int = 640

    workspace_width_mm: float = 400.0
    workspace_height_mm: float = 400.0

    db_path: Path = DATA_DIR / "weedeleo.db"
    upload_dir: Path = UPLOAD_DIR
    image_upload_dir: Path = IMAGE_UPLOAD_DIR
    reports_dir: Path = REPORTS_DIR

    camera_index: int = 0
    mjpeg_quality: int = 78
    target_fps: int = 12

    heartbeat_timeout_s: float = 3.0
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]

    pi_base_url: str = ""
    pi_api_key: str = ""

    # Hardware modes — simulation until Raspberry Pi hardware exists.
    robot_mode: str = "simulation"  # simulation | raspberry_pi
    laser_mode: str = "simulation"  # simulation | raspberry_pi
    simulation_mode: bool = True

    weed_class_names: set[str] = DEFAULT_WEED_CLASS_NAMES


settings = Settings()
