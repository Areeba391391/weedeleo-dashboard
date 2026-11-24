import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

export function Panel({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
}) {
  return (
    <section className={cn('panel p-4 md:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}) {
  return (
    <button className={cn('btn', `btn-${variant}`, className)} {...props}>
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = 'idle',
}: {
  children: ReactNode
  tone?: 'ok' | 'warn' | 'danger' | 'idle' | 'info'
}) {
  const styles: Record<string, React.CSSProperties> = {
    ok: { background: 'var(--brand-soft)', color: 'var(--ok)', borderColor: 'var(--line)' },
    warn: { background: 'var(--accent-soft)', color: 'var(--warn)', borderColor: 'var(--line)' },
    danger: { background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'var(--line)' },
    idle: { background: 'var(--surface-2)', color: 'var(--muted)', borderColor: 'var(--line)' },
    info: { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--line)' },
  }
  return (
    <span className="chip" style={styles[tone]}>
      {children}
    </span>
  )
}

export function StatusPill({
  label,
  state,
}: {
  label: string
  state: 'ready' | 'warn' | 'error' | 'idle' | 'sim'
}) {
  const map = {
    ready: { cls: 'dot-ok', word: 'Ready' },
    warn: { cls: 'dot-warn', word: 'Warning' },
    error: { cls: 'dot-danger', word: 'Error' },
    idle: { cls: '', word: 'Idle' },
    sim: { cls: 'dot-warn', word: 'Simulation' },
  }[state]
  return (
    <span className="chip" aria-label={`${label} ${map.word}`}>
      <span className={cn('dot', map.cls)} />
      <span>{label}</span>
      <strong className="mono text-xs">{map.word}</strong>
    </span>
  )
}

export function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="mono mt-1 text-2xl font-bold" style={{ color: 'var(--text)' }}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-sm" style={{ color: 'var(--text-soft)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export function StatCard(props: { label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <div className="panel p-4">
      <Metric {...props} />
    </div>
  )
}

export function Unavailable({ label = 'Unavailable' }: { label?: string }) {
  return <span className="mono" style={{ color: 'var(--muted)' }}>{label}</span>
}
