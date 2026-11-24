import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { Badge, Button, Panel, StatCard } from '../components/ui'
import { num } from '../lib/utils'

export function MachinePage() {
  const sys = useSystem()
  const m = sys.machine
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">XY Actuation</div>
        <h1 className="mt-1 text-3xl font-bold">Machine Control</h1>
        <p className="mt-2 text-sm text-mist">{m.note}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={m.connected ? 'ok' : 'warn'}>{m.connected ? 'Connected' : 'Disconnected'}</Badge>
        <Badge tone={m.is_simulation ? 'warn' : 'idle'}>{m.is_simulation ? 'SIMULATION' : 'REAL LINK'}</Badge>
        <Button onClick={() => api.machineConnect().then(refresh).catch((e) => setToast(String(e)))}>Connect Pi</Button>
        <Button variant="secondary" onClick={() => api.machineSim(true).then(refresh)}>Enable simulation</Button>
        <Button variant="ghost" onClick={() => api.machineSim(false).then(refresh)}>Disable simulation</Button>
        <Button variant="secondary" onClick={() => api.machineHome().then(refresh)}>Home</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="X position" value={m.x_mm == null ? '—' : `${num(m.x_mm)} mm`} />
        <StatCard label="Y position" value={m.y_mm == null ? '—' : `${num(m.y_mm)} mm`} accent="crop" />
        <StatCard label="State" value={m.state} accent="amber" />
        <StatCard label="Head" value={m.treatment_head} />
      </div>
      <Panel title="Manual move (requires live mode + connection)">
        <ManualMove
          onMove={async (x, y) => {
            try {
              await api.machineMove(x, y)
              setToast('Move command sent')
              refresh()
            } catch (e) {
              setToast(e instanceof Error ? e.message : String(e))
            }
          }}
        />
        {m.fault ? <p className="mt-3 text-sm text-laser">Fault: {m.fault}</p> : null}
        {m.last_ack ? <p className="mt-2 font-mono text-xs text-mist">Last ack: {m.last_ack}</p> : null}
      </Panel>
    </div>
  )
}

function ManualMove({ onMove }: { onMove: (x: number, y: number) => void }) {
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        onMove(Number(fd.get('x')), Number(fd.get('y')))
      }}
    >
      <label className="text-xs text-mist">X mm
        <input name="x" type="number" step="0.1" defaultValue={0} className="mt-1 block rounded-lg bg-soil-900 px-3 py-2 font-mono" />
      </label>
      <label className="text-xs text-mist">Y mm
        <input name="y" type="number" step="0.1" defaultValue={0} className="mt-1 block rounded-lg bg-soil-900 px-3 py-2 font-mono" />
      </label>
      <Button type="submit">Move</Button>
    </form>
  )
}
