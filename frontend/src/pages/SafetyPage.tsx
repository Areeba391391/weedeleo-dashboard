import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { Badge, Button, Panel } from '../components/ui'

export function SafetyPage() {
  const sys = useSystem()
  const s = sys.safety
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)

  const checks = [
    { label: 'Emergency stop', ok: !s.estop },
    { label: 'Enclosure closed', ok: s.enclosure_closed },
    { label: 'Interlock', ok: s.interlock_ok },
    { label: 'Camera', ok: s.camera_ok },
    { label: 'Communication', ok: s.comm_ok },
    { label: 'Calibration', ok: s.calibration_valid },
    { label: 'Working area', ok: s.working_area_set },
    { label: 'No hardware fault', ok: !s.fault_active },
    { label: 'Mode allows treatment', ok: s.mode_safe },
  ]

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Safety Centre</div>
        <h1 className="mt-1 text-3xl font-bold">Treatment Permission Gate</h1>
        <p className="mt-2 text-sm text-mist">
          Software indicators never replace the physical interlock chain. The Raspberry Pi and hardware remain authoritative.
        </p>
      </div>
      <Badge tone={s.treatment_allowed ? 'ok' : 'danger'}>
        {s.treatment_allowed ? 'TREATMENT ALLOWED' : 'TREATMENT LOCKED'}
      </Badge>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((c) => (
          <div key={c.label} className="rounded-2xl border border-chlorophyll/10 bg-soil-900/50 p-4">
            <div className="text-sm text-fog">{c.label}</div>
            <div className={`mt-2 font-mono text-lg ${c.ok ? 'text-chlorophyll' : 'text-laser'}`}>
              {c.ok ? 'PASS' : 'BLOCK'}
            </div>
          </div>
        ))}
      </div>
      <Panel title="Active block reasons">
        {s.reasons.length === 0 ? (
          <p className="text-sm text-chlorophyll">No active software blocks.</p>
        ) : (
          <ul className="space-y-1 text-sm text-amber-signal">
            {s.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        )}
        {s.last_safety_event ? <p className="mt-3 text-xs text-mist">Last: {s.last_safety_event}</p> : null}
      </Panel>
      <Panel title="Lab interlock feedback (until GPIO bridge)">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => api.setInterlock({ enclosure_closed: true, interlock_ok: true }).then(refresh)}
          >
            Mark enclosure/interlock OK
          </Button>
          <Button
            variant="secondary"
            onClick={() => api.setInterlock({ enclosure_closed: false }).then(refresh)}
          >
            Enclosure open
          </Button>
          <Button variant="danger" onClick={() => api.estop().then(refresh)}>
            E-Stop
          </Button>
          <Button
            onClick={() =>
              api
                .clearEstop()
                .then(refresh)
                .then(() => setToast('E-Stop cleared'))
            }
          >
            Clear E-Stop
          </Button>
        </div>
      </Panel>
    </div>
  )
}
