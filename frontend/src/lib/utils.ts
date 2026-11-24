import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number) {
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function pct(v?: number | null) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${v.toFixed(0)}%`
}

export function num(v?: number | null, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toFixed(digits)
}
