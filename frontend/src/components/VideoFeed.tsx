import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { streamUrl } from '../lib/api'
import type { Detection, WorkingArea } from '../lib/types'
import { useAppStore, useSystem } from '../lib/store'
import { cn } from '../lib/utils'

interface Props {
  showOverlay?: boolean
  interactiveArea?: boolean
  draftArea?: WorkingArea | null
  onDraftArea?: (area: WorkingArea | null) => void
  onSelectDetection?: (id: number) => void
  className?: string
  detections?: Detection[]
}

interface LayoutBox {
  scale: number
  dispW: number
  dispH: number
  offX: number
  offY: number
}

export function VideoFeed({
  showOverlay = true,
  interactiveArea = false,
  draftArea,
  onDraftArea,
  onSelectDetection,
  className,
  detections: detsProp,
}: Props) {
  const sys = useSystem()
  const storeDets = useAppStore((s) => s.detections)
  const detections = detsProp ?? storeDets
  const imgRef = useRef<HTMLImageElement>(null)
  const [src, setSrc] = useState(streamUrl())
  const [layout, setLayout] = useState<LayoutBox | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    setSrc(streamUrl())
  }, [sys.mode, sys.video_source, sys.camera_connected])

  const frame = useMemo(
    () => ({
      w: Math.max(1, sys.frame_width || 640),
      h: Math.max(1, sys.frame_height || 360),
    }),
    [sys.frame_width, sys.frame_height],
  )

  useLayoutEffect(() => {
    const el = imgRef.current
    if (!el) return

    const measure = () => {
      const r = el.getBoundingClientRect()
      const scale = Math.min(r.width / frame.w, r.height / frame.h)
      const dispW = frame.w * scale
      const dispH = frame.h * scale
      setLayout({
        scale,
        dispW,
        dispH,
        offX: (r.width - dispW) / 2,
        offY: (r.height - dispH) / 2,
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [frame.w, frame.h, src])

  function toNorm(clientX: number, clientY: number) {
    const el = imgRef.current
    if (!el || !layout) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const x = (clientX - r.left - layout.offX) / layout.dispW
    const y = (clientY - r.top - layout.offY) / layout.dispH
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
  }

  function boxStyle(d: Detection) {
    if (!layout) return { display: 'none' as const }
    return {
      left: layout.offX + (d.x1 / frame.w) * layout.dispW,
      top: layout.offY + (d.y1 / frame.h) * layout.dispH,
      width: ((d.x2 - d.x1) / frame.w) * layout.dispW,
      height: ((d.y2 - d.y1) / frame.h) * layout.dispH,
    }
  }

  function areaStyle(area: WorkingArea) {
    if (!layout) return { display: 'none' as const }
    return {
      left: layout.offX + area.x * layout.dispW,
      top: layout.offY + area.y * layout.dispH,
      width: area.w * layout.dispW,
      height: area.h * layout.dispH,
    }
  }

  const area = draftArea ?? sys.working_area ?? null

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-chlorophyll/15 bg-black', className)}>
      <img
        ref={imgRef}
        src={src}
        alt="WEEDELEO camera feed"
        className="aspect-video w-full object-contain"
        onLoad={() => {
          const el = imgRef.current
          if (!el) return
          const r = el.getBoundingClientRect()
          const scale = Math.min(r.width / frame.w, r.height / frame.h)
          const dispW = frame.w * scale
          const dispH = frame.h * scale
          setLayout({
            scale,
            dispW,
            dispH,
            offX: (r.width - dispW) / 2,
            offY: (r.height - dispH) / 2,
          })
        }}
        onError={() => setSrc(streamUrl())}
        onMouseDown={(e) => {
          if (!interactiveArea || !onDraftArea) return
          const p = toNorm(e.clientX, e.clientY)
          drag.current = p
          onDraftArea({ x: p.x, y: p.y, w: 0.01, h: 0.01, active: true })
        }}
        onMouseMove={(e) => {
          if (!interactiveArea || !drag.current || !onDraftArea) return
          const p = toNorm(e.clientX, e.clientY)
          const x = Math.min(drag.current.x, p.x)
          const y = Math.min(drag.current.y, p.y)
          const w = Math.abs(p.x - drag.current.x)
          const h = Math.abs(p.y - drag.current.y)
          onDraftArea({ x, y, w: Math.max(0.01, w), h: Math.max(0.01, h), active: true })
        }}
        onMouseUp={() => {
          drag.current = null
        }}
      />

      {showOverlay && (
        <div className="pointer-events-none absolute inset-0">
          {area && area.active ? (
            <div className="absolute border-2 border-chlorophyll/80 bg-chlorophyll/10" style={areaStyle(area)} />
          ) : null}
          {detections.map((d) => (
            <button
              key={d.id}
              type="button"
              className={cn(
                'pointer-events-auto absolute border-2 bg-transparent text-left',
                (d.role === 'weed' || d.treatable) ? 'border-weed' : 'border-crop',
                sys.selected_target_id === d.id && 'ring-2 ring-field',
              )}
              style={boxStyle(d)}
              onClick={() => onSelectDetection?.(d.id)}
              title={`#${d.id} ${d.class_name}`}
            >
              <span
                className={cn(
                  'absolute -top-5 left-0 whitespace-nowrap rounded px-1 font-mono text-[10px] text-white',
                  (d.role === 'weed' || d.treatable) ? 'bg-weed' : 'bg-crop',
                )}
              >
                {d.class_name.toUpperCase()} {(d.confidence * 100).toFixed(0)}%
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="absolute left-3 top-3 flex gap-2">
        <span className="rounded-md bg-black/60 px-2 py-1 font-mono text-[11px] text-white">
          {sys.fps.toFixed(1)} FPS
        </span>
        <span className="rounded-md bg-black/60 px-2 py-1 font-mono text-[11px] text-white">
          {sys.mode === 'test_video'
            ? 'TEST VIDEO'
            : sys.mode === 'live' || sys.mode === 'running'
              ? 'LIVE'
              : 'IDLE'}
        </span>
      </div>
    </div>
  )
}
