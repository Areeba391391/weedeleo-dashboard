"""Video source, detector, calibration, safety gate, state machine and processing loop."""
import math, os, threading, time
import cv2, numpy as np
import config
from core import db

W, H = config.FRAME_W, config.FRAME_H


class Err(Exception):
    """Error that is returned to the dashboard as JSON."""
    def __init__(self, msg, status=409):
        super().__init__(msg); self.status = status


def sim_objects(t):
    """Moving simulated plants (used by the synthetic feed and the mock detector)."""
    return [dict(cx=W * (.5 + .38 * math.sin(t * .4 + i * 1.7)), cy=H * (.5 + .38 * math.cos(t * .3 + i * 2.3)),
                 label="weed" if i % 2 == 0 else "not_weed", conf=.6 + .35 * abs(math.sin(t * .7 + i)))
            for i in range(6)]


class Source:
    """Live camera or test video. Falls back to a synthetic feed so the app always runs."""
    def __init__(self):
        self.lock, self.cap, self.mode = threading.Lock(), None, "video"
        noise = np.random.default_rng(1).normal(0, 8, (H, W, 1))
        self.bg = np.clip(np.array([38, 58, 78]) + noise, 0, 255).astype(np.uint8)
        self.set_mode("video")

    def set_mode(self, mode):
        with self.lock:
            if self.cap:
                self.cap.release(); self.cap = None
            self.mode = mode
            src = config.CAMERA_INDEX if mode == "live" else config.TEST_VIDEO
            if mode == "live" or os.path.exists(config.TEST_VIDEO):
                cap = cv2.VideoCapture(src)
                self.cap = cap if cap.isOpened() else None

    @property
    def kind(self):
        return ("camera" if self.mode == "live" else "video") if self.cap else "simulated"

    def read(self, t):
        with self.lock:
            if self.cap:
                ok, f = self.cap.read()
                if not ok and self.mode == "video":
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0); ok, f = self.cap.read()
                if ok:
                    return cv2.resize(f, (W, H))
            f = self.bg.copy()
            for o in sim_objects(t):
                weed = o["label"] == "weed"
                cv2.circle(f, (int(o["cx"]), int(o["cy"])), 16 if weed else 24, (70, 190, 90) if weed else (40, 120, 40), -1)
            cv2.putText(f, "SIMULATED FEED", (W - 170, H - 12), cv2.FONT_HERSHEY_SIMPLEX, .5, (200, 200, 200), 1)
            return f


class Detector:
    """YOLO if models/weed.pt + ultralytics exist, otherwise a mock detector."""
    def __init__(self):
        self.model, self.error = None, None
        if os.path.exists(config.MODEL_PATH):
            try:
                from ultralytics import YOLO
                self.model = YOLO(config.MODEL_PATH)
            except Exception as e:  # optional dependency
                self.error = str(e)[:200]
                print("YOLO not loaded, using mock detector:", e)

    @property
    def name(self):
        return "yolo" if self.model else "mock"

    def detect(self, frame, t):
        if self.model:
            r = self.model(frame, imgsz=config.IMGSZ, conf=0.25, verbose=False)[0]
            out = []
            for b in r.boxes:
                x1, y1, x2, y2 = (float(v) for v in b.xyxy[0])
                out.append(dict(x1=x1, y1=y1, x2=x2, y2=y2, conf=float(b.conf),
                                label="weed" if r.names[int(b.cls)].lower() in {c.lower() for c in config.WEED_CLASSES} else "not_weed"))
            return out
        return [dict(x1=o["cx"] - 26, y1=o["cy"] - 26, x2=o["cx"] + 26, y2=o["cy"] + 26, conf=o["conf"], label=o["label"])
                for o in sim_objects(t)]


class Engine:
    def __init__(self):
        self.lock = threading.RLock()
        self.src, self.det = Source(), Detector()
        self.M = cv2.getPerspectiveTransform(np.float32(config.CAL_PX), np.float32(config.CAL_MM))
        self.mode, self.state, self.area, self.fault = "video", "IDLE", None, None
        self.interlock, self.estop_on, self.last_hb = True, False, 0.0
        self.run_id = self.run_started = self.run_ended = None
        self.jpg, self.fps, self.t0, self.thread = None, 0.0, time.time(), None
        self.laser_last, self.laser_count = None, 0
        self._reset_stats()

    # ---------- helpers ----------
    def _reset_stats(self):
        self.stats = dict(detections=0, weeds_in_area=0, treated=0, skipped=0)
        self.reasons, self.recent, self.run_faults = {}, [], []

    def log(self, level, typ, msg, **data):
        db.log(level, typ, msg, data, self.run_id)

    def touch(self):
        self.last_hb = time.time()

    def link_ok(self):
        return self.last_hb > 0 and time.time() - self.last_hb <= config.HEARTBEAT_TIMEOUT

    def pixel_to_mm(self, px, py):
        p = cv2.perspectiveTransform(np.float32([[[px, py]]]), self.M)[0][0]
        return float(p[0]), float(p[1])

    # ---------- commands ----------
    def set_area(self, a):
        with self.lock:
            if self.state == "RUNNING":
                raise Err("Stop the task before changing the area")
            try:
                x, y, w, h = (float(a[k]) for k in "xywh")
            except (KeyError, TypeError, ValueError):
                raise Err("Area needs numeric x, y, w, h", 400)
            if not (0 <= x <= 1 and 0 <= y <= 1 and w > .01 and h > .01 and x + w <= 1.0001 and y + h <= 1.0001):
                raise Err("Area values must be between 0 and 1", 400)
            self.area = dict(x=x, y=y, w=w, h=h)
            self.log("info", "area", "Working area set", **self.area)

    def clear_area(self):
        with self.lock:
            if self.state == "RUNNING":
                raise Err("Stop the task before changing the area")
            self.area = None; self.log("info", "area", "Working area cleared")

    def set_mode(self, m):
        with self.lock:
            if m not in ("live", "video"):
                raise Err("Mode must be live or video", 400)
            if self.state != "IDLE":
                raise Err("Mode can only be changed while idle")
            self.mode = m; self.src.set_mode(m)
            self.log("info", "mode", f"Mode set to {m}")

    def start(self):
        with self.lock:
            if self.state != "IDLE":
                raise Err(f"Cannot start while {self.state}")
            if not self.area:
                raise Err("Select a working area and press Set area first")
            self._reset_stats()
            self.run_id, self.run_started, self.run_ended = db.start_run(self.mode, self.area), time.time(), None
            self.state = "RUNNING"
            self.log("info", "state", f"Task started in {self.mode} mode")

    def _end_run(self):
        self.run_ended = time.time(); db.end_run(self.run_id)

    def stop(self):
        with self.lock:
            if self.state == "RUNNING":
                self.state = "IDLE"; self.log("info", "state", "Task stopped by operator"); self._end_run()

    def estop(self):
        with self.lock:
            was = self.state
            self.state, self.estop_on, self.fault = "ESTOP", True, "Emergency stop pressed"
            self.log("critical", "estop", "Emergency stop - laser disabled")
            if was == "RUNNING":
                self._end_run()

    def _fault(self, reason):
        if self.state in ("FAULT", "ESTOP"):
            return
        was = self.state
        self.state, self.fault = "FAULT", reason
        self.run_faults.append(reason)
        self.log("error", "fault", f"Fault: {reason} - laser disabled")
        if was == "RUNNING":
            self._end_run()

    def reset(self):
        with self.lock:
            if self.state not in ("FAULT", "ESTOP"):
                raise Err("Nothing to reset")
            self.state, self.fault, self.estop_on = "IDLE", None, False
            self.log("info", "state", "Reset - system idle")

    def set_interlock(self, closed):
        with self.lock:
            self.interlock = bool(closed)
            self.log("warning" if not closed else "info", "interlock", f"Interlock {'closed' if closed else 'OPEN'} (simulated)")

    # ---------- safety gate ----------
    def gate(self, d):
        """Return None if the laser may fire at this target, else the reason it is skipped."""
        if self.mode != "live": return "mode=video (laser disabled)"
        if self.state != "RUNNING": return "not running"
        if not self.link_ok(): return "link lost"
        if not self.interlock: return "interlock open"
        if self.fault or self.estop_on: return "fault active"
        if d["conf"] < config.CONF_THRESHOLD: return "low confidence"
        return None

    def laser_send(self, x_mm, y_mm):
        """Simulated laser module: replace with serial/GPIO code for the real hardware."""
        self.laser_last, self.laser_count = (round(x_mm, 1), round(y_mm, 1)), self.laser_count + 1

    # ---------- processing ----------
    def step(self, now):
        t = now - self.t0
        frame = self.src.read(t)
        dets = self.det.detect(frame, t)
        with self.lock:
            if self.state == "RUNNING" and now - self.last_hb > config.HEARTBEAT_TIMEOUT:
                self._fault("Dashboard heartbeat lost")
            a = self.area
            inside = []
            for d in dets:
                cx, cy = (d["x1"] + d["x2"]) / 2, (d["y1"] + d["y2"]) / 2
                if d["label"] == "weed" and a and a["x"] * W <= cx <= (a["x"] + a["w"]) * W and a["y"] * H <= cy <= (a["y"] + a["h"]) * H:
                    inside.append((d, cx, cy))
            self.stats["detections"], self.stats["weeds_in_area"] = len(dets), len(inside)
            if self.state == "RUNNING":
                self.recent = [r for r in self.recent if now - r[2] < config.COOLDOWN_S]
                for d, cx, cy in inside:
                    if any(abs(cx - r[0]) < config.COOLDOWN_PX and abs(cy - r[1]) < config.COOLDOWN_PX for r in self.recent):
                        continue
                    self.recent.append((cx, cy, now))
                    reason = self.gate(d)
                    if reason:
                        self.stats["skipped"] += 1
                        self.reasons[reason] = self.reasons.get(reason, 0) + 1
                        self.log("info", "skip", f"Skipped target: {reason}", conf=round(d["conf"], 2))
                    else:
                        x, y = self.pixel_to_mm(cx, cy)
                        self.laser_send(x, y); self.stats["treated"] += 1
                        self.log("info", "treat", f"Treated weed at X={x:.1f} mm, Y={y:.1f} mm", conf=round(d["conf"], 2))
            mode, state = self.mode, self.state
        for d in dets:
            col = (60, 60, 230) if d["label"] == "weed" else (60, 190, 60)
            p1, p2 = (int(d["x1"]), int(d["y1"])), (int(d["x2"]), int(d["y2"]))
            cv2.rectangle(frame, p1, p2, col, 2)
            cv2.putText(frame, f'{d["label"]} {d["conf"]:.2f}', (p1[0], max(12, p1[1] - 5)), cv2.FONT_HERSHEY_SIMPLEX, .45, col, 1, cv2.LINE_AA)
        if a:
            cv2.rectangle(frame, (int(a["x"] * W), int(a["y"] * H)), (int((a["x"] + a["w"]) * W), int((a["y"] + a["h"]) * H)), (255, 160, 0), 2)
        cv2.putText(frame, f"{mode.upper()} | {state}", (8, 20), cv2.FONT_HERSHEY_SIMPLEX, .55, (255, 255, 255), 2, cv2.LINE_AA)
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            self.jpg = buf.tobytes()

    def loop(self):
        while True:
            t0 = time.time()
            try:
                self.step(t0)
            except Exception as e:
                db.log("error", "exception", f"Pipeline error: {e}"); time.sleep(.5)
            time.sleep(max(0, 1 / config.TARGET_FPS - (time.time() - t0)))
            self.fps = .9 * self.fps + .1 / max(time.time() - t0, 1e-3)

    def start_thread(self):
        if not self.thread:
            self.thread = threading.Thread(target=self.loop, daemon=True); self.thread.start()
            db.log("info" if not self.det.error else "error", "system", f"Dashboard started (detector: {self.det.name})" + (f" - model failed to load: {self.det.error}" if self.det.error else ""))

    # ---------- views ----------
    def snapshot(self):
        with self.lock:
            age = round(time.time() - self.last_hb, 1) if self.last_hb else None
            return dict(mode=self.mode, state=self.state, area=self.area, fault_reason=self.fault, run_id=self.run_id,
                        link=dict(type=config.LINK_TYPE, ok=self.link_ok(), last_heartbeat_age_s=age),
                        device=dict(laser_module="simulated", interlock_closed=self.interlock, estop=self.estop_on,
                                    camera=self.src.kind, detector=self.det.name, laser_last=self.laser_last),
                        stats=dict(self.stats, fps=round(self.fps, 1), uptime_s=int(time.time() - self.t0)))

    def report(self):
        with self.lock:
            end = self.run_ended or (time.time() if self.state == "RUNNING" else None)
            return dict(run_id=self.run_id, mode=self.mode, state=self.state,
                        duration_s=round(end - self.run_started, 1) if self.run_started and end else 0,
                        treated=self.stats["treated"], skipped=self.stats["skipped"],
                        skip_reasons=dict(self.reasons), faults=list(self.run_faults), area=self.area)
