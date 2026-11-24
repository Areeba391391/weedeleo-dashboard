import { lazy, Suspense, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAppStore } from '../lib/store'
import { Badge, Button, Panel } from '../components/ui'

const FastCanvas = lazy(() => import('../three/FastCanvas').then((m) => ({ default: m.FastCanvas })))
const RobotScene = lazy(() => import('../three/scenes/RobotScene').then((m) => ({ default: m.RobotScene })))

export function RobotControlPage() {
  const setToast = useAppStore((s) => s.setToast)
  const [robot, setRobot] = useState<Record<string, unknown>>({})
  const [laser, setLaser] = useState<Record<string, unknown>>({})

  const refreshHw = async () => {
    const [r, l] = await Promise.all([api.robotStatus(), api.laserStatus()])
    setRobot(r)
    setLaser(l)
  }

  useEffect(() => {
    refreshHw().catch(() => undefined)
    const id = window.setInterval(() => refreshHw().catch(() => undefined), 1500)
    return () => window.clearInterval(id)
  }, [])

  async function move(dir: string) {
    try {
      await api.robotMove(dir)
      await refreshHw()
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    }
  }

  const x = Number(robot.x_m ?? 0)
  const y = Number(robot.y_m ?? 0)
  const heading = Number(robot.heading_deg ?? 0)

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--brand)' }}>
            Actuation
          </p>
          <h1 className="brand-display page-title mt-1">Robot Control</h1>
          <p className="page-sub">
            Drive the simulated ground rover and watch it move in a dedicated 3D lane scene. Physical motors stay off
            until Raspberry Pi integration.
          </p>
        </div>
        <Badge tone="info">SIMULATED HARDWARE</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.85fr]">
        <div className="panel overflow-hidden" style={{ height: 500, position: 'relative' }}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                Loading robot scene…
              </div>
            }
          >
            <FastCanvas className="h-full w-full" camera={[5.2, 4.2, 6.2]}>
              <RobotScene x={x} y={y} heading={heading} />
            </FastCanvas>
          </Suspense>
        </div>

        <div className="space-y-4">
          <Panel title="Manual drive">
            <div className="mx-auto grid w-[240px] grid-cols-3 place-items-center gap-2 py-2">
              <div />
              <Button className="!h-14 !w-14 !rounded-2xl !px-0" variant="secondary" onClick={() => move('forward')} aria-label="Forward">
                ↑
              </Button>
              <div />
              <Button className="!h-14 !w-14 !rounded-2xl !px-0" variant="secondary" onClick={() => move('left')} aria-label="Left">
                ←
              </Button>
              <Button className="!h-14 !w-14 !rounded-2xl !px-0" variant="danger" onClick={() => move('stop')} aria-label="Stop">
                STOP
              </Button>
              <Button className="!h-14 !w-14 !rounded-2xl !px-0" variant="secondary" onClick={() => move('right')} aria-label="Right">
                →
              </Button>
              <div />
              <Button className="!h-14 !w-14 !rounded-2xl !px-0" variant="secondary" onClick={() => move('backward')} aria-label="Backward">
                ↓
              </Button>
              <div />
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => api.robotStart().then(refreshHw)}>Start</Button>
              <Button variant="secondary" onClick={() => api.robotStop().then(refreshHw)}>
                Stop
              </Button>
            </div>
            <p className="mono mt-4 text-base font-semibold">
              X {String(robot.x_m ?? 0)} m · Y {String(robot.y_m ?? 0)} m · {String(robot.state ?? 'IDLE')}
            </p>
          </Panel>

          <Panel title="Laser simulation">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => api.laserEnable().then(refreshHw)}>
                Enable sim
              </Button>
              <Button variant="secondary" onClick={() => api.laserDisable().then(refreshHw)}>
                Disable
              </Button>
              <Button
                onClick={() =>
                  api
                    .laserTest()
                    .then(() => setToast('SIMULATED TREATMENT logged'))
                    .then(refreshHw)
                    .catch((e) => setToast(String(e.message || e)))
                }
              >
                Simulate treatment
              </Button>
            </div>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-soft)' }}>
              Events: {String(laser.events ?? 0)}. Never claims a physical laser fired.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
