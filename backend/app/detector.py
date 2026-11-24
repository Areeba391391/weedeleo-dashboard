from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Optional

import numpy as np

from .config import settings


def classify_role(class_name: str, weed_names: set[str] | None = None) -> str:
    """Return 'weed' or 'crop' from the actual model class name."""
    names = weed_names or settings.weed_class_names
    key = class_name.strip().lower()
    if key in {n.lower() for n in names}:
        return "weed"
    # Heuristic fallback for future models
    if any(tok in key for tok in ("weed", "grass", "horseweed")):
        return "weed"
    return "crop"


class WeedDetector:
    """Thread-safe Ultralytics YOLO wrapper using the project's trained best.pt."""

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self.model_path: Optional[Path] = None
        self.model_name: str = ""
        self.class_names: dict[int, str] = {}
        self.loaded = False
        self.load_error: Optional[str] = None
        self.conf = settings.conf_threshold
        self.iou = settings.iou_threshold
        self.imgsz = settings.imgsz
        self._fps = 0.0
        self._ema = 0.0
        self._infer_ms = 0.0
        self._next_id = 1

    def load(self) -> None:
        from ultralytics import YOLO

        project_best = Path(__file__).resolve().parents[2] / "models" / "best.pt"
        candidates = [settings.model_path, project_best, settings.fallback_model_path]
        path = next((p for p in candidates if p.exists()), None)
        if path is None:
            self.loaded = False
            self.load_error = f"No model found. Expected {settings.model_path}"
            raise FileNotFoundError(self.load_error)

        with self._lock:
            self._model = YOLO(str(path))
            self.model_path = path
            self.model_name = path.name
            names = self._model.names
            if isinstance(names, dict):
                self.class_names = {int(k): str(v) for k, v in names.items()}
            else:
                self.class_names = {i: str(n) for i, n in enumerate(names)}
            self.loaded = True
            self.load_error = None
            self._next_id = 1

    @property
    def fps(self) -> float:
        return self._fps

    @property
    def inference_ms(self) -> float:
        return self._infer_ms

    def set_confidence(self, threshold: float) -> None:
        self.conf = float(max(0.05, min(0.95, threshold)))

    def reset_ids(self) -> None:
        with self._lock:
            self._next_id = 1

    def infer(self, frame_bgr: np.ndarray) -> list[dict[str, Any]]:
        if not self.loaded or self._model is None:
            raise RuntimeError(self.load_error or "Model not loaded")
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        t0 = time.perf_counter()
        with self._lock:
            results = self._model.predict(
                source=frame_bgr,
                conf=self.conf,
                iou=self.iou,
                imgsz=self.imgsz,
                verbose=False,
            )
            dets: list[dict[str, Any]] = []
            if not results:
                self._update_timing(t0)
                return dets
            boxes = getattr(results[0], "boxes", None)
            if boxes is None or len(boxes) == 0:
                self._update_timing(t0)
                return dets
            xyxy = boxes.xyxy.cpu().numpy()
            confs = boxes.conf.cpu().numpy()
            clss = boxes.cls.cpu().numpy().astype(int)
            for i in range(len(xyxy)):
                x1, y1, x2, y2 = map(float, xyxy[i])
                cid = int(clss[i])
                cname = self.class_names.get(cid, str(cid))
                role = classify_role(cname)
                det_id = self._next_id
                self._next_id += 1
                dets.append(
                    {
                        "id": det_id,
                        "class_name": cname,
                        "class_id": cid,
                        "role": role,
                        "confidence": float(confs[i]),
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "cx": (x1 + x2) / 2.0,
                        "cy": (y1 + y2) / 2.0,
                        "treatable": role == "weed",
                        "status": "detected",
                    }
                )
        self._update_timing(t0)
        return dets

    def _update_timing(self, t0: float) -> None:
        dt = max(1e-6, time.perf_counter() - t0)
        self._infer_ms = dt * 1000.0
        inst = 1.0 / dt
        self._ema = inst if self._ema == 0 else (0.85 * self._ema + 0.15 * inst)
        self._fps = float(self._ema)


detector = WeedDetector()
