import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { Badge, Button, Panel } from '../components/ui'
import { formatDuration } from '../lib/utils'

interface Session {
  id: string
  started_at: string
  ended_at?: string | null
  mode: string
  status: string
  stats: Record<string, unknown>
}

export function TasksPage() {
  const sys = useSystem()
  const [sessions, setSessions] = useState<Session[]>([])
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)

  const load = () => api.sessions().then((r) => setSessions(r.sessions as Session[]))

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Sessions</div>
        <h1 className="mt-1 text-3xl font-bold">Task Management</h1>
      </div>
      <Panel title="Active session">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={sys.running ? 'ok' : 'idle'}>{sys.running ? 'RUNNING' : 'IDLE'}</Badge>
          <span className="font-mono text-sm">{sys.session_id || 'No active session'}</span>
          <span className="text-sm text-mist">{formatDuration(sys.session_duration_s)}</span>
          <Button
            onClick={async () => {
              await api.start()
              setToast('Session started')
              refresh()
              load()
            }}
          >
            Start session
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await api.stop()
              setToast('Session stopped')
              refresh()
              load()
            }}
          >
            Stop session
          </Button>
          <Button variant="ghost" onClick={() => api.reset().then(refresh)}>
            Reset view
          </Button>
        </div>
      </Panel>
      <Panel title="Previous sessions">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-mist">
              <tr>
                <th className="py-2">ID</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Started</th>
                <th>Ended</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-chlorophyll/10 font-mono text-xs">
                  <td className="py-2 pr-3">{s.id}</td>
                  <td>{s.mode}</td>
                  <td>{s.status}</td>
                  <td>{s.started_at}</td>
                  <td>{s.ended_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sessions.length === 0 ? <p className="text-sm text-mist">No sessions recorded yet.</p> : null}
        </div>
      </Panel>
    </div>
  )
}
