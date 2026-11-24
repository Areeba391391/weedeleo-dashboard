import { useSystem } from '../lib/store'
import { Badge, Panel, StatCard, Unavailable } from '../components/ui'
import { formatDuration, num, pct } from '../lib/utils'

export function PiPage() {
  const sys = useSystem()
  const pi = sys.pi
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Control Unit</div>
        <h1 className="mt-1 text-3xl font-bold">Raspberry Pi Monitoring</h1>
        <p className="mt-2 text-sm text-mist">{pi.note}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={pi.remote_pi_connected ? 'ok' : 'warn'}>
          Remote Pi {pi.remote_pi_connected ? 'connected' : 'not linked'}
        </Badge>
        <Badge tone="info">Source: {pi.source}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CPU" value={pi.cpu_percent == null ? '—' : pct(pi.cpu_percent)} />
        <StatCard label="RAM" value={pi.ram_percent == null ? '—' : pct(pi.ram_percent)} accent="crop" />
        <StatCard label="Temp" value={pi.cpu_temp_c == null ? '—' : `${num(pi.cpu_temp_c)}°C`} accent="amber" />
        <StatCard label="Inference FPS" value={pi.inference_fps == null ? '—' : num(pi.inference_fps)} />
      </div>
      <Panel title="Status detail">
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div><dt className="text-mist">Online</dt><dd>{pi.online ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-mist">Uptime</dt><dd>{pi.uptime_s == null ? <Unavailable /> : formatDuration(pi.uptime_s)}</dd></div>
          <div><dt className="text-mist">Camera</dt><dd>{pi.camera_status}</dd></div>
          <div><dt className="text-mist">Model</dt><dd>{pi.model_status}</dd></div>
          <div><dt className="text-mist">Last response</dt><dd>{pi.last_response_s == null ? <Unavailable /> : new Date(pi.last_response_s * 1000).toLocaleTimeString()}</dd></div>
        </dl>
      </Panel>
    </div>
  )
}
