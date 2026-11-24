# Weedeleo dashboard

Web dashboard for the Weedeleo weed-detection and laser-treatment prototype (Flask + plain HTML/CSS/JS).
It runs on a normal laptop with no Raspberry Pi, camera, laser or model: it uses a simulated feed, a mock detector and a simulated laser module.

## Run (laptop)
- **Windows (Python 3.12):** double-click `run.bat`. It creates the virtual environment and installs everything from the `wheels` folder (works offline). First start takes about a minute.
- **Linux / Mac:** `./run.sh`
- Manual: `pip install -r requirements.txt` then `python app.py`, and open http://localhost:5000

## How to use
1. Drag a rectangle on the video, press **Set area**.
2. Press **Start**. In *Test video* mode the laser is always disabled (targets are logged as skipped).
3. Stop, switch to *Live camera* (falls back to the simulated feed if no camera), press **Start** again: weeds inside the area are "treated" (simulated laser).
4. Untick **Interlock closed** to see targets skipped with the reason. Closing the browser tab while running triggers a FAULT (heartbeat timeout).
5. **Task report** and **Export CSV** give the data for your final report.

## Use your own data
- Test video: put `assets/test.mp4` in place (looped automatically).
- YOLO model: `pip install ultralytics`, put `models/weed.pt` in place, set `WEED_CLASSES` in `config.py` to your weed class names.
- Calibration: set `CAL_PX` (image points) and `CAL_MM` (measured workspace points) in `config.py`.
- Camera: `CAMERA_INDEX` in `config.py`.
- Real laser module: replace `Engine.laser_send()` in `core/engine.py` with your serial/GPIO code.

## Raspberry Pi
Copy the folder, run `./run.sh`, then open `http://<pi-ip>:5000` from the laptop on the same Wi-Fi (or the Pi's hotspot).
Use a small YOLO model and `IMGSZ = 320` (NCNN/ONNX export helps).

## Tests
`pip install pytest` then `python -m pytest tests -q`

## Safety
The software Stop and Emergency stop are NOT a substitute for the hardware interlocks and physical emergency stop. The laser is only commanded in Live mode, while running, with the link up, interlock closed, no fault, and confidence above `CONF_THRESHOLD`.
Bluetooth fallback is not implemented in this version (the Wi-Fi link and heartbeat are).

## Using your trained model (best.pt)
1. Run `install_yolo.bat` once (internet needed; installs ultralytics + PyTorch).
2. Copy your `best.pt` into the `models` folder.
3. Run `run.bat`. The chip must show "Detector: yolo". If it says "mock", open the Logs panel: the reason the model failed to load is logged there.
Class names are matched without case, so a class called `Weed` works with `WEED_CLASSES = {"weed"}`.
