import { useState } from 'react'
import { api } from '../lib/api'
import type { WorkingArea } from '../lib/types'
import { useAppStore, useSystem } from '../lib/store'
import { VideoFeed } from '../components/VideoFeed'
import { Badge, Button, Panel, StatCard } from '../components/ui'

export function WorkingAreaPage() {
  const sys = useSystem()
  const detections = useAppStore((s) => s.detections)
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [draft, setDraft] = useState<WorkingArea | null>(sys.working_area ?? null)

  const inside = detections.filter((d) => d.inside_workspace === true).length
  const outside = detections.filter((d) => d.inside_workspace === false).length

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Workspace Geometry</div>
        <h1 className="mt-1 text-3xl font-bold">Working Area Management</h1>
        <p className="mt-2 text-sm text-mist">Drag on the video to define the approved treatment rectangle. Targets outside it are never treated.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            if (!draft) return setToast('Draw an area first')
            await api.setArea(draft)
            setToast('Working area set')
            refresh()
          }}
        >
          Set Area
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await api.clearArea()
            setDraft(null)
            setToast('Working area cleared')
            refresh()
          }}
        >
          Clear
        </Button>
        <Badge tone={sys.working_area?.active ? 'ok' : 'warn'}>
          {sys.working_area?.active ? 'Area active' : 'No area'}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Inside" value={inside} />
        <StatCard label="Outside" value={outside} accent="amber" />
        <StatCard
          label="Normalised rect"
          value={draft ? `${draft.w.toFixed(2)}×${draft.h.toFixed(2)}` : '—'}
          accent="crop"
        />
      </div>
      <Panel title="Draw working area on video">
        <VideoFeed interactiveArea draftArea={draft} onDraftArea={setDraft} detections={detections} />
      </Panel>
      {draft ? (
        <Panel title="Area parameters">
          <div className="grid gap-3 sm:grid-cols-4 font-mono text-sm">
            <label>x<input className="mt-1 w-full rounded-lg bg-soil-900 px-2 py-1" type="number" step="0.01" value={draft.x} onChange={(e) => setDraft({ ...draft, x: Number(e.target.value) })} /></label>
            <label>y<input className="mt-1 w-full rounded-lg bg-soil-900 px-2 py-1" type="number" step="0.01" value={draft.y} onChange={(e) => setDraft({ ...draft, y: Number(e.target.value) })} /></label>
            <label>w<input className="mt-1 w-full rounded-lg bg-soil-900 px-2 py-1" type="number" step="0.01" value={draft.w} onChange={(e) => setDraft({ ...draft, w: Number(e.target.value) })} /></label>
            <label>h<input className="mt-1 w-full rounded-lg bg-soil-900 px-2 py-1" type="number" step="0.01" value={draft.h} onChange={(e) => setDraft({ ...draft, h: Number(e.target.value) })} /></label>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
