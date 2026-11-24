import { Canvas } from '@react-three/fiber'
import { Grid, Html, OrbitControls, Line } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import type { Detection } from '../lib/types'
import { useSystem } from '../lib/store'

function mmToScene(x: number, y: number, width: number, height: number) {
  // Center workspace at origin; X right, Y depth
  return [(x / width - 0.5) * 4, 0.05, (y / height - 0.5) * 4] as [number, number, number]
}

function Gantry({ x, z, sim }: { x: number; z: number; sim: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.12, 2.2, 0.12]} />
        <meshStandardMaterial color={sim ? '#f0b429' : '#7cff9a'} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.3, 16]} />
        <meshStandardMaterial color="#ff5a3c" emissive="#ff5a3c" emissiveIntensity={0.35} />
      </mesh>
      <Html distanceFactor={8} position={[0, 2.4, 0]}>
        <div className="rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-chlorophyll">
          HEAD {sim ? '(SIM)' : ''}
        </div>
      </Html>
    </group>
  )
}

function Markers({
  detections,
  width,
  height,
  selectedId,
}: {
  detections: Detection[]
  width: number
  height: number
  selectedId?: number | null
}) {
  return (
    <>
      {detections.map((d) => {
        const hasMm = d.workspace_x_mm != null && d.workspace_y_mm != null
        // Fall back to normalised image mapping for visualisation only when uncalibrated
        const pos = hasMm
          ? mmToScene(d.workspace_x_mm!, d.workspace_y_mm!, width, height)
          : ([
              (d.cx / Math.max(1, 640) - 0.5) * 4,
              0.08,
              (d.cy / Math.max(1, 360) - 0.5) * 4,
            ] as [number, number, number])
        const selected = selectedId === d.id
        return (
          <mesh key={d.id} position={pos}>
            <sphereGeometry args={[selected ? 0.14 : 0.09, 16, 16]} />
            <meshStandardMaterial
              color={d.treatable ? '#ff5a3c' : '#4db6ff'}
              emissive={selected ? '#7cff9a' : d.treatable ? '#ff5a3c' : '#4db6ff'}
              emissiveIntensity={selected ? 0.8 : 0.25}
            />
            {selected ? (
              <Html distanceFactor={10}>
                <div className="rounded bg-soil-900/90 px-2 py-1 font-mono text-[10px] text-fog">
                  #{d.id} {hasMm ? `${d.workspace_x_mm!.toFixed(1)}×${d.workspace_y_mm!.toFixed(1)} mm` : 'uncalibrated'}
                </div>
              </Html>
            ) : null}
          </mesh>
        )
      })}
    </>
  )
}

function Scene({ detections }: { detections: Detection[] }) {
  const sys = useSystem()
  const width = 400
  const height = 400
  const gantry = useMemo(() => {
    if (sys.machine.x_mm == null || sys.machine.y_mm == null) return null
    const [x, , z] = mmToScene(sys.machine.x_mm, sys.machine.y_mm, width, height)
    return { x, z }
  }, [sys.machine.x_mm, sys.machine.y_mm])

  const area = sys.working_area
  const areaLine = useMemo(() => {
    if (!area?.active) return null
    // Visualise working area as fraction of workspace plane
    const x0 = (area.x - 0.5) * 4
    const z0 = (area.y - 0.5) * 4
    const x1 = (area.x + area.w - 0.5) * 4
    const z1 = (area.y + area.h - 0.5) * 4
    return [
      [x0, 0.02, z0],
      [x1, 0.02, z0],
      [x1, 0.02, z1],
      [x0, 0.02, z1],
      [x0, 0.02, z0],
    ] as [number, number, number][]
  }, [area])

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 2]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[4.4, 4.4]} />
        <meshStandardMaterial color="#163524" />
      </mesh>
      <Grid args={[4.4, 4.4]} cellSize={0.22} sectionSize={1.1} cellColor="#2f6b4f" sectionColor="#7cff9a" fadeDistance={18} />
      <Line
        points={[
          [-2.2, 0.03, -2.2],
          [2.2, 0.03, -2.2],
        ]}
        color="#7cff9a"
        lineWidth={2}
      />
      <Line
        points={[
          [-2.2, 0.03, -2.2],
          [-2.2, 0.03, 2.2],
        ]}
        color="#4db6ff"
        lineWidth={2}
      />
      <Html position={[2.3, 0.2, -2.2]} center>
        <span className="font-mono text-[10px] text-chlorophyll">+X</span>
      </Html>
      <Html position={[-2.2, 0.2, 2.3]} center>
        <span className="font-mono text-[10px] text-crop">+Y</span>
      </Html>
      {/* Camera reference */}
      <mesh position={[0, 2.6, -2.3]}>
        <boxGeometry args={[0.35, 0.2, 0.25]} />
        <meshStandardMaterial color="#d7e6dc" />
      </mesh>
      {areaLine ? <Line points={areaLine} color="#7cff9a" lineWidth={2} /> : null}
      <Markers
        detections={detections}
        width={width}
        height={height}
        selectedId={sys.selected_target_id}
      />
      {gantry ? (
        <Gantry x={gantry.x} z={gantry.z} sim={sys.machine.is_simulation} />
      ) : (
        <Html position={[0, 1.5, 0]} center>
          <div className="rounded border border-amber-signal/40 bg-black/70 px-3 py-2 text-center text-[11px] text-amber-signal">
            Machine position unavailable
            <div className="text-mist">Awaiting real telemetry or explicit simulation</div>
          </div>
        </Html>
      )}
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} />
    </>
  )
}

export function Workspace3D({ detections }: { detections: Detection[] }) {
  const sys = useSystem()
  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl border border-chlorophyll/15 bg-soil-950">
      <Canvas camera={{ position: [3.8, 3.2, 3.8], fov: 45 }}>
        <Suspense fallback={null}>
          <Scene detections={detections} />
        </Suspense>
      </Canvas>
      <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 text-[11px] text-mist">
        {sys.machine.is_simulation
          ? 'Visual simulation — not real hardware motion'
          : sys.machine.connected
            ? 'Synchronised with machine telemetry'
            : 'Markers use calibration mm when available; otherwise image-plane preview only'}
      </div>
    </div>
  )
}
