import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark'

interface ThemeStore {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  toggle: () => void
  init: () => void
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export const useTheme = create<ThemeStore>((set, get) => ({
  theme: 'light',
  setTheme: (theme) => {
    localStorage.setItem('weedeleo-theme', theme)
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    get().setTheme(next)
  },
  init: () => {
    const saved = localStorage.getItem('weedeleo-theme') as ThemeMode | null
    const theme = saved === 'dark' || saved === 'light' ? saved : 'light'
    applyTheme(theme)
    set({ theme })
  },
}))
