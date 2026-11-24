import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Panel } from '../components/ui'

interface Session {
  id: string
  started_at: string
  mode: string
  status: string
}

export function ReportsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  useEffect(() => {
    api.sessions().then((r) => setSessions(r.sessions as Session[])).catch(() => undefined)
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Documentation</div>
        <h1 className="mt-1 text-3xl font-bold">Task Reports</h1>
        <p className="mt-2 text-sm text-mist">
          Reports distinguish commanded, acknowledged, completed and verified treatment states. No unverified success claims.
        </p>
      </div>
      <Panel title="Downloadable session reports">
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-mist">No sessions available for reporting.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-chlorophyll/10 bg-soil-900/40 px-4 py-3"
              >
                <div>
                  <div className="font-mono text-sm text-chlorophyll">{s.id}</div>
                  <div className="text-xs text-mist">
                    {s.mode} · {s.status} · {s.started_at}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a className="rounded-lg bg-soil-700 px-3 py-1.5 text-sm" href={`/api/reports/${s.id}.csv`}>
                    CSV
                  </a>
                  <a className="rounded-lg bg-chlorophyll px-3 py-1.5 text-sm font-semibold text-soil-950" href={`/api/reports/${s.id}.pdf`}>
                    PDF
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
}
