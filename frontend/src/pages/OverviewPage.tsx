import { Link } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { Button, Metric, StatusPill } from '../components/ui'
import type { AppEvent } from '../lib/types'
import { num } from '../lib/utils'

const FastCanvas = lazy(() => import('../three/FastCanvas').then((m) => ({ default: m.FastCanvas })))
const OverviewScene = lazy(() => import('../three/scenes/OverviewScene').then((m) => ({ default: m.OverviewScene })))

export function OverviewPage() {
  const sys = useSystem() as ReturnType<typeof useSystem> & { inference_ms?: number }
  const detections = useAppStore((s) => s.detections)
  const connected = useAppStore((s) => s.connected)
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [events, setEvents] = useState<AppEvent[]>([])

  useEffect(() => {
    api.logs({ limit: 6 }).then((r) => setEvents(r.events as AppEvent[])).catch(() => undefined)
  }, [sys.session_id, sys.running])

  const weeds = detections.filter((d) => d.role === 'weed' || d.treatable).length
  const crops = detections.filter((d) => d.role === 'crop' || !d.treatable).length

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--brand)' }}>
            Mission overview
          </p>
          <h1 className="brand-display page-title mt-1">Field status</h1>
          <p className="page-sub">
            Live pulse of the vision pipeline, model, and simulated treatment bed — built for judges and operators who
            need clarity first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              api
                .setMode('live')
                .then(() => api.start())
                .then(refresh)
                .then(() => setToast('Live vision started'))
                .catch((e) => setToast(String(e.message || e)))
            }
          >
            Start live vision
          </Button>
          <Link to="/app/live" className="btn btn-secondary">
            Open vision studio
          </Link>
          <Link to="/app/robot" className="btn btn-ghost">
            Drive robot
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel overflow-hidden"
          style={{ minHeight: 360 }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <strong>Living test bed</strong>
            <span className="chip">{sys.running ? 'Scanning' : 'Idle preview'}</span>
          </div>
          <div style={{ height: 340, position: 'relative' }}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                  Loading scene…
                </div>
              }
            >
              <FastCanvas className="h-full w-full" camera={[4.6, 3.5, 4.6]}>
                <OverviewScene weedCount={weeds} cropCount={crops} running={!!sys.running} />
              </FastCanvas>
            </Suspense>
          </div>
          <p className="px-4 py-3 text-sm" style={{ color: 'var(--text-soft)' }}>
            Living bed demo — gantry treats weeds until they wilt; crop plants are left alone.
          </p>
        </motion.div>

        <div className="space-y-4">
          <div className="panel p-4">
            <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--text)' }}>
              System pulse
            </h2>
            <div className="flex flex-wrap gap-2">
              <StatusPill label="Backend" state={connected ? 'ready' : 'error'} />
              <StatusPill label="Model" state={sys.model_loaded ? 'ready' : 'error'} />
              <StatusPill label="Camera" state={sys.camera_connected ? 'ready' : 'idle'} />
              <StatusPill label="Robot" state="sim" />
              <StatusPill label="Laser" state="sim" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="FPS" value={num(sys.fps)} />
              <Metric label="Crops" value={crops} />
              <Metric label="Weeds" value={weeds} />
              <Metric label="Infer ms" value={sys.inference_ms != null ? num(sys.inference_ms, 0) : '—'} />
            </div>
          </div>

          <div className="panel p-4">
            <h2 className="mb-2 text-sm font-bold">Trained model</h2>
            <p className="mono text-base font-semibold" style={{ color: 'var(--brand)' }}>
              {sys.model_name || 'not loaded'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {sys.model_classes.slice(0, 8).map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <h2 className="mb-2 text-sm font-bold">Recent events</h2>
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  No events yet — start live vision to generate activity.
                </p>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="border-b pb-2 text-sm last:border-0" style={{ borderColor: 'var(--line)' }}>
                    <div className="mono text-xs" style={{ color: 'var(--accent)' }}>
                      {e.ts.slice(11, 19)} · {e.event_type}
                    </div>
                    <div style={{ color: 'var(--text-soft)' }}>{e.description}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
