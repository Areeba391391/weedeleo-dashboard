import { create } from 'zustand'
import type { Detection, SystemState } from './types'
import { api, wsUrl } from './api'

interface AppStore {
  state: SystemState | null
  detections: Detection[]
  connected: boolean
  error: string | null
  toast: string | null
  setToast: (msg: string | null) => void
  connect: () => void
  refresh: () => Promise<void>
  disconnect: () => void
}

let socket: WebSocket | null = null
let reconnectTimer: number | undefined
let pingTimer: number | undefined

const fallbackState = (): SystemState => ({
  app_name: 'WEEDELEO',
  version: '1.0.0',
  mode: 'idle',
  running: false,
  session_duration_s: 0,
  model_loaded: false,
  model_name: '',
  model_classes: [],
  conf_threshold: 0.35,
  frame_width: 0,
  frame_height: 0,
  camera_connected: false,
  fps: 0,
  stats: {
    total: 0,
    weeds: 0,
    non_weeds: 0,
    inside_workspace: 0,
    treated: 0,
    skipped: 0,
    fps: 0,
    session_detections: 0,
  },
  safety: {
    treatment_allowed: false,
    reasons: ['Awaiting connection'],
    estop: false,
    enclosure_closed: true,
    interlock_ok: true,
    camera_ok: false,
    comm_ok: false,
    calibration_valid: false,
    working_area_set: false,
    mode_safe: false,
    fault_active: false,
  },
  calibration: { valid: false, points: [] },
  machine: {
    connected: false,
    is_simulation: false,
    state: 'disconnected',
    positioning: false,
    treatment_head: 'unknown',
    note: 'Disconnected',
  },
  comms: {
    active_link: 'none',
    wifi_connected: false,
    bluetooth_connected: false,
    failures: 0,
    note: '',
  },
  pi: {
    remote_pi_connected: false,
    source: 'unavailable',
    online: false,
    camera_status: 'unknown',
    model_status: 'unknown',
    note: '',
  },
})

export const useAppStore = create<AppStore>((set, get) => ({
  state: null,
  detections: [],
  connected: false,
  error: null,
  toast: null,
  setToast: (msg) => set({ toast: msg }),

  refresh: async () => {
    try {
      const state = await api.status()
      set({ state, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  connect: () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }
    get().refresh()
    const url = wsUrl()
    socket = new WebSocket(url)

    socket.onopen = () => {
      set({ connected: true, error: null })
      window.clearInterval(pingTimer)
      pingTimer = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
      }, 15000)
    }

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'state' || msg.type === 'hello') {
          const nextDets = Array.isArray(msg.detections)
            ? (msg.detections as Detection[])
            : Array.isArray((msg.payload as { detections?: Detection[] } | undefined)?.detections)
              ? ((msg.payload as { detections: Detection[] }).detections)
              : get().detections
          set({
            state: msg.payload as SystemState,
            detections: nextDets,
          })
        }
      } catch {
        /* ignore */
      }
    }

    socket.onclose = () => {
      set({ connected: false })
      window.clearInterval(pingTimer)
      window.clearTimeout(reconnectTimer)
      reconnectTimer = window.setTimeout(() => get().connect(), 1500)
    }

    socket.onerror = () => {
      set({ error: 'WebSocket connection error' })
    }
  },

  disconnect: () => {
    window.clearTimeout(reconnectTimer)
    window.clearInterval(pingTimer)
    socket?.close()
    socket = null
  },
}))

export function useSystem(): SystemState {
  return useAppStore((s) => s.state) ?? fallbackState()
}
