import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAppStore } from '../lib/store'
import { Button } from './ui'

type MediaItem = { filename: string; size_bytes: number }

export function SampleVideos({ onPicked }: { onPicked?: () => void }) {
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [items, setItems] = useState<MediaItem[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await api.videos()
    const list =
      r.items ??
      (r.videos || []).map((filename) => ({
        filename,
        size_bytes: 0,
        active: false,
      }))
    setItems(list.filter((i) => i.filename.toLowerCase().startsWith('sample_')))
  }, [])

  useEffect(() => {
    let cancelled = false
    let attempt = 0
    const run = () => {
      load()
        .then(() => {
          attempt = 0
        })
        .catch(() => {
          if (cancelled || attempt >= 4) return
          attempt += 1
          window.setTimeout(run, 600 * attempt)
        })
    }
    run()
    return () => {
      cancelled = true
    }
  }, [load])

  async function pick(filename: string) {
    setBusy(true)
    try {
      await api.setMode('test_video')
      await api.selectVideo(filename)
      await api.start()
      setToast(`Playing sample: ${filename}`)
      await refresh()
      onPicked?.()
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--muted)' }}>No sample videos found yet.</p>
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <button
          key={item.filename}
          type="button"
          disabled={busy}
          onClick={() => pick(item.filename)}
          className="rounded-xl border px-3 py-3 text-left text-sm font-semibold transition hover:bg-[var(--bg-soft)]"
          style={{ borderColor: 'var(--line)', color: 'var(--text)' }}
        >
          {item.filename.replace(/^sample_/, '').replace(/\.mp4$/i, '')}
          <div className="mt-1 text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Click to load & start
          </div>
        </button>
      ))}
    </div>
  )
}

export function SampleImages({
  onResult,
}: {
  onResult?: (r: {
    filename: string
    weeds: number
    crops: number
    inference_ms?: number
    detections?: { id: number; class_name: string; confidence: number; role?: string; treatable?: boolean }[]
    annotated_jpeg_base64: string
  }) => void
}) {
  const setToast = useAppStore((s) => s.setToast)
  const [items, setItems] = useState<MediaItem[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await api.images()
    setItems(r.items ?? r.images ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    let attempt = 0
    const run = () => {
      load()
        .then(() => {
          attempt = 0
        })
        .catch(() => {
          if (cancelled || attempt >= 4) return
          attempt += 1
          window.setTimeout(run, 600 * attempt)
        })
    }
    run()
    return () => {
      cancelled = true
    }
  }, [load])

  async function scan(filename: string) {
    setBusy(true)
    try {
      const res = (await api.detectSampleImage(filename)) as {
        filename: string
        weeds: number
        crops: number
        inference_ms?: number
        detections?: { id: number; class_name: string; confidence: number; role?: string; treatable?: boolean }[]
        annotated_jpeg_base64: string
      }
      setToast(`Sample scan: ${res.weeds} weed(s), ${res.crops} crop(s)`)
      onResult?.(res)
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--muted)' }}>No sample pictures found yet.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.filename}
          type="button"
          disabled={busy}
          onClick={() => scan(item.filename)}
          className="overflow-hidden rounded-xl border text-left"
          style={{ borderColor: 'var(--line)' }}
        >
          <img
            src={api.sampleImageUrl(item.filename)}
            alt={item.filename}
            className="h-24 w-full object-cover"
          />
          <div className="px-2 py-2 text-xs font-semibold" style={{ color: 'var(--text)' }}>
            {item.filename.replace(/^sample_/, '').replace(/\.(jpg|jpeg|png|webp)$/i, '')}
          </div>
          <div className="px-2 pb-2">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--brand)' }}>
              {busy ? 'Scanning…' : 'Detect'}
            </span>
          </div>
        </button>
      ))}
      <div className="col-span-full">
        <Button variant="ghost" className="!min-h-9 !text-sm" disabled={busy} onClick={() => load().catch(() => undefined)}>
          Refresh samples
        </Button>
      </div>
    </div>
  )
}
