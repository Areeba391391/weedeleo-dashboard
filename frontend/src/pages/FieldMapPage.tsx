import { lazy, Suspense, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { Badge, Panel } from '../components/ui'

const FastCanvas = lazy(() => import('../three/FastCanvas').then((m) => ({ default: m.FastCanvas })))
const FieldScene = lazy(() => import('../three/scenes/FieldScene').then((m) => ({ default: m.FieldScene })))

export function FieldMapPage() {
  const detections = useAppStore((s) => s.detections)
  const sys = useSystem()
  const [robot, setRobot] = useState<Record<string, unknown>>({})

  useEffect(() => {
    const load = () => api.robotStatus().then(setRobot)
    load().catch(() => undefined)
    const id = window.setInterval(() => load().catch(() => undefined), 2000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--brand)' }}>
            Spatial workspace
          </p>
          <h1 className="brand-display page-title mt-1">3D Field</h1>
          <p className="page-sub">
            Top-down treatment bed: detections become markers and the gantry tip seeks the selected weed. Unique scene
            for this page — not reused elsewhere as a full-screen twin.
          </p>
        </div>
        <Badge tone="info">SIMULATION + LIVE MARKERS</Badge>
      </div>

      <div className="panel overflow-hidden" style={{ height: 540, position: 'relative' }}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
              Loading field scene…
            </div>
          }
        >
          <FastCanvas className="h-full w-full" camera={[5.2, 4.6, 5.2]}>
            <FieldScene
              detections={detections}
              frameW={sys.frame_width}
              frameH={sys.frame_height}
              selectedId={sys.selected_target_id}
            />
          </FastCanvas>
        </Suspense>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="What you see">
          <ul className="space-y-2 text-base" style={{ color: 'var(--text-soft)' }}>
            <li>Tall green plants with orange fruit = crops (protected)</li>
            <li>Low bushy clusters = weeds (targeted)</li>
            <li>Red beam + wilt = treatment in progress / done</li>
            <li>Steel gantry tip moves to the next weed</li>
          </ul>
        </Panel>
        <Panel title="Robot pose (sim)">
          <p className="mono text-base">
            X {String(robot.x_m ?? '—')} m · Y {String(robot.y_m ?? '—')} m
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            {String(robot.note ?? 'Simulated pose until Pi localisation')}
          </p>
        </Panel>
        <Panel title="How to use">
          <p className="text-base" style={{ color: 'var(--text-soft)' }}>
            Drag to orbit, scroll to zoom. Select a detection in Live Vision to highlight its marker and pull the tip
            toward it.
          </p>
        </Panel>
      </div>
    </div>
  )
}
