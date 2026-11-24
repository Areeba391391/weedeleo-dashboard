import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { Panel, StatCard } from '../components/ui'

interface Summary {
  total_detections: number
  weed_detections: number
  non_weed_detections: number
  inside_workspace: number
  treated: number
  skipped: number
  sessions: number
  safety_events: number
  detection_trend: { day: string; count: number }[]
  confidence_distribution: Record<string, number>
  fps_history?: { t: number; fps: number }[]
  current_fps?: number
}

export function AnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    const load = () => api.analytics().then((d) => setData(d as unknown as Summary)).catch(() => setData(null))
    load()
    const id = window.setInterval(load, 4000)
    return () => window.clearInterval(id)
  }, [])

  const confData = Object.entries(data?.confidence_distribution || {}).map(([bucket, count]) => ({
    bucket,
    count,
  }))

  const fpsData = (data?.fps_history || []).map((p, i) => ({
    i,
    fps: Number(p.fps.toFixed(2)),
  }))

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Insights</div>
        <h1 className="mt-1 text-3xl font-bold">Analytics & Statistics</h1>
        <p className="mt-2 text-sm text-mist">
          Values are computed from recorded sessions and detection logs — never invented.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total detections" value={data?.total_detections ?? '—'} />
        <StatCard label="Weeds" value={data?.weed_detections ?? '—'} accent="laser" />
        <StatCard label="Treated (completed)" value={data?.treated ?? '—'} />
        <StatCard label="Skipped" value={data?.skipped ?? '—'} accent="amber" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Detection trend">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.detection_trend || []}>
                <CartesianGrid stroke="rgba(124,255,154,0.08)" />
                <XAxis dataKey="day" stroke="#9bb5a6" fontSize={11} />
                <YAxis stroke="#9bb5a6" fontSize={11} />
                <Tooltip contentStyle={{ background: '#0b1f14', border: '1px solid #2f6b4f' }} />
                <Line type="monotone" dataKey="count" stroke="#7cff9a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Confidence distribution">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={confData}>
                <CartesianGrid stroke="rgba(124,255,154,0.08)" />
                <XAxis dataKey="bucket" stroke="#9bb5a6" fontSize={11} />
                <YAxis stroke="#9bb5a6" fontSize={11} />
                <Tooltip contentStyle={{ background: '#0b1f14', border: '1px solid #2f6b4f' }} />
                <Bar dataKey="count" fill="#4db6ff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel
        title="Inference FPS history"
        action={
          <span className="font-mono text-xs text-chlorophyll">
            now {data?.current_fps != null ? data.current_fps.toFixed(1) : '—'}
          </span>
        }
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fpsData}>
              <CartesianGrid stroke="rgba(124,255,154,0.08)" />
              <XAxis dataKey="i" hide />
              <YAxis stroke="#9bb5a6" fontSize={11} domain={[0, 'auto']} />
              <Tooltip contentStyle={{ background: '#0b1f14', border: '1px solid #2f6b4f' }} />
              <Line type="monotone" dataKey="fps" stroke="#f0b429" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {fpsData.length === 0 ? (
          <p className="mt-2 text-xs text-mist">FPS samples appear once a live or test-video session is processing frames.</p>
        ) : null}
      </Panel>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Sessions" value={data?.sessions ?? '—'} accent="crop" />
        <StatCard label="Inside workspace" value={data?.inside_workspace ?? '—'} />
        <StatCard label="Safety events" value={data?.safety_events ?? '—'} accent="laser" />
      </div>
    </div>
  )
}
