"""Weedeleo dashboard backend. Run: python app.py  ->  http://localhost:5000"""
import os, threading, time, webbrowser
from flask import Flask, Response, jsonify, request
import config
from core import db
from core.engine import Engine, Err

app = Flask(__name__, static_folder="static", static_url_path="")
engine = Engine()


def ok(**kw):
    return jsonify(ok=True, **kw)


@app.errorhandler(Err)
def on_err(e):
    return jsonify(ok=False, error=str(e)), e.status


@app.errorhandler(404)
def on_404(e):
    return jsonify(ok=False, error="Not found"), 404


@app.errorhandler(Exception)
def on_exc(e):
    db.log("error", "exception", f"Server error: {e}")
    return jsonify(ok=False, error="Internal server error"), 500


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/video")
def video():
    def gen():
        while True:
            if engine.jpg:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + engine.jpg + b"\r\n"
            time.sleep(.06)
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/api/state")
def state():
    engine.touch()  # polling doubles as the dashboard heartbeat
    return ok(**engine.snapshot())


@app.route("/api/area", methods=["POST"])
def area():
    engine.set_area(request.get_json(silent=True)); return ok(area=engine.area)


@app.route("/api/area/clear", methods=["POST"])
def area_clear():
    engine.clear_area(); return ok()


@app.route("/api/mode", methods=["POST"])
def mode():
    engine.set_mode((request.get_json(silent=True) or {}).get("mode")); return ok(mode=engine.mode)


@app.route("/api/<cmd>", methods=["POST"])
def command(cmd):
    if cmd not in ("start", "stop", "estop", "reset"):
        raise Err("Unknown command", 404)
    getattr(engine, cmd)(); return ok(state=engine.state)


@app.route("/api/sim/interlock", methods=["POST"])
def interlock():
    engine.set_interlock((request.get_json(silent=True) or {}).get("closed", True)); return ok()


@app.route("/api/logs")
def logs():
    return ok(logs=db.recent(request.args.get("limit", 200), request.args.get("level", ""), request.args.get("q", "")))


@app.route("/api/logs/export")
def export():
    return Response(db.export_csv(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=weedeleo_logs.csv"})


@app.route("/api/report")
def report():
    return ok(report=engine.report())


if __name__ == "__main__":
    engine.start_thread()
    if not os.environ.get("WEEDELEO_NO_BROWSER"):
        threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{config.PORT}")).start()
    print(f"\nWeedeleo dashboard: http://localhost:{config.PORT}  (Raspberry Pi: http://<pi-ip>:{config.PORT})\n")
    app.run(host=config.HOST, port=config.PORT, threaded=True, debug=False)
