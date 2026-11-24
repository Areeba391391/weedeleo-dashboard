export type SystemMode = 'idle' | 'live' | 'test_video' | 'running' | 'stopped' | 'estop'

export type TargetStatus =
  | 'detected'
  | 'selected'
  | 'localised'
  | 'commanded'
  | 'acknowledged'
  | 'completed'
  | 'verified'
  | 'skipped'

export interface Detection {
  id: number
  class_name: string
  class_id: number
  role?: 'weed' | 'crop' | string
  confidence: number
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
  treatable: boolean
  inside_workspace?: boolean | null
  workspace_x_mm?: number | null
  workspace_y_mm?: number | null
  status: TargetStatus
  skip_reason?: string | null
  tracking_id?: number | null
}

export interface WorkingArea {
  x: number
  y: number
  w: number
  h: number
  active: boolean
}

export interface CalibrationPoint {
  image_x: number
  image_y: number
  workspace_x_mm: number
  workspace_y_mm: number
  label?: string
}

export interface CalibrationState {
  valid: boolean
  points: CalibrationPoint[]
  rms_error_mm?: number | null
  method?: string | null
  created_at?: string | null
  note?: string
}

export interface SafetyState {
  treatment_allowed: boolean
  reasons: string[]
  estop: boolean
  enclosure_closed: boolean
  interlock_ok: boolean
  camera_ok: boolean
  comm_ok: boolean
  calibration_valid: boolean
  working_area_set: boolean
  mode_safe: boolean
  fault_active: boolean
  last_safety_event?: string | null
}

export interface DetectionStats {
  total: number
  weeds: number
  non_weeds: number
  inside_workspace: number
  treated: number
  skipped: number
  fps: number
  session_detections: number
}

export interface MachineState {
  connected: boolean
  is_simulation: boolean
  state: string
  x_mm?: number | null
  y_mm?: number | null
  positioning: boolean
  treatment_head: string
  fault?: string | null
  last_ack?: string | null
  note: string
}

export interface CommState {
  active_link: 'wifi' | 'bluetooth' | 'none'
  wifi_connected: boolean
  bluetooth_connected: boolean
  last_heartbeat_s?: number | null
  failures: number
  note: string
}

export interface PiTelemetry {
  remote_pi_connected: boolean
  source: 'local_host' | 'remote_pi' | 'unavailable'
  online: boolean
  cpu_percent?: number | null
  ram_percent?: number | null
  cpu_temp_c?: number | null
  uptime_s?: number | null
  camera_status: string
  model_status: string
  inference_fps?: number | null
  last_response_s?: number | null
  note: string
}

export interface SystemState {
  app_name: string
  version: string
  mode: SystemMode
  running: boolean
  session_id?: string | null
  session_duration_s: number
  model_loaded: boolean
  model_name: string
  model_classes: string[]
  conf_threshold: number
  frame_width: number
  frame_height: number
  camera_connected: boolean
  video_source?: string | null
  fps: number
  stats: DetectionStats
  safety: SafetyState
  calibration: CalibrationState
  working_area?: WorkingArea | null
  machine: MachineState
  comms: CommState
  pi: PiTelemetry
  selected_target_id?: number | null
}

export interface AppEvent {
  id: number
  ts: string
  severity: string
  event_type: string
  description: string
  session_id?: string | null
  target_id?: number | null
}
