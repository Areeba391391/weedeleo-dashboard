from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from .models_schema import CalibrationPoint, CalibrationState


@dataclass
class CalibrationEngine:
    points: list[CalibrationPoint] = field(default_factory=list)
    matrix: Optional[np.ndarray] = None  # 3x3 homography image->workspace
    rms_error_mm: Optional[float] = None
    valid: bool = False
    method: Optional[str] = None
    created_at: Optional[str] = None
    note: str = ""

    def set_points(self, points: list[CalibrationPoint]) -> None:
        self.points = list(points)
        self.valid = False
        self.matrix = None
        self.rms_error_mm = None
        self.method = None
        self.created_at = None
        self.note = "Points updated; compute required."

    def clear(self) -> None:
        self.points = []
        self.matrix = None
        self.rms_error_mm = None
        self.valid = False
        self.method = None
        self.created_at = None
        self.note = "Calibration cleared."

    def compute(self) -> CalibrationState:
        if len(self.points) < 4:
            self.valid = False
            self.matrix = None
            self.note = "Need at least 4 reference points."
            return self.to_state()

        src = np.array([[p.image_x, p.image_y] for p in self.points], dtype=np.float64)
        dst = np.array(
            [[p.workspace_x_mm, p.workspace_y_mm] for p in self.points], dtype=np.float64
        )

        # Homography via OpenCV when available; fall back to least-squares affine.
        try:
            import cv2

            H, mask = cv2.findHomography(src, dst, method=0)
            if H is None:
                raise RuntimeError("Homography failed")
            self.matrix = H
            self.method = "homography"
            projected = self._project_many(src)
        except Exception:
            # Affine: [x y 1] @ A.T = [X Y]
            A = np.column_stack([src, np.ones(len(src))])
            coef, _, _, _ = np.linalg.lstsq(A, dst, rcond=None)
            # Build 3x3
            H = np.eye(3, dtype=np.float64)
            H[0, 0:3] = coef[:, 0]
            H[1, 0:3] = coef[:, 1]
            self.matrix = H
            self.method = "affine_ls"
            projected = A @ coef

        err = np.linalg.norm(projected - dst, axis=1)
        self.rms_error_mm = float(np.sqrt(np.mean(err**2)))
        self.valid = True
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.note = f"Calibration OK via {self.method}."
        return self.to_state()

    def _project_many(self, pts: np.ndarray) -> np.ndarray:
        assert self.matrix is not None
        ones = np.ones((len(pts), 1), dtype=np.float64)
        homo = np.hstack([pts, ones])
        out = (self.matrix @ homo.T).T
        w = out[:, 2:3]
        w = np.where(np.abs(w) < 1e-9, 1e-9, w)
        return out[:, :2] / w

    def transform(self, image_x: float, image_y: float) -> Optional[tuple[float, float]]:
        if not self.valid or self.matrix is None:
            return None
        pt = np.array([[image_x, image_y]], dtype=np.float64)
        out = self._project_many(pt)[0]
        return float(out[0]), float(out[1])

    def to_state(self) -> CalibrationState:
        return CalibrationState(
            valid=self.valid,
            points=list(self.points),
            rms_error_mm=self.rms_error_mm,
            method=self.method,
            created_at=self.created_at,
            note=self.note,
        )


calibration_engine = CalibrationEngine()
