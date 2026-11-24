import { FolderOpen, RefreshCw, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAppStore } from '../lib/store'
import { Button } from './ui'
import { cn } from '../lib/utils'

type VideoItem = { filename: string; size_bytes: number; active: boolean }

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function VideoPicker({ onChanged }: { onChanged?: () => void }) {
  const setToast = useAppStore((s) => s.setToast)
  const refresh = useAppStore((s) => s.refresh)
  const [items, setItems] = useState<VideoItem[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    const r = await api.videos()
    const list =
      r.items ??
      (r.videos || []).map((filename) => ({
        filename,
        size_bytes: 0,
        active: r.active === filename,
      }))
    setItems(list)
    setActive(r.active ?? list.find((i) => i.active)?.filename ?? null)
  }, [])

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  const filtered = items.filter((i) => i.filename.toLowerCase().includes(query.toLowerCase()))

  async function select(filename: string) {
    setBusy(true)
    try {
      await api.setMode('test_video')
      await api.selectVideo(filename)
      setActive(filename)
      setToast(`Loaded ${filename}`)
      await refresh()
      await load()
      onChanged?.()
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    try {
      const files = Array.from(fileList)
      if (files.length === 1) {
        const res = (await api.uploadVideo(files[0], true)) as { filename?: string }
        setToast(`Selected ${res.filename || files[0].name}`)
      } else {
        const res = (await api.uploadVideos(files)) as { selected?: string; uploaded?: string[] }
        setToast(`Uploaded ${res.uploaded?.length ?? files.length} videos`)
      }
      await refresh()
      await load()
      onChanged?.()
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-primary cursor-pointer">
          <FolderOpen className="h-4 w-4" />
          Choose video…
          <input
            type="file"
            accept="video/*,.mp4,.avi,.mov,.mkv,.webm"
            className="hidden"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        <label className="btn btn-secondary cursor-pointer">
          <Upload className="h-4 w-4" />
          Upload many
          <input
            type="file"
            accept="video/*,.mp4,.avi,.mov,.mkv,.webm"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        <Button variant="ghost" className="!px-3" disabled={busy} onClick={() => load()} aria-label="Refresh video list">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
        Active: <span className="mono font-semibold" style={{ color: 'var(--text)' }}>{active || 'none selected'}</span>
      </p>

      {items.length > 0 ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter videos…"
            className="input"
            aria-label="Filter videos"
          />
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border p-1" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            {filtered.map((item) => (
              <button
                key={item.filename}
                type="button"
                disabled={busy}
                onClick={() => select(item.filename)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-base transition',
                  item.filename === active ? 'font-bold' : 'font-medium',
                )}
                style={{
                  background: item.filename === active ? 'var(--brand-soft)' : 'transparent',
                  color: item.filename === active ? 'var(--brand)' : 'var(--text)',
                }}
              >
                <span className="truncate">{item.filename}</span>
                <span className="mono shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
                  {item.size_bytes ? formatBytes(item.size_bytes) : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div
          className="rounded-xl border border-dashed px-3 py-6 text-center text-base"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          No videos yet. Use Choose video… to pick any file from your computer.
        </div>
      )}
    </div>
  )
}
