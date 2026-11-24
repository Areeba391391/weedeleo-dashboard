import { useAppStore } from '../lib/store'
import { Workspace3DLazy } from '../components/Workspace3DLazy'
import { Panel } from '../components/ui'

export function Workspace3DPage() {
  const detections = useAppStore((s) => s.detections)
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Signature View</div>
        <h1 className="mt-1 text-3xl font-bold">Interactive 3D XY Workspace</h1>
        <p className="mt-2 text-sm text-mist">
          Explore the treatment plane, working-area boundary, weed markers and gantry head. Motion is shown only from real telemetry or explicit simulation.
        </p>
      </div>
      <Panel>
        <Workspace3DLazy detections={detections} />
      </Panel>
    </div>
  )
}
