import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { DetectionMarker, FieldRover, SafeOrbit, SceneAtmosphere, SoilBed } from '../realistic/FieldProps'
import { useTheme } from '../../lib/theme'

export function RobotScene({
  x = 0,
  y = 0,
  heading = 0,
}: {
  x?: number
  y?: number
  heading?: number
}) {
  const theme = useTheme((s) => s.theme)
  const rover = useRef<Group>(null)
  const targetX = x * 1.1
  const targetZ = -y * 1.1

  const rows = useMemo(
    () =>
      [-2.0, -0.65, 0.65, 2.0].flatMap((z, row) =>
        Array.from({ length: 6 }, (_, i) => ({
          key: `${row}-${i}`,
          pos: [-2.4 + i * 0.95, 0, z] as [number, number, number],
          weed: (i + row) % 4 === 0,
          seed: row * 10 + i,
        })),
      ),
    [],
  )

  useFrame((_, dt) => {
    if (!rover.current) return
    rover.current.position.x += (targetX - rover.current.position.x) * Math.min(1, dt * 3.2)
    rover.current.position.z += (targetZ - rover.current.position.z) * Math.min(1, dt * 3.2)
    const desired = (heading * Math.PI) / 180
    let diff = desired - rover.current.rotation.y
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    rover.current.rotation.y += diff * Math.min(1, dt * 4)
  })

  return (
    <>
      <SceneAtmosphere variant="lane" />
      <SoilBed size={9} raised={false} surrounds />
      {[-2.0, -0.65, 0.65, 2.0].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, z]} receiveShadow>
          <planeGeometry args={[8, 0.25]} />
          <meshStandardMaterial color={theme === 'light' ? '#5c4632' : '#3a2e22'} roughness={1} />
        </mesh>
      ))}
      {rows.map((r) => (
        <DetectionMarker key={r.key} position={r.pos} weed={r.weed} seed={r.seed} />
      ))}
      <FieldRover groupRef={rover} scale={1} />
      <SafeOrbit min={3.8} max={14} target={[0, 0.35, 0]} />
    </>
  )
}
