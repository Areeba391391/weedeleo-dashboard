import { lazy, Suspense } from 'react'
import type { Detection } from '../lib/types'
import { ErrorBoundary } from './ErrorBoundary'

const Workspace3D = lazy(() =>
  import('./Workspace3D').then((m) => ({ default: m.Workspace3D })),
)

export function Workspace3DLazy({ detections }: { detections: Detection[] }) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-[420px] items-center justify-center rounded-2xl border border-chlorophyll/15 bg-soil-950 text-sm text-mist">
            Loading 3D workspace…
          </div>
        }
      >
        <Workspace3D detections={detections} />
      </Suspense>
    </ErrorBoundary>
  )
}
