import { useAppStore, useSystem } from '../lib/store'
import { Badge, Panel, StatCard } from '../components/ui'

export function CommsPage() {
  const sys = useSystem()
  const connected = useAppStore((s) => s.connected)
  const c = sys.comms
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Links</div>
        <h1 className="mt-1 text-3xl font-bold">Communication Management</h1>
        <p className="mt-2 text-sm text-mist">{c.note}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={c.active_link !== 'none' ? 'ok' : 'danger'}>Active: {c.active_link}</Badge>
        <Badge tone={c.wifi_connected ? 'ok' : 'warn'}>Wi-Fi {c.wifi_connected ? 'up' : 'down'}</Badge>
        <Badge tone={c.bluetooth_connected ? 'ok' : 'idle'}>
          Bluetooth {c.bluetooth_connected ? 'up' : 'standby on Pi'}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Failures" value={c.failures} accent="laser" />
        <StatCard
          label="Last heartbeat"
          value={c.last_heartbeat_s ? new Date(c.last_heartbeat_s * 1000).toLocaleTimeString() : '—'}
        />
        <StatCard label="Dashboard WS" value={connected ? 'linked' : 'down'} accent="crop" />
      </div>
      <Panel title="Architecture note">
        <p className="text-sm text-mist leading-relaxed">
          The browser communicates with the WEEDELEO control service over HTTP and WebSocket.
          Wi-Fi/Bluetooth failover between the operator network and the Raspberry Pi is managed by the Pi control unit.
          Browser Bluetooth APIs are not used to drive the laser module. Communication loss keeps treatment disabled through the control-unit safety gate.
        </p>
      </Panel>
    </div>
  )
}
