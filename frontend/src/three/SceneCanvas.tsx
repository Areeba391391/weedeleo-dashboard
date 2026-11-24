import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { WeedeleoWorld, type WorldMode } from './WeedeleoWorld'
import type { Detection } from '../lib/types'

type RobotPose = {
  x_m?: number
  y_m?: number
  heading_deg?: number
  path?: { x: number; y: number }[]
  is_simulation?: boolean
}

export function SceneCanvas({
  mode = 'overview',
  detections = [],
  frameW,
  frameH,
  selectedId,
  robot,
  autoRotate,
  className,
  cameraPosition = [7.5, 5.2, 7.5],
}: {
  mode?: WorldMode
  detections?: Detection[]
  frameW?: number
  frameH?: number
  selectedId?: number | null
  robot?: RobotPose
  autoRotate?: boolean
  className?: string
  cameraPosition?: [number, number, number]
}) {
  return (
    <div className={className ?? 'h-full w-full'}>
      <ErrorBoundary
        fallback={
          <div className="flex h-full items-center justify-center bg-[#0b1210] text-sm text-[#c4a574]">
            3D view unavailable on this device — core controls still work.
          </div>
        }
      >
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: cameraPosition, fov: 42, near: 0.1, far: 80 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            <WeedeleoWorld
              mode={mode}
              detections={detections}
              frameW={frameW}
              frameH={frameH}
              selectedId={selectedId}
              robot={robot}
              autoRotate={autoRotate}
            />
            <EffectComposer>
              <Bloom intensity={0.35} luminanceThreshold={0.85} mipmapBlur />
              <Vignette offset={0.25} darkness={0.55} />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </ErrorBoundary>
    </div>
  )
}
