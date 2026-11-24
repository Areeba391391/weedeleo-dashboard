import { Canvas } from '@react-three/fiber'
import { Suspense, type ReactNode } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { ErrorBoundary } from '../components/ErrorBoundary'

/** Reliable Canvas — sized to fill parent, capped DPR, clear error UI. */
export function FastCanvas({
  children,
  className,
  camera = [5, 3.8, 5] as [number, number, number],
}: {
  children: ReactNode
  className?: string
  camera?: [number, number, number]
}) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 280,
        background: 'var(--bg-soft)',
        overflow: 'hidden',
      }}
    >
      <ErrorBoundary
        fallback={
          <div className="flex h-full min-h-[280px] items-center justify-center p-6 text-center text-sm" style={{ color: 'var(--text-soft)' }}>
            3D preview failed to start. Refresh the page — the rest of the dashboard still works.
          </div>
        }
      >
        <Canvas
          shadows
          dpr={[1, 1.25]}
          frameloop="always"
          camera={{ position: camera, fov: 40, near: 0.1, far: 80 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
            failIfMajorPerformanceCaveat: false,
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          onCreated={({ gl }) => {
            gl.setClearColor('#d7e3d4', 1)
          }}
        >
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      </ErrorBoundary>
    </div>
  )
}
