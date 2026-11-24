# WEEDELEO — Vision-Guided Weed Detection Control Station

Professional FYP software for crop/weed detection with simulated robot & laser layers ready for future Raspberry Pi hardware.

## What’s included

- **Frontend:** React + TypeScript + Vite + Tailwind (light agricultural product UI)
- **Backend:** FastAPI + Ultralytics YOLO + OpenCV + WebSockets + SQLite
- **Model:** `backend/models/best.pt` (7 classes from your training package)
- **Hardware layer:** simulated robot + simulated laser (clearly labelled; not real hardware)

### Model classes (from `best.pt`)

| Role | Classes |
|------|---------|
| Crop (protect) | Herb Paris, Bitter gourd, Sponge gourd, Okra |
| Weed (treatable) | Small weed, Grass, Horseweed |

## Run locally

```powershell
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Or: `.\start.ps1`

- Dashboard: http://localhost:5173
- API docs: http://localhost:8000/docs

## Navigation

Overview · Live Detection · Robot Control · Field · Detection History · System

## Safety

- Test video never arms treatment claims as live hardware success
- Robot/laser are **SIMULATION** until Pi controllers are wired
- Software E-Stop / interlocks do not replace physical safety hardware
