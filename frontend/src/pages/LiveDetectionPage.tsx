import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore, useSystem } from '../lib/store'
import { VideoFeed } from '../components/VideoFeed'
import { VideoPicker } from '../components/VideoPicker'
import { SampleImages, SampleVideos } from '../components/SampleMedia'
import { Badge, Button, Metric, Panel } from '../components/ui'
import { num } from '../lib/utils'

type ImageDet = {
  id: number
  class_name: string
  confidence: number
  role?: string
  treatable?: boolean
}

type ImageResult = {
  filename: string
  weeds: number
  crops: number
  inference_ms?: number
  detections?: ImageDet[]
  annotated_jpeg_base64: string
}

export function LiveDetectionPage() {
  const sys = useSystem() as ReturnType<typeof useSystem> & { inference_ms?: number }
  const detections = useAppStore((s) => s.detections)
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [conf, setConf] = useState(sys.conf_threshold)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageResult, setImageResult] = useState<ImageResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => setConf(sys.conf_threshold), [sys.conf_threshold])

  const viewingImage = imageResult != null
  const list = viewingImage ? imageResult.detections || [] : detections
  const weeds = list.filter((d) => d.role === 'weed' || d.treatable)
  const crops = list.filter((d) => !(d.role === 'weed' || d.treatable))
  const isLive = sys.mode === 'live' || sys.mode === 'running'
  const isVideo = sys.mode === 'test_video'

  function showResult(res: ImageResult) {
    setImageResult(res)
    setToast(`Image scan: ${res.weeds} weed(s), ${res.crops} crop(s)`)
    requestAnimationFrame(() => {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function onImage(files: FileList | null) {
    if (!files || !files[0]) return
    setImageBusy(true)
    try {
      const res = (await api.detectImage(files[0])) as ImageResult
      showResult(res)
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setImageBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--brand)' }}>
            Vision studio
          </p>
          <h1 className="brand-display page-title mt-1">Live Vision</h1>
          <p className="page-sub">
            Webcam or video for live detection — or scan a still photo. Image results show in the main display.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isLive && !viewingImage ? 'primary' : 'secondary'}
            onClick={() => {
              setImageResult(null)
              api.setMode('live').then(refresh).catch((e) => setToast(String(e.message || e)))
            }}
          >
            Webcam
          </Button>
          <Button
            variant={isVideo && !viewingImage ? 'primary' : 'secondary'}
            onClick={() => {
              setImageResult(null)
              api.setMode('test_video').then(refresh)
            }}
          >
            Video file
          </Button>
          <Button
            variant={viewingImage || imageBusy ? 'primary' : 'secondary'}
            disabled={imageBusy}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            {imageBusy ? 'Scanning…' : 'Scan image'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.bmp"
            className="hidden"
            disabled={imageBusy}
            onChange={(e) => onImage(e.target.files)}
          />
          <Button onClick={() => api.start().then(refresh).catch((e) => setToast(String(e.message || e)))}>
            Start
          </Button>
          <Button variant="secondary" onClick={() => api.stop().then(refresh)}>
            Stop
          </Button>
          {isVideo && !viewingImage ? <Badge tone="warn">Hardware isolated</Badge> : null}
          {viewingImage ? <Badge tone="ok">Still image</Badge> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.75fr]">
        <div ref={stageRef}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
            <span>{viewingImage ? 'Annotated still' : 'Live display'}</span>
            <span className="mono">
              {viewingImage
                ? `${imageResult.filename} · ${num(imageResult.inference_ms, 0)} ms`
                : `${sys.video_source || 'no source'} · ${num(sys.fps)} FPS`}
            </span>
          </div>
          <div className="panel overflow-hidden">
            {viewingImage ? (
              <div className="relative bg-black">
                <img
                  src={`data:image/jpeg;base64,${imageResult.annotated_jpeg_base64}`}
                  alt={`Annotated ${imageResult.filename}`}
                  className="max-h-[min(70vh,720px)] w-full object-contain"
                />
                <div className="absolute right-3 top-3 flex gap-2">
                  <Button
                    variant="secondary"
                    className="!min-h-9 !bg-[var(--surface)]/95"
                    onClick={() => setImageResult(null)}
                  >
                    <X className="h-4 w-4" />
                    Back to live
                  </Button>
                </div>
              </div>
            ) : (
              <VideoFeed
                detections={detections}
                onSelectDetection={(id) => api.selectTarget(id).then(refresh)}
                className="!rounded-none !border-0"
              />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="panel p-3">
              <Metric
                label="Inference"
                value={
                  viewingImage
                    ? imageResult.inference_ms != null
                      ? `${num(imageResult.inference_ms, 0)} ms`
                      : '—'
                    : sys.inference_ms != null
                      ? `${num(sys.inference_ms, 0)} ms`
                      : '—'
                }
              />
            </div>
            <div className="panel p-3">
              <Metric label="Crops" value={crops.length} />
            </div>
            <div className="panel p-3">
              <Metric label="Weeds" value={weeds.length} />
            </div>
            <div className="panel p-3">
              <Metric
                label="Feed"
                value={viewingImage ? 'IMAGE' : sys.camera_connected ? 'READY' : 'OFF'}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Panel title={viewingImage ? 'Detections in photo' : 'Detections in frame'}>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {list.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  No detections yet. Start webcam/video or scan a photo.
                </p>
              ) : (
                list.map((d) => {
                  const weed = d.role === 'weed' || d.treatable
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-base"
                      style={{ color: weed ? 'var(--accent)' : 'var(--brand)' }}
                      onClick={() => {
                        if (!viewingImage) api.selectTarget(d.id).then(refresh)
                      }}
                    >
                      <span className="font-semibold">{d.class_name}</span>
                      <span className="mono text-sm">{(d.confidence * 100).toFixed(0)}%</span>
                    </button>
                  )
                })
              )}
            </div>
          </Panel>

          <Panel title="Confidence threshold">
            <label className="sr-only" htmlFor="conf">
              Confidence
            </label>
            <input
              id="conf"
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={conf}
              onChange={(e) => setConf(Number(e.target.value))}
              onPointerUp={() => {
                api.setConfidence(conf).then(refresh).catch((e) => setToast(String(e.message || e)))
              }}
              onKeyUp={() => {
                api.setConfidence(conf).then(refresh).catch((e) => setToast(String(e.message || e)))
              }}
              className="w-full"
              style={{ accentColor: 'var(--brand)' }}
            />
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="mono text-base font-bold">{conf.toFixed(2)}</span>
              <Button
                className="!min-h-10"
                onClick={() =>
                  api.setConfidence(conf).then(refresh).catch((e) => setToast(String(e.message || e)))
                }
              >
                Apply
              </Button>
            </div>
            {conf >= 0.7 ? (
              <p className="mt-2 text-sm" style={{ color: 'var(--accent)' }}>
                High threshold hides most boxes — try ~0.35 for demos.
              </p>
            ) : null}
          </Panel>

          <Panel title="Upload photo (weeds / crops)">
            <p className="mb-3 text-sm" style={{ color: 'var(--text-soft)' }}>
              JPG, PNG, or WEBP — boxes appear in the main display above.
            </p>
            <Button disabled={imageBusy} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              {imageBusy ? 'Scanning…' : 'Choose image…'}
            </Button>
            {imageResult ? (
              <p className="mt-3 text-sm font-semibold">
                {imageResult.filename}: {imageResult.weeds} weed(s), {imageResult.crops} crop(s)
                {imageResult.inference_ms != null ? ` · ${num(imageResult.inference_ms, 0)} ms` : ''}
              </p>
            ) : null}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sample videos">
          <p className="mb-3 text-sm" style={{ color: 'var(--text-soft)' }}>
            Built-in demos (including the original test bed). Click one to load and start.
          </p>
          <SampleVideos
            onPicked={() => {
              setImageResult(null)
            }}
          />
        </Panel>
        <Panel title="Sample pictures">
          <p className="mb-3 text-sm" style={{ color: 'var(--text-soft)' }}>
            Click a photo — annotated result replaces the live feed above.
          </p>
          <SampleImages
            onResult={(r) => {
              showResult(r as ImageResult)
            }}
          />
        </Panel>
      </div>

      <Panel title="Your video library — upload or pick any file">
        <VideoPicker
          onChanged={() => {
            setImageResult(null)
          }}
        />
      </Panel>
    </div>
  )
}
