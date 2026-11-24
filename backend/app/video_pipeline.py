from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from .config import settings
from .detector import detector
from .state import app_state


class VideoPipeline:
    def __init__(self) -> None:
        self._cap: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._frame_lock = threading.Lock()
        self._jpeg: Optional[bytes] = None
        self._raw: Optional[np.ndarray] = None
        self.source_kind = "none"  # none|camera|video
        self.video_path: Optional[Path] = None
        self._infer_every = 2  # skip frames on CPU-bound hosts for smoother MJPEG
        self._frame_i = 0

    def list_videos(self) -> list[str]:
        return sorted(p.name for p in settings.upload_dir.glob("*") if p.suffix.lower() in {".mp4", ".avi", ".mov", ".mkv", ".webm"})

    def open_camera(self, index: Optional[int] = None) -> bool:
        self.close()
        idx = settings.camera_index if index is None else index
        cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            app_state.camera_ok = False
            return False
        self._cap = cap
        self.source_kind = "camera"
        self.video_path = None
        app_state.camera_ok = True
        app_state.video_source = f"camera:{idx}"
        self._start_loop()
        return True

    def open_video(self, filename: str) -> bool:
        path = settings.upload_dir / filename
        if not path.exists():
            return False
        self.close()
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            app_state.camera_ok = False
            return False
        self._cap = cap
        self.source_kind = "video"
        self.video_path = path
        app_state.camera_ok = True
        app_state.video_source = filename
        self._start_loop()
        return True

    def close(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        with self._frame_lock:
            self._jpeg = None
            self._raw = None
        self.source_kind = "none"
        app_state.camera_ok = False
        app_state.video_source = None

    def _start_loop(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="weedeleo-video")
        self._thread.start()

    def _loop(self) -> None:
        assert self._cap is not None
        while not self._stop.is_set():
            ok, frame = self._cap.read()
            if not ok or frame is None:
                if self.source_kind == "video":
                    # Loop test video
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                app_state.camera_ok = False
                time.sleep(0.2)
                continue

            h, w = frame.shape[:2]
            app_state.frame_width = w
            app_state.frame_height = h
            app_state.camera_ok = True

            run_infer = app_state.running or app_state.mode.value in ("live", "test_video", "running")
            dets = []
            if run_infer and detector.loaded and self._frame_i % self._infer_every == 0:
                try:
                    dets = detector.infer(frame)
                    app_state.update_detections(dets)
                except Exception:
                    dets = []
            self._frame_i += 1

            annotated = self._annotate(frame, app_state.detections)
            ok_enc, buf = cv2.imencode(
                ".jpg",
                annotated,
                [int(cv2.IMWRITE_JPEG_QUALITY), settings.mjpeg_quality],
            )
            if ok_enc:
                with self._frame_lock:
                    self._jpeg = buf.tobytes()
                    self._raw = frame

            # Pace roughly to target fps
            time.sleep(max(0.0, 1.0 / max(1, settings.target_fps)))

    def _annotate(self, frame: np.ndarray, dets: list[dict]) -> np.ndarray:
        out = frame.copy()
        fw, fh = out.shape[1], out.shape[0]
        area = app_state.working_area
        if area and area.active:
            x1 = int(area.x * fw)
            y1 = int(area.y * fh)
            x2 = int((area.x + area.w) * fw)
            y2 = int((area.y + area.h) * fh)
            overlay = out.copy()
            cv2.rectangle(overlay, (x1, y1), (x2, y2), (46, 204, 113), -1)
            cv2.addWeighted(overlay, 0.12, out, 0.88, 0, out)
            cv2.rectangle(out, (x1, y1), (x2, y2), (46, 204, 113), 2)
            cv2.putText(out, "WORKING AREA", (x1 + 6, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (46, 204, 113), 2)

        for d in dets:
            role = d.get("role") or ("weed" if d.get("treatable") else "crop")
            # Weed = amber-red, crop = protective green (BGR)
            color = (40, 90, 220) if role == "weed" else (70, 150, 60)
            x1, y1, x2, y2 = int(d["x1"]), int(d["y1"]), int(d["x2"]), int(d["y2"])
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
            label = f"{d['class_name'].upper()} {d['confidence'] * 100:.0f}%"
            cv2.putText(out, label, (x1, max(16, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        hud = f"FPS {detector.fps:.1f} | {app_state.mode.value.upper()}"
        cv2.putText(out, hud, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (230, 230, 230), 2)
        return out

    def get_jpeg(self) -> Optional[bytes]:
        with self._frame_lock:
            return self._jpeg


pipeline = VideoPipeline()
