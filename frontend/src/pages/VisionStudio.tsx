import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { VideoFeed } from '../components/VideoFeed'
import { Badge, Button, Panel, StatCard } from '../components/ui'

export function VisionStudio({ forceMode }: { forceMode?: 'live' | 'test_video' }) {
  const sys = useSystem()
  const detections = useAppStore((s) => s.detections)
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [videos, setVideos] = useState<string[]>([])
  const [conf, setConf] = useState(sys.conf_threshold)

  useEffect(() => {
    api.videos().then((r) => setVideos(r.videos)).catch(() => undefined)
  }, [])

  useEffect(() => {
    setConf(sys.conf_threshold)
  }, [sys.conf_threshold])

  useEffect(() => {
    if (!forceMode) return
    api.setMode(forceMode).then(refresh).catch((e) => setToast(String(e.message || e)))
  }, [forceMode, refresh, setToast])

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mist">Computer Vision</div>
        <h1 className="mt-1 text-3xl font-bold text-fog">AI Vision Studio</h1>
        <p className="mt-2 text-sm text-mist">
          Live inference with your trained WEEDELEO detector. Test Video never arms treatment hardware.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={sys.mode === 'live' || sys.mode === 'running' ? 'primary' : 'secondary'}
          onClick={() => api.setMode('live').then(refresh)}
        >
          Live Camera
        </Button>
        <Button
          variant={sys.mode === 'test_video' ? 'primary' : 'secondary'}
          onClick={() => api.setMode('test_video').then(refresh)}
        >
          Test Video
        </Button>
        <Badge tone={sys.mode === 'test_video' ? 'warn' : 'info'}>
          {sys.mode === 'test_video' ? 'Software-only testing' : 'Hardware-capable mode'}
        </Badge>
        <Badge tone={sys.model_loaded ? 'ok' : 'danger'}>
          {sys.model_loaded ? `Loaded: ${sys.model_name}` : 'Model missing'}
        </Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Inference viewport">
          <VideoFeed detections={detections} onSelectDetection={(id) => api.selectTarget(id).then(refresh)} />
        </Panel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Weeds" value={detections.filter((d) => d.treatable).length} accent="laser" />
            <StatCard label="Non-weeds" value={detections.filter((d) => !d.treatable).length} accent="crop" />
            <StatCard label="FPS" value={sys.fps.toFixed(1)} />
            <StatCard label="Confidence" value={conf.toFixed(2)} accent="amber" />
          </div>
          <Panel title="Confidence threshold">
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={conf}
              onChange={(e) => setConf(Number(e.target.value))}
              className="w-full accent-chlorophyll"
            />
            <div className="mt-2 flex justify-between text-xs text-mist">
              <span>{conf.toFixed(2)}</span>
              <Button
                className="!py-1 !text-xs"
                onClick={() => api.setConfidence(conf).then(() => setToast('Threshold updated')).then(refresh)}
              >
                Apply
              </Button>
            </div>
          </Panel>
          <Panel title="Test videos">
            <div className="space-y-2">
              {videos.length === 0 ? (
                <p className="text-sm text-mist">No uploaded videos yet.</p>
              ) : (
                videos.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="block w-full rounded-lg border border-chlorophyll/15 bg-soil-900/50 px-3 py-2 text-left text-sm hover:border-chlorophyll/40"
                    onClick={() => api.selectVideo(v).then(refresh)}
                  >
                    {v}
                  </button>
                ))
              )}
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-chlorophyll/30 px-3 py-3 text-sm text-chlorophyll">
                <Upload className="h-4 w-4" /> Upload video
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    await api.uploadVideo(f)
                    const list = await api.videos()
                    setVideos(list.videos)
                    setToast(`Uploaded ${f.name}`)
                  }}
                />
              </label>
            </div>
          </Panel>
          <Panel title="Detection list">
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {detections.length === 0 ? (
                <p className="text-sm text-mist">No detections in current frame.</p>
              ) : (
                detections.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-soil-900/60 px-3 py-2 text-sm">
                    <span className="font-mono">
                      #{d.id} {d.class_name}
                    </span>
                    <span className="text-mist">{(d.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
