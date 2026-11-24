import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAppStore } from '../lib/store'
import { Button, Panel } from '../components/ui'

export function SettingsPage() {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const setToast = useAppStore((s) => s.setToast)

  useEffect(() => {
    api.settings().then(setForm).catch(() => undefined)
  }, [])

  function set<K extends string>(key: K, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Configuration</div>
        <h1 className="mt-1 text-3xl font-bold">Settings</h1>
      </div>
      <Panel title="Detection & camera">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-mist">
            Confidence threshold
            <input
              type="number"
              step="0.01"
              min={0.05}
              max={0.95}
              className="mt-1 w-full rounded-lg bg-soil-900 px-3 py-2 font-mono text-fog"
              value={Number(form.conf_threshold ?? 0.35)}
              onChange={(e) => set('conf_threshold', Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-mist">
            Camera index
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-soil-900 px-3 py-2 font-mono text-fog"
              value={Number(form.camera_index ?? 0)}
              onChange={(e) => set('camera_index', Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-mist">
            MJPEG quality
            <input
              type="number"
              min={40}
              max={95}
              className="mt-1 w-full rounded-lg bg-soil-900 px-3 py-2 font-mono text-fog"
              value={Number(form.mjpeg_quality ?? 75)}
              onChange={(e) => set('mjpeg_quality', Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-mist">
            Raspberry Pi base URL
            <input
              className="mt-1 w-full rounded-lg bg-soil-900 px-3 py-2 font-mono text-fog"
              placeholder="http://192.168.x.x:9000"
              value={String(form.pi_base_url ?? '')}
              onChange={(e) => set('pi_base_url', e.target.value)}
            />
          </label>
        </div>
      </Panel>
      <Panel title="Workspace extents (mm)">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-mist">
            Width
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-soil-900 px-3 py-2 font-mono"
              value={Number(form.workspace_width_mm ?? 400)}
              onChange={(e) => set('workspace_width_mm', Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-mist">
            Height
            <input
              type="number"
              className="mt-1 w-full rounded-lg bg-soil-900 px-3 py-2 font-mono"
              value={Number(form.workspace_height_mm ?? 400)}
              onChange={(e) => set('workspace_height_mm', Number(e.target.value))}
            />
          </label>
        </div>
      </Panel>
      <Panel title="Visualisation">
        <div className="flex flex-wrap gap-4 text-sm">
          {(['show_labels', 'show_confidence', 'show_ids', 'log_detections'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) => set(key, e.target.checked)}
              />
              {key}
            </label>
          ))}
        </div>
      </Panel>
      <Button
        onClick={async () => {
          await api.updateSettings(form)
          setToast('Settings saved')
        }}
      >
        Save settings
      </Button>
    </div>
  )
}
