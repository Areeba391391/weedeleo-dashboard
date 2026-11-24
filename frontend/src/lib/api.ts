import type { CalibrationPoint, SystemState, WorkingArea } from './types'

const BASE = ''

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    let detail: unknown = res.statusText
    try {
      detail = await res.json()
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'object' ? JSON.stringify(detail) : String(detail))
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res as unknown as T
}

export const api = {
  status: () => req<SystemState>('/api/system/status'),
  setMode: (mode: 'idle' | 'live' | 'test_video') =>
    req<SystemState>('/api/system/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
  start: () => req('/api/system/start', { method: 'POST' }),
  stop: () => req('/api/system/stop', { method: 'POST' }),
  reset: () => req('/api/system/reset', { method: 'POST' }),
  estop: () => req('/api/system/estop', { method: 'POST' }),
  clearEstop: () => req('/api/system/estop/clear', { method: 'POST' }),

  detections: () => req<{ detections: unknown[]; fps: number }>('/api/detection/latest'),
  setConfidence: (threshold: number) =>
    req('/api/detection/confidence', { method: 'POST', body: JSON.stringify({ threshold }) }),

  getArea: () => req<{ area: WorkingArea | null }>('/api/workspace/area'),
  setArea: (area: WorkingArea) =>
    req('/api/workspace/area', { method: 'POST', body: JSON.stringify(area) }),
  clearArea: () => req('/api/workspace/area', { method: 'DELETE' }),

  calibration: () => req('/api/calibration/status'),
  setCalPoints: (points: CalibrationPoint[]) =>
    req('/api/calibration/points', { method: 'POST', body: JSON.stringify(points) }),
  computeCalibration: () => req('/api/calibration/compute', { method: 'POST' }),
  clearCalibration: () => req('/api/calibration', { method: 'DELETE' }),

  selectTarget: (id: number) => req(`/api/targets/${id}/select`, { method: 'POST' }),
  commandTarget: (id: number) =>
    req(`/api/targets/${id}/command`, { method: 'POST', body: JSON.stringify({ confirm: true }) }),

  machine: () => req('/api/machine/status'),
  machineConnect: () => req('/api/machine/connect', { method: 'POST' }),
  machineHome: () => req('/api/machine/home', { method: 'POST' }),
  machineSim: (enabled: boolean) =>
    req(`/api/machine/simulation?enabled=${enabled}`, { method: 'POST' }),
  machineMove: (x_mm: number, y_mm: number) =>
    req('/api/machine/move', { method: 'POST', body: JSON.stringify({ x_mm, y_mm }) }),

  safety: () => req('/api/safety/status'),
  setInterlock: (q: { enclosure_closed?: boolean; interlock_ok?: boolean; fault_active?: boolean }) => {
    const params = new URLSearchParams()
    Object.entries(q).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v))
    })
    return req(`/api/safety/interlock?${params}`, { method: 'POST' })
  },

  pi: () => req('/api/pi/telemetry'),
  comms: () => req('/api/comms/status'),

  sessions: () => req<{ sessions: unknown[] }>('/api/sessions'),
  analytics: () => req('/api/analytics/summary'),
  logs: (params?: Record<string, string | number>) => {
    const q = new URLSearchParams()
    Object.entries(params || {}).forEach(([k, v]) => q.set(k, String(v)))
    return req<{ events: unknown[] }>(`/api/logs?${q}`)
  },
  settings: () => req<Record<string, unknown>>('/api/settings'),
  updateSettings: (body: Record<string, unknown>) =>
    req('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),

  videos: () =>
    req<{
      videos: string[]
      items?: { filename: string; size_bytes: number; active: boolean }[]
      active?: string | null
    }>('/api/camera/videos'),
  selectVideo: (filename: string) =>
    req('/api/camera/video/select', { method: 'POST', body: JSON.stringify({ filename }) }),
  uploadVideo: async (file: File, autoSelect = true) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/camera/video/upload?auto_select=${autoSelect}`, {
      method: 'POST',
      body: fd,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  uploadVideos: async (files: File[]) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    const res = await fetch('/api/camera/video/upload-many', { method: 'POST', body: fd })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  detectImage: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/detection/image', { method: 'POST', body: fd })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  images: () =>
    req<{ images?: { filename: string; size_bytes: number }[]; items?: { filename: string; size_bytes: number }[] }>(
      '/api/camera/images',
    ),
  detectSampleImage: (filename: string) =>
    req<Record<string, unknown>>('/api/detection/image/sample', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),
  sampleImageUrl: (filename: string) => `/api/camera/images/${encodeURIComponent(filename)}`,
  detectionLogs: (params?: { role?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams()
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined) q.set(k, String(v))
    })
    return req<{ detections: Record<string, unknown>[] }>(`/api/logs/detections?${q}`)
  },

  model: () => req<Record<string, unknown>>('/api/model'),
  robotStatus: () => req<Record<string, unknown>>('/api/robot/status'),
  robotStart: () => req('/api/robot/start', { method: 'POST' }),
  robotStop: () => req('/api/robot/stop', { method: 'POST' }),
  robotMove: (direction: string) =>
    req(`/api/robot/move?direction=${encodeURIComponent(direction)}`, { method: 'POST' }),
  laserStatus: () => req<Record<string, unknown>>('/api/laser/status'),
  laserEnable: () => req('/api/laser/enable', { method: 'POST' }),
  laserDisable: () => req('/api/laser/disable', { method: 'POST' }),
  laserTest: () => req('/api/laser/test', { method: 'POST' }),
}

export function streamUrl() {
  return `/api/camera/stream?t=${Date.now()}`
}

export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}
