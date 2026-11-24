import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useAppStore, useSystem } from '../lib/store'
import { useTheme } from '../lib/theme'
import { Button } from './ui'
import { cn, formatDuration } from '../lib/utils'

const nav = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/live', label: 'Live Vision' },
  { to: '/app/robot', label: 'Robot' },
  { to: '/app/field', label: 'Field 3D' },
  { to: '/app/history', label: 'History' },
  { to: '/app/system', label: 'System' },
]

export function Layout() {
  const connect = useAppStore((s) => s.connect)
  const connected = useAppStore((s) => s.connected)
  const toast = useAppStore((s) => s.toast)
  const setToast = useAppStore((s) => s.setToast)
  const sys = useSystem()
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  const initTheme = useTheme((s) => s.init)
  const location = useLocation()
  const isIntro = location.pathname === '/' || location.pathname === '/intro'

  useEffect(() => {
    initTheme()
    connect()
  }, [connect, initTheme])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(t)
  }, [toast, setToast])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header
        className="sticky top-0 z-40 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-3" aria-label="WEEDELEO home">
            <img src="/weedeleo.svg" alt="" className="h-9 w-9" />
            <div>
              <div className="brand-display text-xl font-bold leading-none">WEEDELEO</div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>
                Field control
              </div>
            </div>
          </NavLink>

          {!isIntro ? (
            <nav className="flex flex-1 flex-wrap gap-1" aria-label="Main">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-full px-3 py-2 text-sm font-semibold',
                      isActive ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--text-soft)] hover:bg-[var(--bg-soft)]',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!isIntro ? (
              <>
                <span className="chip" title="Backend connection">
                  <span className={cn('dot', connected ? 'dot-ok' : 'dot-danger')} />
                  {connected ? 'Online' : 'Offline'}
                </span>
                <span className="chip mono">{sys.mode}</span>
                <span className="chip mono">{formatDuration(sys.session_duration_s)}</span>
              </>
            ) : (
              <NavLink to="/app" className="btn btn-secondary">
                Open dashboard
              </NavLink>
            )}
            <Button
              variant="secondary"
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              onClick={toggle}
              className="!min-h-11 !px-3"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === 'light' ? 'Dark' : 'Light'}</span>
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      {toast ? (
        <div
          role="status"
          className="panel fixed bottom-5 right-5 z-50 max-w-sm px-4 py-3 text-sm"
          style={{ color: 'var(--text)' }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
