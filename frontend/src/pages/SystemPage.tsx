import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { Badge, Button, Metric, Panel } from '../components/ui'

export function SystemPage() {
  const sys = useSystem()
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [model, setModel] = useState<Record<string, unknown>>({})
  const [form, setForm] = useState<Record<string, unknown>>({})

  useEffect(() => {
    api.model().then(setModel).catch(() => undefined)
    api.settings().then(setForm).catch(() => undefined)
  }, [sys.model_loaded, sys.conf_threshold])

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--brand)' }}>
          Configuration
        </p>
        <h1 className="brand-display page-title mt-1">System</h1>
        <p className="page-sub">Model status, thresholds, camera index, and safety controls — large readable controls.</p>
      </div>

      <Panel title="AI model">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="File" value={String(model.name ?? '—')} />
          <Metric label="Status" value={model.loaded ? 'READY' : 'ERROR'} />
          <Metric label="Classes" value={Array.isArray(model.class_list) ? (model.class_list as string[]).length : '—'} />
          <Metric label="Confidence" value={String(model.conf_threshold ?? '—')} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {((model.class_list as string[]) || sys.model_classes || []).map((c) => (
            <Badge key={c} tone="idle">
              {c}
            </Badge>
          ))}
        </div>
      </Panel>

      <Panel title="Settings">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-base font-semibold" style={{ color: 'var(--text-soft)' }}>
            Confidence threshold
            <input
              type="number"
              step="0.01"
              min={0.05}
              max={0.95}
              className="input mono mt-2"
              value={Number(form.conf_threshold ?? 0.35)}
              onChange={(e) => setForm((f) => ({ ...f, conf_threshold: Number(e.target.value) }))}
            />
          </label>
          <label className="text-base font-semibold" style={{ color: 'var(--text-soft)' }}>
            Camera index
            <input
              type="number"
              className="input mono mt-2"
              value={Number(form.camera_index ?? 0)}
              onChange={(e) => setForm((f) => ({ ...f, camera_index: Number(e.target.value) }))}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              await api.updateSettings(form)
              setToast('Settings saved')
              refresh()
            }}
          >
            Save settings
          </Button>
          <Button variant="danger" onClick={() => api.estop().then(refresh)}>
            Emergency stop
          </Button>
          <Button variant="secondary" onClick={() => api.clearEstop().then(refresh)}>
            Clear E-Stop
          </Button>
        </div>
      </Panel>
    </div>
  )
}
