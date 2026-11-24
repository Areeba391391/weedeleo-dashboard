import { Float, Grid, Html, OrbitControls, Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group, Mesh } from 'three'
import type { Detection } from '../lib/types'

export type WorldMode = 'overview' | 'field' | 'robot' | 'live'

type RobotPose = {
  x_m?: number
  y_m?: number
  heading_deg?: number
  path?: { x: number; y: number }[]
  is_simulation?: boolean
}

function FieldTerrain() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#1a3326" roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[5.2, 5.35, 64]} />
        <meshStandardMaterial color="#c4a574" emissive="#7a5a3a" emissiveIntensity={0.15} />
      </mesh>
      <Grid
        args={[18, 18]}
        cellSize={0.5}
        sectionSize={2.5}
        cellColor="#2f5a42"
        sectionColor="#c4a574"
        fadeDistance={22}
        infiniteGrid={false}
      />
    </group>
  )
}

function CropRows() {
  const rows = useMemo(() => {
    const out: { x: number; z: number; h: number }[] = []
    for (let r = -3; r <= 3; r++) {
      for (let c = -6; c <= 6; c++) {
        if (Math.abs(c) < 1.2 && Math.abs(r) < 0.8) continue
        out.push({ x: c * 0.85, z: r * 1.4, h: 0.25 + ((c + r) % 3) * 0.08 })
      }
    }
    return out
  }, [])

  return (
    <group>
      {rows.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]} castShadow>
          <cylinderGeometry args={[0.05, 0.08, p.h, 6]} />
          <meshStandardMaterial color={i % 5 === 0 ? "#3d7a4f" : "#2f6b45"} />
        </mesh>
      ))}
    </group>
  )
}

function Gantry({
  x = 0,
  z = 0,
  highlighted,
}: {
  x?: number
  z?: number
  highlighted?: boolean
}) {
  const ref = useRef<Group>(null)
  useFrame((state) => {
    if (!ref.current || !highlighted) return
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.03
  })

  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[-2.4, 1.2, 0]}>
        <boxGeometry args={[0.08, 2.4, 0.08]} />
        <meshStandardMaterial color="#d7c4a3" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[2.4, 1.2, 0]}>
        <boxGeometry args={[0.08, 2.4, 0.08]} />
        <meshStandardMaterial color="#d7c4a3" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <boxGeometry args={[5, 0.1, 0.1]} />
        <meshStandardMaterial color="#e8d7b8" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[0.12, 1.3, 0.12]} />
        <meshStandardMaterial color={highlighted ? '#f0b429' : '#9aa89a'} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 0.28, 16]} />
        <meshStandardMaterial
          color="#c23b2e"
          emissive="#c23b2e"
          emissiveIntensity={highlighted ? 0.45 : 0.15}
        />
      </mesh>
    </group>
  )
}

function Rover({ x = 0, z = 0, heading = 0 }: { x?: number; z?: number; heading?: number }) {
  return (
    <group position={[x, 0.18, z]} rotation={[0, (heading * Math.PI) / 180, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.7, 0.28, 0.9]} />
        <meshStandardMaterial color="#24352c" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.28, -0.1]}>
        <boxGeometry args={[0.45, 0.18, 0.35]} />
        <meshStandardMaterial color="#c4a574" />
      </mesh>
      <mesh position={[0, 0.42, -0.05]}>
        <boxGeometry args={[0.2, 0.12, 0.16]} />
        <meshStandardMaterial color="#8fd3a8" emissive="#2f6b4a" emissiveIntensity={0.25} />
      </mesh>
      {[
        [-0.32, -0.12, 0.28],
        [0.32, -0.12, 0.28],
        [-0.32, -0.12, -0.28],
        [0.32, -0.12, -0.28],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.1, 12]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      ))}
    </group>
  )
}

function DetectionMarkers({
  detections,
  frameW,
  frameH,
  selectedId,
}: {
  detections: Detection[]
  frameW: number
  frameH: number
  selectedId?: number | null
}) {
  return (
    <group>
      {detections.map((d) => {
        const hasMm = d.workspace_x_mm != null && d.workspace_y_mm != null
        const x = hasMm
          ? ((d.workspace_x_mm! / 400) - 0.5) * 8
          : ((d.cx / Math.max(1, frameW)) - 0.5) * 8
        const z = hasMm
          ? ((d.workspace_y_mm! / 400) - 0.5) * 8
          : ((d.cy / Math.max(1, frameH)) - 0.5) * 8
        const weed = d.role === 'weed' || d.treatable
        const selected = selectedId === d.id
        return (
          <Float key={d.id} speed={selected ? 3 : 1.2} floatIntensity={selected ? 0.6 : 0.2}>
            <mesh position={[x, selected ? 0.55 : 0.35, z]}>
              <sphereGeometry args={[selected ? 0.18 : 0.12, 16, 16]} />
              <meshStandardMaterial
                color={weed ? '#c45c1a' : '#3ecf6e'}
                emissive={weed ? '#c45c1a' : '#3ecf6e'}
                emissiveIntensity={selected ? 0.7 : 0.25}
              />
            </mesh>
            {selected ? (
              <Html distanceFactor={10} position={[x, 1.0, z]} center>
                <div className="rounded-sm border border-[#c4a574]/40 bg-[#121a16]/90 px-2 py-1 font-mono text-[10px] text-[#f7f4ec]">
                  {d.class_name} {(d.confidence * 100).toFixed(0)}%
                </div>
              </Html>
            ) : null}
          </Float>
        )
      })}
    </group>
  )
}

function PathLine({ path }: { path?: { x: number; y: number }[] }) {
  const points = useMemo(() => {
    if (!path || path.length < 2) return null
    return path.map((p) => [p.x * 1.2, 0.05, -p.y * 1.2] as [number, number, number])
  }, [path])

  if (!points) return null
  // simple segment meshes to avoid Line dependency issues
  return (
    <group>
      {points.slice(1).map((p, i) => {
        const a = points[i]
        const mid: [number, number, number] = [(a[0] + p[0]) / 2, 0.06, (a[2] + p[2]) / 2]
        const dx = p[0] - a[0]
        const dz = p[2] - a[2]
        const len = Math.hypot(dx, dz) || 0.01
        const rot = Math.atan2(dx, dz)
        return (
          <mesh key={i} position={mid} rotation={[0, rot, 0]}>
            <boxGeometry args={[0.04, 0.02, len]} />
            <meshStandardMaterial color="#c4a574" emissive="#7a5a3a" emissiveIntensity={0.2} />
          </mesh>
        )
      })}
    </group>
  )
}

function HeroBrand({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.25}>
      <Html position={[0, 3.1, -3.6]} center transform distanceFactor={8}>
        <div className="select-none text-center">
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 54,
              fontWeight: 700,
              color: '#f3ecdf',
              letterSpacing: '-0.03em',
              textShadow: '0 10px 40px rgba(0,0,0,0.45)',
            }}
          >
            WEEDELEO
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              letterSpacing: '0.22em',
              color: '#c4a574',
            }}
          >
            FIELD VISION SYSTEMS
          </div>
        </div>
      </Html>
    </Float>
  )
}

function ScanningRing() {
  const ref = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.35
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <ringGeometry args={[3.6, 3.72, 64]} />
      <meshStandardMaterial color="#8fd3a8" transparent opacity={0.35} />
    </mesh>
  )
}

export function WeedeleoWorld({
  mode = 'overview',
  detections = [],
  frameW = 640,
  frameH = 480,
  selectedId,
  robot,
  autoRotate = false,
}: {
  mode?: WorldMode
  detections?: Detection[]
  frameW?: number
  frameH?: number
  selectedId?: number | null
  robot?: RobotPose
  autoRotate?: boolean
}) {
  const roverX = (robot?.x_m ?? 0) * 1.2
  const roverZ = -(robot?.y_m ?? 0) * 1.2
  const showGantry = mode === 'overview' || mode === 'live' || mode === 'field'
  const showRover = mode === 'overview' || mode === 'robot' || mode === 'field'

  return (
    <>
      <color attach="background" args={['#0b1210']} />
      <fog attach="fog" args={['#0b1210', 10, 28]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        position={[6, 10, 4]}
        intensity={1.35}
        color="#ffe2b8"
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-5, 4, -3]} intensity={0.35} color="#7eb6ff" />
      <pointLight position={[0, 4, 0]} intensity={0.4} color="#c4a574" />

      <FieldTerrain />
      <CropRows />
      <ScanningRing />
      <Sparkles count={40} scale={[14, 3, 14]} size={2} speed={0.4} color="#c4a574" opacity={0.45} />
      <HeroBrand show={mode === 'overview'} />

      {showGantry ? <Gantry x={0} z={0} highlighted={mode === 'live'} /> : null}
      {showRover ? (
        <Rover x={roverX} z={roverZ} heading={robot?.heading_deg ?? 0} />
      ) : null}
      <PathLine path={robot?.path} />
      <DetectionMarkers
        detections={detections}
        frameW={frameW}
        frameH={frameH}
        selectedId={selectedId}
      />

      <OrbitControls
        makeDefault
        enablePan
        autoRotate={autoRotate}
        autoRotateSpeed={0.45}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={4}
        maxDistance={18}
        target={[0, 0.6, 0]}
      />
    </>
  )
}
