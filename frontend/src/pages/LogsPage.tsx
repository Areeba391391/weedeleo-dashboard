import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AppEvent } from '../lib/types'
import { Button, Panel } from '../components/ui'

export function LogsPage() {
  const [events, setEvents] = useState<AppEvent[]>([])
  const [severity, setSeverity] = useState('')
  const [q, setQ] = useState('')

  const load = () =>
    api
      .logs({
        ...(severity ? { severity } : {}),
        ...(q ? { q } : {}),
        limit: 300,
      })
      .then((r) => setEvents(r.events as AppEvent[]))

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">History</div>
        <h1 className="mt-1 text-3xl font-bold">Event Logs</h1>
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            className="rounded-lg bg-soil-900 px-3 py-2 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
            <option value="critical">critical</option>
          </select>
          <input
            className="rounded-lg bg-soil-900 px-3 py-2 text-sm"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button onClick={() => load()}>Filter</Button>
          <a
            className="inline-flex items-center rounded-xl bg-soil-700 px-3.5 py-2 text-sm font-semibold"
            href="/api/logs/export.csv"
          >
            Export CSV
          </a>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-soil-900 text-mist">
              <tr>
                <th className="py-2">Time</th>
                <th>Severity</th>
                <th>Type</th>
                <th>Description</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-chlorophyll/10 align-top">
                  <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{e.ts.replace('T', ' ').slice(0, 19)}</td>
                  <td className="pr-3 text-xs uppercase">{e.severity}</td>
                  <td className="pr-3 font-mono text-xs text-chlorophyll">{e.event_type}</td>
                  <td className="pr-3">{e.description}</td>
                  <td className="font-mono text-xs text-mist">{e.session_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
