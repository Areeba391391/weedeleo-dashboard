import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../lib/api'
import type { AppEvent } from '../lib/types'
import { useTheme } from '../lib/theme'
import { Button, Metric, Panel } from '../components/ui'

function useChartTheme() {
  const theme = useTheme((s) => s.theme)
  return useMemo(() => {
    const light = theme === 'light'
    return {
      brand: light ? '#1b6b45' : '#4ade80',
      accent: light ? '#c2410c' : '#fb923c',
      crop: light ? '#15803d' : '#86efac',
      muted: light ? '#5b6d63' : '#a7b8ae',
      line: light ? '#d5e0d7' : '#2c3b33',
      surface: light ? '#ffffff' : '#18241d',
      text: light ? '#132019' : '#f2f7f3',
      treated: light ? '#a16207' : '#f0b429',
    }
  }, [theme])
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  const colors = useChartTheme()
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border px-3 py-2 text-sm shadow" style={{ background: colors.surface, borderColor: colors.line, color: colors.text }}>
      {label ? <div className="mb-1 font-semibold">{label}</div> : null}
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="mono font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function DetectionHistoryPage() {
  const colors = useChartTheme()
  const [events, setEvents] = useState<AppEvent[]>([])
  const [detections, setDetections] = useState<Record<string, unknown>[]>([])
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [q, setQ] = useState('')
  const [severity, setSeverity] = useState('')

  const load = async () => {
    const [logs, dets, summary] = await Promise.all([
      api.logs({
        ...(q ? { q } : {}),
        ...(severity ? { severity } : {}),
        limit: 400,
      }),
      api.detectionLogs({ limit: 300 }),
      api.analytics(),
    ])
    setEvents(logs.events as AppEvent[])
    setDetections(dets.detections || [])
    setStats(summary as Record<string, unknown>)
  }

  useEffect(() => {
    load().catch(() => undefined)
    const id = window.setInterval(() => load().catch(() => undefined), 8000)
    return () => window.clearInterval(id)
  }, [])

  const weeds = Number(stats.weed_detections ?? 0)
  const crops = Number(stats.crop_detections ?? stats.non_weed_detections ?? 0)
  const treated = Number(stats.weeds_treated ?? stats.treated ?? 0)
  const skipped = Number(stats.skipped ?? 0)

  const composition = [
    { name: 'Weeds detected', value: weeds, color: colors.accent },
    { name: 'Crops detected', value: crops, color: colors.crop },
    { name: 'Weeds treated', value: treated, color: colors.treated },
  ].filter((d) => d.value > 0)

  const trend = ((stats.detection_trend as { day: string; count?: number; weeds?: number; treated?: number }[]) || []).map((d) => ({
    day: String(d.day).slice(5),
    total: Number(d.count ?? 0),
    weeds: Number(d.weeds ?? 0),
    treated: Number(d.treated ?? 0),
  }))

  const confData = Object.entries((stats.confidence_distribution as Record<string, number>) || {}).map(([bucket, count]) => ({
    bucket,
    count: Number(count),
  }))

  const classBars = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of detections) {
      const key = String(d.class_name || 'unknown')
      map.set(key, (map.get(key) || 0) + 1)
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [detections])

  const outcome = [
    { name: 'Treated', value: treated, color: colors.treated },
    { name: 'Skipped', value: skipped, color: colors.muted },
    { name: 'Logged weeds', value: Math.max(0, weeds - treated), color: colors.accent },
  ].filter((d) => d.value > 0)

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--brand)' }}>
            Records
          </p>
          <h1 className="brand-display page-title mt-1">History & analytics</h1>
          <p className="page-sub">
            Visual logs from SQLite — weeds detected, crops protected, and treatments over time.
          </p>
        </div>
        <Button variant="secondary" onClick={() => load()}>
          Refresh charts
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-4">
          <Metric label="Weeds logged" value={weeds} />
        </div>
        <div className="panel p-4">
          <Metric label="Crops logged" value={crops} />
        </div>
        <div className="panel p-4">
          <Metric label="Weeds treated" value={treated} />
        </div>
        <div className="panel p-4">
          <Metric
            label="This session"
            value={`${Number(stats.session_weeds_seen ?? 0)} weeds · ${Number(stats.session_weeds_treated ?? 0)} treated`}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Weed vs crop vs treated">
          <div className="h-72">
            {composition.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={composition} dataKey="value" nameKey="name" innerRadius={58} outerRadius={95} paddingAngle={3}>
                    {composition.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Run live vision or scan a sample image to fill this chart." />
            )}
          </div>
        </Panel>

        <Panel title="Daily weeds & treatments">
          <div className="h-72">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke={colors.muted} fontSize={12} />
                  <YAxis stroke={colors.muted} fontSize={12} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="weeds" name="Weeds" stroke={colors.accent} fill={colors.accent} fillOpacity={0.25} strokeWidth={2} />
                  <Area type="monotone" dataKey="treated" name="Treated" stroke={colors.treated} fill={colors.treated} fillOpacity={0.2} strokeWidth={2} />
                  <Area type="monotone" dataKey="total" name="All logs" stroke={colors.brand} fill={colors.brand} fillOpacity={0.08} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Daily trend appears after detections are logged." />
            )}
          </div>
        </Panel>

        <Panel title="Classes in recent logs">
          <div className="h-72">
            {classBars.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classBars} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
                  <XAxis type="number" stroke={colors.muted} fontSize={12} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} stroke={colors.muted} fontSize={11} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Count" fill={colors.brand} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Class breakdown fills from recent detection rows." />
            )}
          </div>
        </Panel>

        <Panel title="Confidence buckets">
          <div className="h-72">
            {confData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={confData}>
                  <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" stroke={colors.muted} fontSize={11} />
                  <YAxis stroke={colors.muted} fontSize={12} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Detections" fill={colors.crop} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Confidence histogram fills as detections are stored." />
            )}
          </div>
        </Panel>
      </div>

      {outcome.length ? (
        <Panel title="Treatment outcome mix">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={outcome} dataKey="value" nameKey="name" outerRadius={85}>
                  {outcome.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ) : null}

      <Panel title="Detection log (time · class · action)">
        <div className="max-h-[36vh] overflow-auto">
          <table className="w-full text-left text-base">
            <thead className="sticky top-0" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
              <tr>
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Class</th>
                <th className="px-2 py-2">Conf</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {detections.map((d) => (
                <tr key={String(d.id)} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="mono px-2 py-2 text-sm">{String(d.ts || '').slice(11, 19)}</td>
                  <td className="px-2 py-2 font-semibold" style={{ color: d.role === 'weed' ? 'var(--accent)' : 'var(--brand)' }}>
                    {String(d.role || '—')}
                  </td>
                  <td className="px-2 py-2">{String(d.class_name || '—')}</td>
                  <td className="mono px-2 py-2 text-sm">
                    {d.confidence != null ? `${(Number(d.confidence) * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-2 py-2" style={{ color: 'var(--text-soft)' }}>
                    {String(d.status || d.action || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {detections.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No detection rows yet. Run live vision or upload an image.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="System events">
        <div className="mb-4 flex flex-wrap gap-2">
          <select className="select max-w-xs" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
            <option value="critical">critical</option>
          </select>
          <input
            className="input max-w-sm"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search history"
          />
          <Button onClick={() => load()}>Filter</Button>
          <a className="btn btn-secondary" href="/api/logs/export.csv">
            Export CSV
          </a>
        </div>
        <div className="max-h-[40vh] overflow-auto">
          <table className="w-full text-left text-base">
            <thead className="sticky top-0" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
              <tr>
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Severity</th>
                <th className="px-2 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="mono px-2 py-2 text-sm">{e.ts.slice(11, 19)}</td>
                  <td className="px-2 py-2">{e.event_type}</td>
                  <td className="px-2 py-2">{e.severity}</td>
                  <td className="px-2 py-2" style={{ color: 'var(--text-soft)' }}>
                    {e.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No events match this filter.
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
      {text}
    </div>
  )
}
