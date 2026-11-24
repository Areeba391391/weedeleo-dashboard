import { useState } from 'react'
import { motion } from 'framer-motion'
import { OctagonX, Play, RotateCcw, Square, Video } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { VideoFeed } from '../components/VideoFeed'
import { Workspace3DLazy } from '../components/Workspace3DLazy'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Button, Panel, StatCard } from '../components/ui'
import { formatDuration, num } from '../lib/utils'

export function CommandCentre() {
  const sys = useSystem()
  const detections = useAppStore((s) => s.detections)
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [confirmEstop, setConfirmEstop] = useState(false)

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn()
      setToast(ok)
      await refresh()
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-mist">Command Centre</div>
          <h1 className="glow-text mt-1 text-3xl font-bold text-fog md:text-4xl">
            WEEDELEO <span className="text-chlorophyll">Operational Overview</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-mist">
            Vision-guided weed detection and precision treatment control for a bounded XY workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              run(async () => {
                await api.setMode('live')
                await api.start()
              }, 'Live session started')
            }
          >
            <Play className="h-4 w-4" /> Start Live
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              run(async () => {
                await api.setMode('test_video')
                await api.start()
              }, 'Test video session started (hardware isolated)')
            }
          >
            <Video className="h-4 w-4" /> Start Test
          </Button>
          <Button variant="secondary" onClick={() => run(() => api.stop(), 'Stopped')}>
            <Square className="h-4 w-4" /> Stop
          </Button>
          <Button variant="secondary" onClick={() => run(() => api.reset(), 'View reset')}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button variant="danger" onClick={() => setConfirmEstop(true)}>
            <OctagonX className="h-4 w-4" /> E-Stop
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total detections" value={sys.stats.total} />
        <StatCard label="Weeds" value={sys.stats.weeds} accent="laser" />
        <StatCard label="Inside working area" value={sys.stats.inside_workspace} accent="amber" />
        <StatCard
          label="FPS"
          value={num(sys.fps)}
          accent="crop"
          hint={`Session ${formatDuration(sys.session_duration_s)}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Main camera workspace"
          action={
            <Badge tone={sys.camera_connected ? 'ok' : 'warn'}>
              {sys.camera_connected ? 'Signal' : 'No signal'}
            </Badge>
          }
        >
          <VideoFeed
            detections={detections}
            onSelectDetection={(id) => api.selectTarget(id).then(refresh)}
          />
        </Panel>
        <div className="space-y-4">
          <Panel title="System state">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-mist">Mode</dt>
                <dd className="font-mono text-chlorophyll">{sys.mode}</dd>
              </div>
              <div>
                <dt className="text-mist">Session</dt>
                <dd className="font-mono text-xs">{sys.session_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-mist">Model</dt>
                <dd className="font-mono text-xs">
                  {sys.model_loaded ? sys.model_name : 'not loaded'}
                </dd>
              </div>
              <div>
                <dt className="text-mist">Calibration</dt>
                <dd>{sys.calibration.valid ? 'Valid' : 'Invalid'}</dd>
              </div>
              <div>
                <dt className="text-mist">Pi link</dt>
                <dd>{sys.comms.active_link}</dd>
              </div>
              <div>
                <dt className="text-mist">Safety</dt>
                <dd>{sys.safety.treatment_allowed ? 'Treatment allowed' : 'Treatment locked'}</dd>
              </div>
            </dl>
            {!sys.safety.treatment_allowed && (
              <ul className="mt-3 space-y-1 text-xs text-amber-signal">
                {sys.safety.reasons.slice(0, 5).map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="XY workspace preview">
            <Workspace3DLazy detections={detections} />
          </Panel>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Treated (completed)" value={sys.stats.treated} hint="Verified completions only" />
            <StatCard label="Skipped" value={sys.stats.skipped} accent="amber" />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmEstop}
        title="Engage emergency stop?"
        body="This latches a software E-Stop, stops the session, and commands the control unit to halt. Clear it explicitly before resuming."
        confirmLabel="Engage E-Stop"
        danger
        onCancel={() => setConfirmEstop(false)}
        onConfirm={() => {
          setConfirmEstop(false)
          run(() => api.estop(), 'Emergency stop latched')
        }}
      />
    </div>
  )
}
