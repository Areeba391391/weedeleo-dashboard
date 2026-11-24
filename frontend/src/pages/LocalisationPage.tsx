import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { VideoFeed } from '../components/VideoFeed'
import { Workspace3DLazy } from '../components/Workspace3DLazy'
import { Badge, Button, Panel } from '../components/ui'
import { num } from '../lib/utils'

export function LocalisationPage() {
  const sys = useSystem()
  const detections = useAppStore((s) => s.detections)
  const refresh = useAppStore((s) => s.refresh)
  const setToast = useAppStore((s) => s.setToast)
  const selected = detections.find((d) => d.id === sys.selected_target_id) || detections[0]

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Coordinate Mapping</div>
        <h1 className="mt-1 text-3xl font-bold">Target Localisation</h1>
        <p className="mt-2 text-sm text-mist">
          Pixel coordinates are always available from detection. Workspace millimetres appear only when calibration is valid.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Camera frame">
          <VideoFeed detections={detections} onSelectDetection={(id) => api.selectTarget(id).then(refresh)} />
        </Panel>
        <Panel title="Physical workspace">
          <Workspace3DLazy detections={detections} />
        </Panel>
      </div>
      <Panel
        title="Selected target"
        action={
          <Badge tone={sys.calibration.valid ? 'ok' : 'warn'}>
            {sys.calibration.valid ? 'Calibrated' : 'Uncalibrated'}
          </Badge>
        }
      >
        {!selected ? (
          <p className="text-sm text-mist">No detection selected.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono text-sm">
            <div>ID<span className="mt-1 block text-chlorophyll">#{selected.id}</span></div>
            <div>Class<span className="mt-1 block">{selected.class_name}</span></div>
            <div>Confidence<span className="mt-1 block">{(selected.confidence * 100).toFixed(1)}%</span></div>
            <div>Status<span className="mt-1 block">{selected.status}</span></div>
            <div>Image X<span className="mt-1 block">{num(selected.cx, 1)} px</span></div>
            <div>Image Y<span className="mt-1 block">{num(selected.cy, 1)} px</span></div>
            <div>
              Workspace X
              <span className="mt-1 block text-amber-signal">
                {selected.workspace_x_mm == null ? 'unavailable' : `${num(selected.workspace_x_mm)} mm`}
              </span>
            </div>
            <div>
              Workspace Y
              <span className="mt-1 block text-amber-signal">
                {selected.workspace_y_mm == null ? 'unavailable' : `${num(selected.workspace_y_mm)} mm`}
              </span>
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            disabled={!selected}
            onClick={() => selected && api.selectTarget(selected.id).then(refresh)}
          >
            Select
          </Button>
          <Button
            variant="secondary"
            disabled={!selected}
            onClick={async () => {
              if (!selected) return
              try {
                await api.commandTarget(selected.id)
                setToast('Command issued (see status for ack/completion)')
                refresh()
              } catch (e) {
                setToast(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Command (safety-gated)
          </Button>
        </div>
      </Panel>
    </div>
  )
}
