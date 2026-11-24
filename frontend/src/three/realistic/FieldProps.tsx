import { useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useTheme } from '../../lib/theme'

function seeded(seed: number) {
  let s = (seed % 2147483646) + 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function useSoilTexture() {
  return useMemo(() => {
    const n = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = n
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(n, n)
    const rand = seeded(19)
    for (let i = 0; i < n * n; i++) {
      const g = rand()
      const o = i * 4
      img.data[o] = 110 + g * 70
      img.data[o + 1] = 78 + g * 45
      img.data[o + 2] = 45 + g * 25
      img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 3)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

export function SceneAtmosphere({ variant = 'field' }: { variant?: 'field' | 'lab' | 'lane' }) {
  const theme = useTheme((s) => s.theme)
  const light = theme === 'light'
  const sky = light ? (variant === 'lab' ? '#e2ebe4' : '#c5dcc8') : '#0f1612'

  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 8, 22]} />
      <ambientLight intensity={light ? 0.55 : 0.35} />
      <hemisphereLight args={[light ? '#eaf2ff' : '#2a3540', light ? '#8a6a40' : '#1a140e', 0.55]} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={light ? 1.35 : 0.95}
        color={light ? '#fff1d6' : '#d0dcff'}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={20}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0002}
      />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={14} blur={2.5} far={6} />
    </>
  )
}

export function SoilBed({
  size = 5,
  raised = true,
  surrounds = true,
}: {
  size?: number
  raised?: boolean
  surrounds?: boolean
  repeat?: number
}) {
  const theme = useTheme((s) => s.theme)
  const map = useSoilTexture()

  return (
    <group>
      {surrounds ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[size * 2.2, size * 2.2]} />
          <meshStandardMaterial color={theme === 'light' ? '#6d9260' : '#243528'} roughness={0.95} />
        </mesh>
      ) : null}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial map={map} color={theme === 'light' ? '#c9a882' : '#9a7d5c'} roughness={0.95} metalness={0.02} />
      </mesh>
      {raised
        ? [
            [0, 0.12, size / 2, size + 0.16, 0.26, 0.12],
            [0, 0.12, -size / 2, size + 0.16, 0.26, 0.12],
            [size / 2, 0.12, 0, 0.12, 0.26, size],
            [-size / 2, 0.12, 0, 0.12, 0.26, size],
          ].map((v, i) => (
            <mesh key={i} position={[v[0], v[1], v[2]]} castShadow>
              <boxGeometry args={[v[3], v[4], v[5]]} />
              <meshStandardMaterial color={theme === 'light' ? '#8b7355' : '#5c4a38'} roughness={0.85} />
            </mesh>
          ))
        : null}
    </group>
  )
}

export function Plant({
  position,
  kind = 'crop',
  scale = 1,
  sway = true,
  seed = 1,
  treated = false,
}: {
  position: [number, number, number]
  kind?: 'crop' | 'weed'
  scale?: number
  sway?: boolean
  seed?: number
  treated?: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const phase = seed * 1.3

  useFrame((state) => {
    if (!ref.current) return
    if (treated && kind === 'weed') {
      ref.current.scale.setScalar(0.55 * scale)
      ref.current.rotation.z = 0.7
      return
    }
    if (!sway) return
    const t = state.clock.elapsedTime
    ref.current.rotation.z = Math.sin(t * 1.1 + phase) * 0.04
    ref.current.rotation.x = Math.cos(t * 0.85 + phase) * 0.025
  })

  if (kind === 'weed') {
    const green = treated ? '#7a5c38' : '#5f7a28'
    return (
      <group ref={ref} position={position} scale={scale}>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.02, 0.2, 6]} />
          <meshStandardMaterial color={treated ? '#6b5344' : '#4d5e28'} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            position={[Math.cos(i) * 0.07, 0.14 + (i % 3) * 0.03, Math.sin(i) * 0.07]}
            rotation={[0.7, i, 0.2]}
            castShadow
          >
            <sphereGeometry args={[0.065, 8, 8]} />
            <meshStandardMaterial color={green} roughness={0.85} />
          </mesh>
        ))}
        {treated ? (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.12, 16]} />
            <meshStandardMaterial color="#1c1917" transparent opacity={0.55} />
          </mesh>
        ) : null}
      </group>
    )
  }

  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.025, 0.36, 7]} />
        <meshStandardMaterial color="#3a6b38" />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          position={[Math.cos((i * Math.PI) / 3) * 0.1, 0.2, Math.sin((i * Math.PI) / 3) * 0.1]}
          rotation={[1.0, (i * Math.PI) / 3, 0]}
          castShadow
        >
          <coneGeometry args={[0.08, 0.2, 6]} />
          <meshStandardMaterial color={i % 2 ? '#2f8f45' : '#1f6b34'} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 0.38, 0]} castShadow>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color="#c2410c" roughness={0.45} />
      </mesh>
      <mesh position={[0.04, 0.35, 0.02]} castShadow>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color="#ea580c" roughness={0.5} />
      </mesh>
    </group>
  )
}

export function GrassTuft({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos(i) * 0.02, 0.07, Math.sin(i) * 0.02]} rotation={[0.35, i, 0.1]} castShadow>
          <coneGeometry args={[0.012, 0.14, 4]} />
          <meshStandardMaterial color={i % 2 ? '#4d7c3f' : '#3a6b32'} />
        </mesh>
      ))}
    </group>
  )
}

export function GantrySystem({
  headRef,
  railSpan = 4.4,
  height = 1.15,
  active = false,
  treating = false,
}: {
  headRef?: RefObject<THREE.Group | null>
  railSpan?: number
  height?: number
  active?: boolean
  treating?: boolean
}) {
  const theme = useTheme((s) => s.theme)
  const steel = theme === 'light' ? '#7d8796' : '#9aa3b2'
  const tipMat = useRef<THREE.MeshStandardMaterial>(null)
  const beamMat = useRef<THREE.MeshStandardMaterial>(null)
  const internal = useRef<THREE.Group>(null)
  const carriage = headRef ?? internal

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (tipMat.current) tipMat.current.emissiveIntensity = treating ? 1.0 + Math.sin(t * 10) * 0.3 : active ? 0.3 : 0.12
    if (beamMat.current) beamMat.current.opacity = treating ? 0.65 : active ? 0.18 : 0
  })

  const posts = [
    [-railSpan / 2, height / 2, -railSpan / 2],
    [railSpan / 2, height / 2, -railSpan / 2],
    [-railSpan / 2, height / 2, railSpan / 2],
    [railSpan / 2, height / 2, railSpan / 2],
  ]

  return (
    <group>
      {posts.map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.08, height, 0.08]} />
          <meshStandardMaterial color={steel} metalness={0.7} roughness={0.28} />
        </mesh>
      ))}
      {[-railSpan / 2, railSpan / 2].map((z, i) => (
        <mesh key={i} position={[0, height, z]} castShadow>
          <boxGeometry args={[railSpan + 0.1, 0.06, 0.09]} />
          <meshStandardMaterial color={steel} metalness={0.75} roughness={0.25} />
        </mesh>
      ))}
      <group ref={carriage} position={[0, height, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.1, 0.08, railSpan]} />
          <meshStandardMaterial color="#1f2937" metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.1, 0]} castShadow>
          <boxGeometry args={[0.26, 0.14, 0.26]} />
          <meshStandardMaterial color="#374151" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.48, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.6, 12]} />
          <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.82, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.075, 0.12, 12]} />
          <meshStandardMaterial color="#111827" metalness={0.75} roughness={0.2} />
        </mesh>
        <mesh position={[0, -0.92, 0]} castShadow>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshStandardMaterial ref={tipMat} color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, -1.18, 0]}>
          <cylinderGeometry args={[0.005, treating ? 0.02 : 0.01, 0.45, 8]} />
          <meshStandardMaterial
            ref={beamMat}
            color="#ff4d2e"
            transparent
            opacity={0}
            emissive="#ff2a00"
            emissiveIntensity={1}
            depthWrite={false}
          />
        </mesh>
        {treating ? (
          <mesh position={[0, -1.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.06, 0.16, 20]} />
            <meshStandardMaterial color="#ff6b4a" emissive="#ff3b1f" emissiveIntensity={0.8} transparent opacity={0.7} />
          </mesh>
        ) : null}
      </group>
    </group>
  )
}

export function FieldRover({
  groupRef,
  scale = 1,
}: {
  groupRef?: RefObject<THREE.Group | null>
  scale?: number
}) {
  const theme = useTheme((s) => s.theme)
  const green = theme === 'light' ? '#15803d' : '#4ade80'
  const wheels = useRef<(THREE.Group | null)[]>([null, null, null, null])

  useFrame((_, dt) => {
    for (const w of wheels.current) if (w) w.rotation.x += dt * 2.2
  })

  return (
    <group ref={groupRef} scale={scale} position={[0, 0.24, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.92, 0.28, 1.25]} />
        <meshStandardMaterial color="#2a313b" metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.22, -0.05]} castShadow>
        <boxGeometry args={[0.55, 0.18, 0.7]} />
        <meshStandardMaterial color="#b45309" metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.48, 0.15]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 0.45, 10]} />
        <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.74, 0.15]} castShadow>
        <boxGeometry args={[0.18, 0.1, 0.14]} />
        <meshStandardMaterial color="#0b1220" />
      </mesh>
      <mesh position={[0, 0.74, 0.24]}>
        <cylinderGeometry args={[0.035, 0.035, 0.04, 12]} />
        <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0.3, 0.32, -0.35]} rotation={[0.4, 0, 0.15]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.4]} />
        <meshStandardMaterial color="#6b7280" metalness={0.55} />
      </mesh>
      <mesh position={[0.32, 0.14, -0.55]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.1, 10]} />
        <meshStandardMaterial color={green} emissive={green} emissiveIntensity={0.2} />
      </mesh>
      {[
        [-0.48, -0.08, 0.42],
        [0.48, -0.08, 0.42],
        [-0.48, -0.08, -0.42],
        [0.48, -0.08, -0.42],
      ].map((p, i) => (
        <group
          key={i}
          position={p as [number, number, number]}
          ref={(el) => {
            wheels.current[i] = el
          }}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.14, 14]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.14, 0.64]}>
        <boxGeometry args={[0.35, 0.03, 0.02]} />
        <meshStandardMaterial color={green} emissive={green} emissiveIntensity={0.55} />
      </mesh>
    </group>
  )
}

export function DetectionMarker({
  position,
  weed,
  selected,
  seed = 1,
  treated = false,
  treating = false,
}: {
  position: [number, number, number]
  weed: boolean
  selected?: boolean
  seed?: number
  treated?: boolean
  treating?: boolean
  showLabel?: boolean
}) {
  return (
    <group position={position}>
      <Plant
        kind={weed ? 'weed' : 'crop'}
        position={[0, 0, 0]}
        scale={selected || treating ? 1.12 : 1}
        sway={!treated}
        seed={seed}
        treated={treated}
      />
      {treating ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.12, 0.2, 24]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.7} transparent opacity={0.85} />
        </mesh>
      ) : null}
    </group>
  )
}

/** Gantry hunts weeds and wilts them — no HTML overlays. */
export function WeedHuntController({
  headRef,
  plants,
  treatingRef,
}: {
  headRef: RefObject<THREE.Group | null>
  plants: { id: string; pos: [number, number, number]; weed: boolean; seed: number }[]
  treatingRef?: RefObject<boolean>
}) {
  const [treated, setTreated] = useState<Record<string, boolean>>({})
  const [treatingId, setTreatingId] = useState<string | null>(null)
  const hold = useRef(0)
  const resetAt = useRef(0)
  const lastId = useRef<string | null>(null)

  useFrame((state, dt) => {
    if (!headRef.current) return
    if (treatingRef) treatingRef.current = treatingId != null

    const alive = plants.filter((p) => p.weed && !treated[p.id])
    const target = alive[0]
    if (!target) {
      headRef.current.position.x += (0 - headRef.current.position.x) * Math.min(1, dt * 1.4)
      headRef.current.position.z += (0 - headRef.current.position.z) * Math.min(1, dt * 1.4)
      headRef.current.position.y = 1.15
      if (treatingId) setTreatingId(null)
      if (!resetAt.current) resetAt.current = state.clock.elapsedTime + 3
      if (state.clock.elapsedTime > resetAt.current) {
        setTreated({})
        resetAt.current = 0
      }
      return
    }
    resetAt.current = 0
    headRef.current.position.x += (target.pos[0] - headRef.current.position.x) * Math.min(1, dt * 2.2)
    headRef.current.position.z += (target.pos[2] - headRef.current.position.z) * Math.min(1, dt * 2.2)
    headRef.current.position.y = 1.15
    const dist = Math.hypot(headRef.current.position.x - target.pos[0], headRef.current.position.z - target.pos[2])
    if (dist < 0.18) {
      if (lastId.current !== target.id) {
        lastId.current = target.id
        setTreatingId(target.id)
        hold.current = 0
      }
      hold.current += dt
      if (hold.current > 1.2) {
        setTreated((t) => ({ ...t, [target.id]: true }))
        setTreatingId(null)
        lastId.current = null
        hold.current = 0
      }
    }
  })

  return (
    <>
      {plants.map((p) => (
        <DetectionMarker
          key={p.id}
          position={p.pos}
          weed={p.weed}
          seed={p.seed}
          treated={!!treated[p.id]}
          treating={treatingId === p.id}
        />
      ))}
    </>
  )
}

export function SafeOrbit({
  target = [0, 0.3, 0] as [number, number, number],
  autoRotate = false,
  min = 3.2,
  max = 10,
}: {
  target?: [number, number, number]
  autoRotate?: boolean
  min?: number
  max?: number
}) {
  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={min}
      maxDistance={max}
      autoRotate={autoRotate}
      autoRotateSpeed={0.3}
      target={target}
    />
  )
}
