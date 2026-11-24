import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[WEEDELEO 3D]', error)
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center text-sm" style={{ color: 'var(--text-soft)' }}>
            3D view unavailable. Refresh the page — detection and controls still work.
            <div className="mono mt-2 text-xs" style={{ color: 'var(--muted)' }}>
              {this.state.error.message}
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
