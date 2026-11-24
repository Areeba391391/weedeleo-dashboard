import { useState } from 'react'
import { api } from '../lib/api'
import type { CalibrationPoint } from '../lib/types'
import { useAppStore, useSystem } from '../lib/store'
import { Badge, Button, Panel } from '../components/ui'

const emptyPoint = (): CalibrationPoint => ({
  image_x: 0,
  image_y: 0,
  workspace_x_mm: 0,
  workspace_y_mm: 0,
  label: '',
})

export function CalibrationPage() {
  const sys = useSystem()
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [points, setPoints] = useState<CalibrationPoint[]>(
    sys.calibration.points.length ? sys.calibration.points : [emptyPoint(), emptyPoint(), emptyPoint(), emptyPoint()],
  )

  function update(i: number, key: keyof CalibrationPoint, value: string) {
    setPoints((prev) =>
      prev.map((p, idx) =>
        idx === i
          ? {
              ...p,
              [key]: key === 'label' ? value : Number(value),
            }
          : p,
      ),
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Camera ↔ Workspace</div>
        <h1 className="mt-1 text-3xl font-bold">Calibration Studio</h1>
        <p className="mt-2 text-sm text-mist">
          Provide at least four image/workspace reference pairs. Treatment stays disabled until calibration computes successfully.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={sys.calibration.valid ? 'ok' : 'warn'}>
          {sys.calibration.valid ? 'Valid' : 'Invalid'}
        </Badge>
        {sys.calibration.rms_error_mm != null ? (
          <Badge tone="info">RMS {sys.calibration.rms_error_mm.toFixed(2)} mm</Badge>
        ) : null}
        <Badge tone="idle">{sys.calibration.method || 'No method'}</Badge>
      </div>
      <Panel title="Reference points">
        <div className="space-y-3">
          {points.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-chlorophyll/10 bg-soil-900/40 p-3 md:grid-cols-5">
              {(['image_x', 'image_y', 'workspace_x_mm', 'workspace_y_mm', 'label'] as const).map((key) => (
                <label key={key} className="text-xs text-mist">
                  {key}
                  <input
                    className="mt-1 w-full rounded-lg bg-soil-950 px-2 py-1.5 font-mono text-sm text-fog"
                    value={String(p[key] ?? '')}
                    onChange={(e) => update(i, key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPoints((p) => [...p, emptyPoint()])}>
            Add point
          </Button>
          <Button
            onClick={async () => {
              await api.setCalPoints(points)
              const result = (await api.computeCalibration()) as { valid?: boolean; note?: string }
              setToast(result.valid ? 'Calibration succeeded' : result.note || 'Calibration failed')
              refresh()
            }}
          >
            Compute calibration
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await api.clearCalibration()
              setToast('Calibration cleared')
              refresh()
            }}
          >
            Clear
          </Button>
        </div>
        {sys.calibration.note ? <p className="mt-3 text-sm text-mist">{sys.calibration.note}</p> : null}
      </Panel>
    </div>
  )
}
